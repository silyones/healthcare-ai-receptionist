import json
import os
import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from livekit.agents import Agent, AgentSession, JobContext, RunContext, WorkerOptions, cli
from livekit.agents.llm import function_tool
from livekit.plugins import cartesia, deepgram, groq

from db import SessionLocal, init_db
from tool_events import emit_tool_event
from tools import (
    book_appointment,
    cancel_appointment,
    end_conversation,
    fetch_slots,
    identify_user,
    modify_appointment,
    retrieve_appointments,
)

load_dotenv(Path(__file__).parent / ".env")
logger = logging.getLogger(__name__)

EN_VOICE = os.getenv("CARTESIA_VOICE_EN", "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc")
HI_VOICE = os.getenv("CARTESIA_VOICE_HI", "0f14d8cb-f039-41fe-a813-a9b4bee7eed8")

def _clinic_timezone() -> ZoneInfo:
    tz_name = os.getenv("CLINIC_TIMEZONE", "Asia/Kolkata")
    try:
        return ZoneInfo(tz_name)
    except Exception:
        return ZoneInfo("UTC")


def build_system_prompt() -> str:
    now = datetime.now(_clinic_timezone())
    today_iso = now.strftime("%Y-%m-%d")
    today_display = now.strftime("%B %d, %Y")
    time_display = now.strftime("%I:%M %p").replace(" 0", " ")
    tz_label = now.tzname() or os.getenv("CLINIC_TIMEZONE", "Asia/Kolkata")

    return f"""You are Aria, a clinic front-desk AI. Be brief. Always identify user by phone first. Then help book, check, modify or cancel appointments. Confirm details before any action. One sentence responses only.

Conversation flow (follow in order):
1) First ask for the user's name and phone number.
2) After getting both, ask: can I book an appointment for you?
3) If user says yes, collect date/time and book exactly as user requests.
4) Do not skip steps, and do not book before step 2 is completed.
5) When user provides their name, acknowledge simply as: "Okay <name>, can I help you schedule an appointment?" Do not mention profile status, records, or internal system details.

Current date and time (authoritative — use for all scheduling):
- Today is {now.strftime("%A")}, {today_display} ({today_iso})
- Current time: {time_display} ({tz_label})
- Current year: {now.year}

Scheduling rules:
- Use the current date and time above when interpreting "today", "tomorrow", "next week", or any relative date.
- Pass dates to tools as YYYY-MM-DD. Never book or reschedule appointments in the past.
- If the user does not specify a year, assume {now.year}.
- IMPORTANT: Never call identify_user_tool until the user has actually spoken their phone number. Wait for the user to say digits before calling any tool.
- CRITICAL: You must NEVER write tool calls as text in your response. NEVER output <function=...> in your speech. Only use the actual function calling mechanism. If you need to call a tool, call it silently and then speak the result to the user.
- If identify_user_tool returns name as null, ask the user for their real name before booking.

Voice output rules (everything you say is spoken aloud by Cartesia Sonic TTS):
- Use full sentences with normal capitalization and end each reply with . ? or !
- Write times with a space before AM/PM, like 10:00 AM or 2:00 PM.
- Write dates in MM/DD/YYYY when speaking to the user.
- For confirmation codes or reference numbers, use <spell>...</spell> tags or space-delimited characters.
- Do not use markdown, bullet lists, JSON, emoji, or symbols that sound awkward when read aloud.
- Keep responses short and conversational for a stable clinic reception experience."""


@dataclass
class ClinicUserData:
    user_id: int | None = None
    room_name: str = ""
    phone: str = ""


def _room_name(ctx: RunContext[ClinicUserData]) -> str:
    return ctx.userdata.room_name


def _format_display_date(date: str) -> str:
    try:
        return datetime.strptime(date, "%Y-%m-%d").strftime("%B %d")
    except ValueError:
        return date


def _is_placeholder_phone(phone_number: str) -> bool:
    value = (phone_number or "").strip().lower()
    if not value:
        return True
    if "your phone" in value or "user phone" in value:
        return True
    digits = "".join(ch for ch in value if ch.isdigit())
    return len(digits) < 10


def _looks_like_real_phone(value: str) -> bool:
    digits = "".join(ch for ch in (value or "") if ch.isdigit())
    return len(digits) >= 10


async def _emit(
    ctx: RunContext[ClinicUserData],
    tool: str,
    status: str,
    message: str,
    **extra,
) -> None:
    await emit_tool_event(_room_name(ctx), tool, status, message, **extra)


