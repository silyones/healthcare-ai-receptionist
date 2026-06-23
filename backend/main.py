from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import router as auth_router
from db import get_db, init_db
from tools import (
    book_appointment,
    cancel_appointment,
    fetch_slots,
    get_user_appointments,
    identify_user,
    register_user,
)


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


class RegisterRequest(BaseModel):
    name: str
    phone: str


class SlotsRequest(BaseModel):
    title: str
    date: str
    duration_minutes: int = 30


class BookRequest(BaseModel):
    user_id: int
    title: str
    date: str
    time: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/identify")
def api_identify(req: IdentifyRequest, db: Session = Depends(get_db)):
    return identify_user(db, req.phone)


@app.post("/api/register")
def api_register(req: RegisterRequest, db: Session = Depends(get_db)):
    return register_user(db, req.name, req.phone)


@app.post("/api/slots")
def api_slots(req: SlotsRequest, db: Session = Depends(get_db)):
    return fetch_slots(db, req.title, req.date, req.duration_minutes)


@app.post("/api/book")
def api_book(req: BookRequest, db: Session = Depends(get_db)):
    return book_appointment(db, req.user_id, req.title, req.date, req.time)


@app.delete("/api/appointments/{appointment_id}")
def api_cancel(appointment_id: int, db: Session = Depends(get_db)):
    return cancel_appointment(db, appointment_id)


@app.get("/api/appointments/{user_id}")
def api_list_appointments(user_id: int, db: Session = Depends(get_db)):
    return get_user_appointments(db, user_id)
