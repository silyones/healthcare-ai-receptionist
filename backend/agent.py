import json
import os
from dataclasses import dataclass

from dotenv import load_dotenv
from livekit.agents import Agent, AgentSession, JobContext, RunContext, WorkerOptions, cli
from livekit.agents.llm import function_tool
from livekit.plugins import cartesia, deepgram, groq

from db import SessionLocal, init_db
from tools import (
    book_appointment,
    cancel_appointment,
    end_conversation,
    fetch_slots,
    identify_user,
    modify_appointment,
    retrieve_appointments,
)

load_dotenv()

# Jacqueline (English) and Nisha (Hindi) — stable voices for voice agents per Cartesia docs
EN_VOICE = os.getenv("CARTESIA_VOICE_EN", "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc")
HI_VOICE = os.getenv("CARTESIA_VOICE_HI", "0f14d8cb-f039-41fe-a813-a9b4bee7eed8")

SYSTEM_PROMPT = """You are a helpful front-desk AI assistant for a healthcare clinic. Your name is Aria. Start by greeting the user and asking for their phone number to identify them. Help them book, check, modify, or cancel appointments. Always confirm details before booking. Be concise and clear.

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


async def _publish_tool_event(ctx: RunContext[ClinicUserData], message: str) -> None:
    try:
        room = ctx.session.room
        if room and room.local_participant:
            payload = json.dumps({"type": "tool", "message": message})
            await room.local_participant.publish_data(payload.encode(), reliable=True)
    except Exception:
        pass


async def _publish_summary(ctx: RunContext[ClinicUserData], result: dict) -> None:
    try:
        room = ctx.session.room
        if room and room.local_participant:
            payload = json.dumps(
                {
                    "type": "summary",
                    "summary": result.get("summary", ""),
                    "appointments": result.get("appointments", []),
                    "timestamp": result.get("timestamp", ""),
                }
            )
            await room.local_participant.publish_data(payload.encode(), reliable=True)
    except Exception:
        pass


def build_agent_tools(llm: groq.LLM) -> list:
    """Register tools from tools.py as LLM function tools.

    LiveKit Agents 1.5+ uses function_tool (successor to the legacy llm.ai_callable decorator).
    """

    @function_tool
    async def identify_user_tool(
        ctx: RunContext[ClinicUserData], phone_number: str
    ) -> str:
        """Find or create a user by phone number and return their profile."""
        await _publish_tool_event(ctx, "Identifying user…")
        db = SessionLocal()
        try:
            result = await identify_user(db, phone_number)
            ctx.userdata.user_id = result["id"]
            await _publish_tool_event(ctx, f"User identified: {result['name']}")
            return json.dumps(result)
        finally:
            db.close()

    @function_tool
    async def fetch_slots_tool(ctx: RunContext[ClinicUserData], date: str) -> str:
        """Return available appointment slots for a given date (YYYY-MM-DD)."""
        await _publish_tool_event(ctx, f"Fetching slots for {date}…")
        db = SessionLocal()
        try:
            slots = await fetch_slots(db, date)
            await _publish_tool_event(ctx, f"Found {len(slots)} available slots")
            return json.dumps({"date": date, "available_slots": slots})
        finally:
            db.close()

    @function_tool
    async def book_appointment_tool(
        ctx: RunContext[ClinicUserData],
        name: str,
        date: str,
        time: str,
    ) -> str:
        """Book an appointment after confirming the user's name, date, and time."""
        if ctx.userdata.user_id is None:
            return json.dumps({"success": False, "message": "Identify the user first."})
        await _publish_tool_event(ctx, f"Booking appointment on {date} at {time}…")
        db = SessionLocal()
        try:
            result = await book_appointment(
                db, ctx.userdata.user_id, name, date, time
            )
            if result.get("success"):
                await _publish_tool_event(ctx, "Booking confirmed ✅")
            return json.dumps(result)
        finally:
            db.close()

    @function_tool
    async def retrieve_appointments_tool(ctx: RunContext[ClinicUserData]) -> str:
        """List active appointments for the identified user."""
        if ctx.userdata.user_id is None:
            return json.dumps({"success": False, "message": "Identify the user first."})
        await _publish_tool_event(ctx, "Retrieving appointments…")
        db = SessionLocal()
        try:
            appointments = await retrieve_appointments(db, ctx.userdata.user_id)
            return json.dumps({"appointments": appointments})
        finally:
            db.close()

    @function_tool
    async def cancel_appointment_tool(
        ctx: RunContext[ClinicUserData], appointment_id: int
    ) -> str:
        """Cancel an appointment by ID for the identified user."""
        if ctx.userdata.user_id is None:
            return json.dumps({"success": False, "message": "Identify the user first."})
        await _publish_tool_event(ctx, f"Cancelling appointment #{appointment_id}…")
        db = SessionLocal()
        try:
            result = await cancel_appointment(
                db, appointment_id, ctx.userdata.user_id
            )
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
        if ctx.userdata.user_id is None:
            return json.dumps({"success": False, "message": "Identify the user first."})
        await _publish_tool_event(ctx, "Modifying appointment…")
        db = SessionLocal()
        try:
            result = await modify_appointment(
                db,
                appointment_id,
                ctx.userdata.user_id,
                new_date,
                new_time,
            )
            return json.dumps(result)
        finally:
            db.close()

    @function_tool
    async def end_conversation_tool(
        ctx: RunContext[ClinicUserData], summary: str
    ) -> str:
        """End the conversation, store a summary, and return final details."""
        if ctx.userdata.user_id is None:
            return json.dumps({"success": False, "message": "Identify the user first."})
        await _publish_tool_event(ctx, "Wrapping up conversation…")
        db = SessionLocal()
        try:
            result = await end_conversation(db, ctx.userdata.user_id, summary)
            await _publish_summary(ctx, result)
            return json.dumps(result)
        finally:
            db.close()

    # llm reference keeps tool registration tied to the configured Groq model
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
    def __init__(self, tools: list) -> None:
        super().__init__(instructions=SYSTEM_PROMPT, tools=tools)


async def entrypoint(ctx: JobContext):
    init_db()

    llm = groq.LLM(model="llama-3.3-70b-versatile")
    tools = build_agent_tools(llm)

    session = AgentSession[ClinicUserData](
        stt=deepgram.STT(model="nova-2"),
        llm=llm,
        tts=cartesia.TTS(
            api_key=os.getenv("CARTESIA_API_KEY"),
            model="sonic-3",
            voice=EN_VOICE,
        ),
        userdata=ClinicUserData(),
    )

    await session.start(agent=AriaAgent(tools=tools), room=ctx.room)
    await ctx.connect()


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