def build_agent_tools(llm: groq.LLM) -> list:
    @function_tool
    async def identify_user_tool(
        ctx: RunContext[ClinicUserData], phone_number: str
    ) -> str:
        """Find or create a user by phone number and return their profile."""
        logger.info("TOOL CALLED: identify_user_tool")
        if ctx.userdata.user_id is not None and _is_placeholder_phone(phone_number):
            result = {
                "id": ctx.userdata.user_id,
                "phone_number": ctx.userdata.phone,
                "message": "User already identified from app sign-in.",
            }
            logger.info("TOOL RESULT: identify_user_tool %s", result)
            return json.dumps(
                {
                    **result,
                }
            )
        if _is_placeholder_phone(phone_number):
            result = {
                "success": False,
                "message": "Please provide a valid phone number with country code.",
            }
            logger.info("TOOL RESULT: identify_user_tool %s", result)
            return json.dumps(
                {
                    **result,
                }
            )
        await _emit(ctx, "identify_user", "running", "Identifying user...")
        db = SessionLocal()
        try:
            result = await identify_user(db, phone_number)
            ctx.userdata.user_id = result["id"]
            ctx.userdata.phone = result["phone_number"]
            await _emit(
                ctx,
                "identify_user",
                "done",
                f"User identified: {result['name']}",
                user_name=result["name"],
                user_id=result["id"],
            )
            logger.info("TOOL RESULT: identify_user_tool %s", result)
            return json.dumps(result)
        finally:
            db.close()

    @function_tool
    async def fetch_slots_tool(ctx: RunContext[ClinicUserData], date: str) -> str:
        """Return available appointment slots for a given date (YYYY-MM-DD)."""
        logger.info("TOOL CALLED: fetch_slots_tool")
        await _emit(ctx, "fetch_slots", "running", "Fetching slots...")
        db = SessionLocal()
        try:
            slots = await fetch_slots(db, date)
            await _emit(
                ctx,
                "fetch_slots",
                "done",
                f"Found {len(slots)} available slots for {_format_display_date(date)}",
            )
            result = {"date": date, "available_slots": slots}
            logger.info("TOOL RESULT: fetch_slots_tool %s", result)
            return json.dumps(result)
        finally:
            db.close()

    @function_tool
    async def book_appointment_tool(
        ctx: RunContext[ClinicUserData],
        user_id: int,
        name: str,
        date: str,
        time: str,
    ) -> str:
        """Book an appointment after confirming details; user_id is required (from identify_user_tool)."""
        logger.info("TOOL CALLED: book_appointment_tool")
        if ctx.userdata.user_id is None:
            result = {"success": False, "message": "Identify the user first."}
            logger.info("TOOL RESULT: book_appointment_tool %s", result)
            return json.dumps(result)
        if user_id != ctx.userdata.user_id:
            result = {
                "success": False,
                "message": "Invalid user_id. Call identify_user_tool first and use its id.",
            }
            logger.info("TOOL RESULT: book_appointment_tool %s", result)
            return json.dumps(result)
        await _emit(
            ctx, "book_appointment", "running", "Booking your appointment..."
        )
        db = SessionLocal()
        try:
            try:
                result = await book_appointment(
                    db, ctx.userdata.user_id, name, date, time
                )
            except Exception as exc:
                result = {
                    "success": False,
                    "message": f"Booking failed: {exc}",
                }
            if result.get("success"):
                display_date = _format_display_date(date)
                await _emit(
                    ctx,
                    "book_appointment",
                    "done",
                    f"Booking confirmed ✅ — {display_date} at {time}",
                )
            else:
                await _emit(
                    ctx,
                    "book_appointment",
                    "error",
                    result.get("message", "Booking failed."),
                )
            logger.info("TOOL RESULT: book_appointment_tool %s", result)
            return json.dumps(result)
        finally:
            db.close()

    @function_tool
    async def retrieve_appointments_tool(ctx: RunContext[ClinicUserData]) -> str:
        """List active appointments for the identified user."""
        logger.info("TOOL CALLED: retrieve_appointments_tool")
        if ctx.userdata.user_id is None:
            result = {"success": False, "message": "Identify the user first."}
            logger.info("TOOL RESULT: retrieve_appointments_tool %s", result)
            return json.dumps(result)
        await _emit(
            ctx, "retrieve_appointments", "running", "Retrieving appointments..."
        )
        db = SessionLocal()
        try:
            appointments = await retrieve_appointments(db, ctx.userdata.user_id)
            await _emit(
                ctx,
                "retrieve_appointments",
                "done",
                f"Found {len(appointments)} active appointment(s)",
            )
            result = {"appointments": appointments}
            logger.info("TOOL RESULT: retrieve_appointments_tool %s", result)
            return json.dumps(result)
        finally:
            db.close()

    @function_tool
    async def cancel_appointment_tool(
        ctx: RunContext[ClinicUserData], appointment_id: int
    ) -> str:
        """Cancel an appointment by ID for the identified user."""
        logger.info("TOOL CALLED: cancel_appointment_tool")
        if ctx.userdata.user_id is None:
            result = {"success": False, "message": "Identify the user first."}
            logger.info("TOOL RESULT: cancel_appointment_tool %s", result)
            return json.dumps(result)
        await _emit(
            ctx,
            "cancel_appointment",
            "running",
            f"Cancelling appointment #{appointment_id}...",
        )
        db = SessionLocal()
        try:
            result = await cancel_appointment(
                db, appointment_id, ctx.userdata.user_id
            )
            if result.get("success"):
                await _emit(
                    ctx,
                    "cancel_appointment",
                    "done",
                    f"Appointment #{appointment_id} cancelled ✅",
                )
            else:
                await _emit(
                    ctx,
                    "cancel_appointment",
                    "done",
                    result.get("message", "Cancellation failed."),
                )
            logger.info("TOOL RESULT: cancel_appointment_tool %s", result)
            return json.dumps(result)
        finally:
            db.close()

    @function_tool
    async def modify_appointment_tool(
        ctx: RunContext[ClinicUserData],
        appointment_id: int,
        new_date: str,
        new_time: str,
    ) -> str:
        """Reschedule an appointment to a new date and time."""
        logger.info("TOOL CALLED: modify_appointment_tool")
        if ctx.userdata.user_id is None:
            result = {"success": False, "message": "Identify the user first."}
            logger.info("TOOL RESULT: modify_appointment_tool %s", result)
            return json.dumps(result)
        await _emit(ctx, "modify_appointment", "running", "Modifying appointment...")
        db = SessionLocal()
        try:
            result = await modify_appointment(
                db,
                appointment_id,
                ctx.userdata.user_id,
                new_date,
                new_time,
            )
            if result.get("success"):
                await _emit(
                    ctx,
                    "modify_appointment",
                    "done",
                    f"Rescheduled to {_format_display_date(new_date)} at {new_time} ✅",
                )
            else:
                await _emit(
                    ctx,
                    "modify_appointment",
                    "done",
                    result.get("message", "Modification failed."),
                )
            logger.info("TOOL RESULT: modify_appointment_tool %s", result)
            return json.dumps(result)
        finally:
            db.close()

    @function_tool
    async def end_conversation_tool(
        ctx: RunContext[ClinicUserData], summary: str
    ) -> str:
        """End the conversation, store a summary, and return final details."""
        logger.info("TOOL CALLED: end_conversation_tool")
        if ctx.userdata.user_id is None:
            result = {"success": False, "message": "Identify the user first."}
            logger.info("TOOL RESULT: end_conversation_tool %s", result)
            return json.dumps(result)
        await _emit(ctx, "end_conversation", "running", "Wrapping up conversation...")
        db = SessionLocal()
        try:
            result = await end_conversation(db, ctx.userdata.user_id, summary)
            await _emit(
                ctx,
                "end_conversation",
                "done",
                "Call summary ready ✅",
                summary=result.get("summary"),
                appointments=result.get("appointments"),
                user_name=result.get("user_name"),
                timestamp=result.get("timestamp"),
            )
            logger.info("TOOL RESULT: end_conversation_tool %s", result)
            return json.dumps(result)
        finally:
            db.close()

    _ = llm
    return [
        identify_user_tool,
        fetch_slots_tool,
        book_appointment_tool,
        retrieve_appointments_tool,
        cancel_appointment_tool,
        modify_appointment_tool,
        end_conversation_tool,
    ]


