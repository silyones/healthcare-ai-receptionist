import os
import time
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from livekit import api
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import router as auth_router
from db import get_db, init_db
from tools import (
    book_appointment,
    cancel_appointment,
    end_conversation,
    fetch_slots,
    identify_user,
    modify_appointment,
    retrieve_appointments,
)
from ws_tools import tool_ws_manager

load_dotenv()
DISPATCH_DEBOUNCE_SECONDS = 8.0
_last_dispatch_by_room: dict[str, float] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Healthcare AI Receptionist", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)


class IdentifyRequest(BaseModel):
    phone: str


class BookRequest(BaseModel):
    user_id: int
    name: str
    date: str
    time: str


class SlotsRequest(BaseModel):
    date: str


class ModifyRequest(BaseModel):
    appointment_id: int
    user_id: int
    new_date: str
    new_time: str


class EndConversationRequest(BaseModel):
    user_id: int
    summary: str


class TokenRequest(BaseModel):
    room_name: str
    participant_name: str = "clinic-user"


class ToolEmitRequest(BaseModel):
    room_name: str
    tool: str
    status: str
    message: str
    summary: str | None = None
    appointments: list | None = None
    user_name: str | None = None
    timestamp: str | None = None

    model_config = {"extra": "allow"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/token")
async def create_livekit_token(req: TokenRequest):
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")
    livekit_url = os.getenv("LIVEKIT_URL")
    agent_name = os.getenv("LIVEKIT_AGENT_NAME", "mykare-receptionist")

    if not api_key or not api_secret or not livekit_url:
        raise HTTPException(status_code=500, detail="LiveKit credentials not configured")

    token = (
        api.AccessToken(api_key, api_secret)
        .with_identity(req.participant_name)
        .with_name(req.participant_name)
        .with_grants(api.VideoGrants(room_join=True, room=req.room_name))
        .to_jwt()
    )

    # React StrictMode/dev can call /token twice. Debounce dispatch per room
    # to avoid spawning duplicate agent jobs while keeping assignment reliable.
    now = time.monotonic()
    last_dispatch = _last_dispatch_by_room.get(req.room_name, 0.0)
    if now - last_dispatch >= DISPATCH_DEBOUNCE_SECONDS:
        _last_dispatch_by_room[req.room_name] = now
        api_url = livekit_url.replace("wss://", "https://")
        lkapi = api.LiveKitAPI(url=api_url, api_key=api_key, api_secret=api_secret)
        try:
            await lkapi.agent_dispatch.create_dispatch(
                api.CreateAgentDispatchRequest(
                    agent_name=agent_name,
                    room=req.room_name,
                )
            )
        except Exception:
            pass
        finally:
            await lkapi.aclose()

    return {"token": token, "url": livekit_url, "room": req.room_name}


@app.websocket("/ws/tools/{room_name}")
async def tools_websocket(websocket: WebSocket, room_name: str):
    await tool_ws_manager.connect(room_name, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        tool_ws_manager.disconnect(room_name, websocket)


@app.post("/api/tools/emit")
async def api_emit_tool_event(req: ToolEmitRequest):
    payload = req.model_dump(exclude={"room_name"}, exclude_none=True)
    await tool_ws_manager.broadcast(req.room_name, payload)
    return {"ok": True}


@app.post("/api/identify")
async def api_identify(req: IdentifyRequest, db: Session = Depends(get_db)):
    return await identify_user(db, req.phone)


@app.post("/api/slots")
async def api_slots(req: SlotsRequest, db: Session = Depends(get_db)):
    slots = await fetch_slots(db, req.date)
    return {"date": req.date, "available_slots": slots}


@app.post("/api/book")
async def api_book(req: BookRequest, db: Session = Depends(get_db)):
    return await book_appointment(db, req.user_id, req.name, req.date, req.time)


@app.get("/api/appointments/{user_id}")
async def api_list_appointments(user_id: int, db: Session = Depends(get_db)):
    appointments = await retrieve_appointments(db, user_id)
    return {"appointments": appointments}


@app.delete("/api/appointments/{appointment_id}")
async def api_cancel(
    appointment_id: int, user_id: int, db: Session = Depends(get_db)
):
    return await cancel_appointment(db, appointment_id, user_id)


@app.patch("/api/appointments/{appointment_id}")
async def api_modify(
    appointment_id: int, req: ModifyRequest, db: Session = Depends(get_db)
):
    if req.appointment_id != appointment_id:
        raise HTTPException(status_code=400, detail="Appointment ID mismatch")
    return await modify_appointment(
        db, appointment_id, req.user_id, req.new_date, req.new_time
    )


@app.post("/api/conversation/end")
async def api_end_conversation(req: EndConversationRequest, db: Session = Depends(get_db)):
    return await end_conversation(db, req.user_id, req.summary)
