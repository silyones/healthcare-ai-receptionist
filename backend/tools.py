import asyncio
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from models import Appointment, ConversationSummary, User
from phone_utils import find_user_by_phone

HARDCODED_SLOTS = ["10:00 AM", "11:00 AM", "2:00 PM", "3:00 PM", "4:00 PM"]


def _user_dict(user: User) -> dict[str, Any]:
    raw_name = (user.name or "").strip()
    normalized = raw_name.lower()
    placeholder_names = {"", "user's name", "users name"}
    output_name: str | None = None if normalized in placeholder_names else raw_name

    return {
        "id": user.id,
        "phone_number": user.phone_number,
        "name": output_name,
    }


def _appointment_dict(appt: Appointment) -> dict[str, Any]:
    return {
        "id": appt.id,
        "user_id": appt.user_id,
        "title": appt.title,
        "date": appt.date,
        "time": appt.time,
        "status": appt.status,
    }


def _parse_datetime(date: str, time: str) -> datetime:
    for fmt in (
        "%Y-%m-%d %I:%M %p",
        "%Y-%m-%d %H:%M",
        "%m/%d/%Y %I:%M %p",
        "%m/%d/%Y %H:%M",
    ):
        try:
            return datetime.strptime(f"{date} {time}", fmt)
        except ValueError:
            continue
    raise ValueError(f"Could not parse date/time: {date} {time}")


def _normalize_date(date: str) -> str:
    value = (date or "").strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(value, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    raise ValueError(f"Could not parse date: {date}")


def _identify_user_sync(db: Session, phone_number: str) -> dict[str, Any]:
    user = find_user_by_phone(db, phone_number)
    if not user:
        canonical = phone_number.strip()
        user = User(phone_number=canonical, name=f"Guest {canonical}")
        db.add(user)
        db.commit()
        db.refresh(user)
    return _user_dict(user)


def _fetch_slots_sync(db: Session, date: str) -> list[str]:
    date = _normalize_date(date)
    booked = {
        row.time
        for row in db.query(Appointment)
        .filter(Appointment.date == date, Appointment.status == "active")
        .all()
    }
    return [slot for slot in HARDCODED_SLOTS if slot not in booked]


def _book_appointment_sync(
    db: Session, user_id: int, name: str, date: str, time: str
) -> dict[str, Any]:
    date = _normalize_date(date)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return {"success": False, "message": "User not found."}

    if name and name.strip():
        user.name = name.strip()

    duplicate = (
        db.query(Appointment)
        .filter(
            Appointment.date == date,
            Appointment.time == time,
            Appointment.status == "active",
        )
        .first()
    )
    if duplicate:
        return {
            "success": False,
            "message": f"That time slot is already booked on {date} at {time}. Please choose another time.",
        }

    title = name.strip() if name and name.strip() else f"Clinic visit for {user.name}"
    appointment = Appointment(
        user_id=user_id,
        title=title,
        date=date,
        time=time,
        status="active",
    )
    db.add(appointment)
    db.commit()
    db.refresh(appointment)

    return {
        "success": True,
        "message": (
            f"Your appointment is confirmed for {date} at {time}. "
            f"Reference number {appointment.id}."
        ),
        "confirmation": {
            "appointment_id": appointment.id,
            "title": appointment.title,
            "date": appointment.date,
            "time": appointment.time,
        },
    }


def _retrieve_appointments_sync(db: Session, user_id: int) -> list[dict[str, Any]]:
    appointments = (
        db.query(Appointment)
        .filter(Appointment.user_id == user_id, Appointment.status == "active")
        .order_by(Appointment.date, Appointment.time)
        .all()
    )
    return [_appointment_dict(appt) for appt in appointments]


def _cancel_appointment_sync(
    db: Session, appointment_id: int, user_id: int
) -> dict[str, Any]:
    appointment = (
        db.query(Appointment)
        .filter(Appointment.id == appointment_id, Appointment.user_id == user_id)
        .first()
    )
    if not appointment:
        return {"success": False, "message": "Appointment not found."}

    appointment.status = "cancelled"
    db.commit()
    return {
        "success": True,
        "appointment_id": appointment_id,
        "message": f"Appointment #{appointment_id} has been cancelled.",
    }


def _modify_appointment_sync(
    db: Session,
    appointment_id: int,
    user_id: int,
    new_date: str,
    new_time: str,
) -> dict[str, Any]:
    new_date = _normalize_date(new_date)
    appointment = (
        db.query(Appointment)
        .filter(Appointment.id == appointment_id, Appointment.user_id == user_id)
        .first()
    )
    if not appointment:
        return {"success": False, "message": "Appointment not found."}

    duplicate = (
        db.query(Appointment)
        .filter(
            Appointment.date == new_date,
            Appointment.time == new_time,
            Appointment.status == "active",
            Appointment.id != appointment_id,
        )
        .first()
    )
    if duplicate:
        return {
            "success": False,
            "message": f"The slot on {new_date} at {new_time} is already taken.",
        }

    appointment.date = new_date
    appointment.time = new_time
    db.commit()
    db.refresh(appointment)

    return {
        "success": True,
        "appointment": _appointment_dict(appointment),
        "message": f"Appointment rescheduled to {new_date} at {new_time}.",
    }


def _end_conversation_sync(
    db: Session, user_id: int, summary: str
) -> dict[str, Any]:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return {
            "summary": summary,
            "appointments": [],
            "user_name": "Guest",
            "timestamp": datetime.utcnow().isoformat(),
        }

    record = ConversationSummary(user_id=user_id, summary=summary)
    db.add(record)
    db.commit()
    db.refresh(record)

    appointments = _retrieve_appointments_sync(db, user_id)
    return {
        "summary": summary,
        "appointments": appointments,
        "user_name": user.name,
        "timestamp": record.created_at.isoformat(),
    }


async def identify_user(db: Session, phone_number: str) -> dict[str, Any]:
    return await asyncio.to_thread(_identify_user_sync, db, phone_number)


async def fetch_slots(db: Session, date: str) -> list[str]:
    return await asyncio.to_thread(_fetch_slots_sync, db, date)


async def book_appointment(
    db: Session, user_id: int, name: str, date: str, time: str
) -> dict[str, Any]:
    """Book an appointment. user_id is required (obtain from identify_user first)."""
    return await asyncio.to_thread(
        _book_appointment_sync, db, user_id, name, date, time
    )


async def retrieve_appointments(db: Session, user_id: int) -> list[dict[str, Any]]:
    return await asyncio.to_thread(_retrieve_appointments_sync, db, user_id)


async def cancel_appointment(
    db: Session, appointment_id: int, user_id: int
) -> dict[str, Any]:
    return await asyncio.to_thread(
        _cancel_appointment_sync, db, appointment_id, user_id
    )


async def modify_appointment(
    db: Session,
    appointment_id: int,
    user_id: int,
    new_date: str,
    new_time: str,
) -> dict[str, Any]:
    return await asyncio.to_thread(
        _modify_appointment_sync,
        db,
        appointment_id,
        user_id,
        new_date,
        new_time,
    )


async def end_conversation(
    db: Session, user_id: int, summary: str
) -> dict[str, Any]:
    return await asyncio.to_thread(_end_conversation_sync, db, user_id, summary)