class AriaAgent(Agent):
    def __init__(self, tools: list, instructions: str) -> None:
        super().__init__(instructions=instructions, tools=tools)


async def _identify_caller_from_room(
    ctx: JobContext, session: AgentSession[ClinicUserData]
) -> bool:
    """Identify the user from the phone number passed as their LiveKit identity."""
    for _ in range(15):
        for participant in ctx.room.remote_participants.values():
            phone = (participant.identity or participant.name or "").strip()
            if (
                not phone
                or phone == "clinic-user"
                or phone.startswith("agent-")
                or not _looks_like_real_phone(phone)
            ):
                continue
            db = SessionLocal()
            try:
                result = await identify_user(db, phone)
                session.userdata.user_id = result["id"]
                session.userdata.phone = result["phone_number"]
                return True
            finally:
                db.close()
        await asyncio.sleep(0.2)
    return False


async def entrypoint(ctx: JobContext):
    init_db()

    llm = groq.LLM(model="llama-3.3-70b-versatile")
    tools = build_agent_tools(llm)

    session = AgentSession[ClinicUserData](
        stt=deepgram.STT(model="nova-2"),
        llm=llm,
        tts=cartesia.TTS(
            api_key=os.getenv("CARTESIA_API_KEY"),
            model="sonic-2",
            voice=EN_VOICE,
            word_timestamps=False,
        ),
        userdata=ClinicUserData(room_name=ctx.room.name),
    )

    await session.start(
        agent=AriaAgent(tools=tools, instructions=build_system_prompt()),
        room=ctx.room,
    )
    await ctx.connect()

    identified = await _identify_caller_from_room(ctx, session)
    _ = identified
    await session.generate_reply(
        instructions=(
            "Say exactly: Hi, I am Aria! Please tell me your name and phone number."
        )
    )


if __name__ == "__main__":
    agent_name = os.getenv("LIVEKIT_AGENT_NAME", "mykare-receptionist")
    cli.run_app(
        WorkerOptions(entrypoint_fnc=entrypoint, agent_name=agent_name)
    )
