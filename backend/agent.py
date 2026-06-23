import os

from dotenv import load_dotenv
from livekit.agents import Agent, AgentSession, JobContext, WorkerOptions, cli
from livekit.plugins import cartesia, deepgram, groq

from db import SessionLocal, init_db
from tools import (
    book_appointment,
    cancel_appointment,
    fetch_slots,
    get_user_appointments,
    identify_user,
    register_user,
)

load_dotenv()

EN_VOICE = os.getenv("CARTESIA_VOICE_EN", "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc")
HI_VOICE = os.getenv("CARTESIA_VOICE_HI", "0f14d8cb-f039-41fe-a813-a9b4bee7eed8")


class ReceptionistAgent(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=(
                "You are a friendly healthcare receptionist. "
                "Help patients identify themselves, check available slots, "
                "book or cancel appointments, and answer general questions."
            )
        )
        self._db = SessionLocal()
        self._user_id: int | None = None

    async def on_enter(self):
        await self.session.say(
            "Hello! Welcome to the clinic. How can I help you today?",
            allow_interruptions=True,
        )

    @Agent.tool()
    async def identify_user_by_phone(self, phone: str) -> str:
        result = identify_user(self._db, phone)
        if result["found"]:
            self._user_id = result["user_id"]
            return f"Welcome back, {result['name']}!"
        return result["message"]

    @Agent.tool()
    async def register_new_user(self, name: str, phone: str) -> str:
        result = register_user(self._db, name, phone)
        if result["success"]:
            self._user_id = result["user_id"]
            return f"Registered {result['name']} successfully."
        return result["message"]

    @Agent.tool()
    async def check_available_slots(
        self, title: str, date: str, duration_minutes: int = 30
    ) -> str:
        result = fetch_slots(self._db, title, date, duration_minutes)
        slots = result["available_slots"]
        if not slots:
            return f"No slots available for {title} on {date}."
        return f"Available slots: {', '.join(slots)}"

    @Agent.tool()
    async def book_appointment_slot(self, title: str, date: str, time: str) -> str:
        if not self._user_id:
            return "Please identify yourself first before booking."
        result = book_appointment(self._db, self._user_id, title, date, time)
        if result["success"]:
            return f"Booked '{result['title']}' on {result['date']} at {result['time']}."
        return result["message"]

    @Agent.tool()
    async def cancel_appointment_by_id(self, appointment_id: int) -> str:
        result = cancel_appointment(self._db, appointment_id)
        if result["success"]:
            return f"Appointment {appointment_id} cancelled."
        return result["message"]

    @Agent.tool()
    async def list_my_appointments(self) -> str:
        if not self._user_id:
            return "Please identify yourself first."
        result = get_user_appointments(self._db, self._user_id)
        if not result["appointments"]:
            return "You have no upcoming appointments."
        lines = [
            f"#{a['id']}: {a['title']} on {a['date']} at {a['time']}"
            for a in result["appointments"]
        ]
        return "Your appointments: " + "; ".join(lines)


async def entrypoint(ctx: JobContext):
    init_db()

    session = AgentSession(
        stt=deepgram.STT(model="nova-2"),
        llm=groq.LLM(model="llama-3.3-70b-versatile"),
        tts=cartesia.TTS(voice=EN_VOICE),
    )

    await session.start(agent=ReceptionistAgent(), room=ctx.room)
    await ctx.connect()


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
