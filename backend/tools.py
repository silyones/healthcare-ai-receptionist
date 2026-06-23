from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from models import Appointment, User


def identify_user(db: Session, phone: str) -> dict[str, Any]:
    user = db.query(User).filter(User.phone_number == phone).first()
    if user:
        return {
            "found": True,
            "user_id": user.id,
            "name": user.name,
            "google_calendar_connected": user.google_calendar_connected,
        }
    return {"found": False, "message": "No user found with that phone number."}


def register_user(db: Session, name: str, phone: str) -> dict[str, Any]:
    existing = db.query(User).filter(User.phone_number == phone).first()
    if existing:
        return {"success": False, "message": "User with this phone already exists."}

    user = User(name=name, phone_number=phone)
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"success": True, "user_id": user.id, "name": user.name}


def fetch_slots(
    db: Session,
    title: str,
    date: str,
    duration_minutes: int = 30,
) -> dict[str, Any]:
    """Return available appointment slots for a given title on a date."""
    work_start = datetime.strptime(f"{date} 09:00", "%Y-%m-%d %H:%M")
    work_end = datetime.strptime(f"{date} 17:00", "%Y-%m-%d %H:%M")

    booked = (
        db.query(Appointment)
        .filter(
            Appointment.title == title,
            Appointment.date == date,
            Appointment.status == "active",
        )
        .all()
    )
    booked_times = {appt.time for appt in booked}

    slots = []
    current = work_start
    while current + timedelta(minutes=duration_minutes) <= work_end:
        slot = current.strftime("%H:%M")
        if slot not in booked_times:
            slots.append(slot)
        current += timedelta(minutes=duration_minutes)

    return {"title": title, "date": date, "available_slots": slots}


def book_appointment(
    db: Session,
    user_id: int,
    title: str,
    date: str,
    time: str,
) -> dict[str, Any]:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return {"success": False, "message": "User not found."}

    conflict = (
        db.query(Appointment)
        .filter(
            Appointment.title == title,
            Appointment.date == date,
            Appointment.time == time,
            Appointment.status == "active",
        )
        .first()
    )
    if conflict:
        return {"success": False, "message": "That slot is no longer available."}

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
        "appointment_id": appointment.id,
        "title": title,
        "date": date,
        "time": time,
    }


def cancel_appointment(db: Session, appointment_id: int) -> dict[str, Any]:
    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if not appointment:
        return {"success": False, "message": "Appointment not found."}

    appointment.status = "cancelled"
    db.commit()
    return {"success": True, "appointment_id": appointment_id}


def get_user_appointments(db: Session, user_id: int) -> dict[str, Any]:
    appointments = (
        db.query(Appointment)
        .filter(Appointment.user_id == user_id, Appointment.status == "active")
        .order_by(Appointment.date, Appointment.time)
        .all()
    )
    return {
        "appointments": [
            {
                "id": appt.id,
                "title": appt.title,
                "date": appt.date,
                "time": appt.time,
            }
            for appt in appointments
        ]
    }
