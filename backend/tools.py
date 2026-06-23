import asyncio
import os
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from googleapiclient.errors import HttpError
from sqlalchemy.orm import Session

from auth import get_calendar_service, persist_refreshed_token
from models import Appointment, ConversationSummary, User
from phone_utils import find_user_by_phone

HARDCODED_SLOTS = ["10:00 AM", "11:00 AM", "2:00 PM", "3:00 PM", "4:00 PM"]
CALENDAR_TIMEZONE = os.getenv("CLINIC_TIMEZONE", "Asia/Kolkata")
APPOINTMENT_DURATION_MINUTES = 30


class CalendarTokenExpiredError(Exception):
    """Raised when Google Calendar credentials are invalid or expired."""


def _invalidate_calendar_tokens(user: User, db: Session) -> None:
    user.google_calendar_connected = False
    user.google_access_token = None
    db.commit()


def _handle_calendar_error(exc: HttpError, user: User, db: Session) -> None:
    if exc.resp.status in (401, 403):
        _invalidate_calendar_tokens(user, db)
        raise CalendarTokenExpiredError() from exc
    raise exc


def _user_dict(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "phone_number": user.phone_number,
        "name": user.name,
        "google_calendar_connected": user.google_calendar_connected,
    }


def _appointment_dict(appt: Appointment) -> dict[str, Any]:
    return {
        "id": appt.id,
        "user_id": appt.user_id,
        "title": appt.title,
        "date": appt.date,
        "time": appt.time,
        "status": appt.status,
        "google_event_id": appt.google_event_id,
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


def _clinic_tz() -> ZoneInfo:
    try:
        return ZoneInfo(CALENDAR_TIMEZONE)
    except Exception:
        return ZoneInfo("UTC")


def _calendar_event_times(date: str, time: str) -> tuple[datetime, datetime]:
    start = _parse_datetime(date, time).replace(tzinfo=_clinic_tz())
    end = start + timedelta(minutes=APPOINTMENT_DURATION_MINUTES)
    return start, end


def _create_calendar_event(
    user: User, title: str, date: str, time: str, db: Session
) -> str | None:
    if not user.google_calendar_connected or not user.google_refresh_token:
        return None

    start, end = _calendar_event_times(date, time)
    service, credentials = get_calendar_service(user)
    event_body = {
        "summary": title,
        "start": {
            "dateTime": start.isoformat(),
            "timeZone": CALENDAR_TIMEZONE,
        },
        "end": {
            "dateTime": end.isoformat(),
            "timeZone": CALENDAR_TIMEZONE,
        },
    }
    try:
        event = service.events().insert(calendarId="primary", body=event_body).execute()
    except HttpError as exc:
        _handle_calendar_error(exc, user, db)

    persist_refreshed_token(user, credentials, db)
    return event.get("id")


def _update_calendar_event(
    user: User, event_id: str, title: str, date: str, time: str, db: Session
) -> None:
    if not event_id or not user.google_calendar_connected:
        return

    start, end = _calendar_event_times(date, time)
    service, credentials = get_calendar_service(user)
    event_body = {
        "summary": title,
        "start": {"dateTime": start.isoformat(), "timeZone": CALENDAR_TIMEZONE},
        "end": {"dateTime": end.isoformat(), "timeZone": CALENDAR_TIMEZONE},
    }
    try:
        service.events().patch(
            calendarId="primary", eventId=event_id, body=event_body
        ).execute()
    except HttpError as exc:
        _handle_calendar_error(exc, user, db)

    persist_refreshed_token(user, credentials, db)


def _delete_calendar_event(user: User, event_id: str, db: Session) -> None:
    if not event_id or not user.google_calendar_connected:
        return

    service, credentials = get_calendar_service(user)
    try:
        service.events().delete(calendarId="primary", eventId=event_id).execute()
    except HttpError as exc:
        if exc.resp.status == 404:
            pass
        else:
            _handle_calendar_error(exc, user, db)
    persist_refreshed_token(user, credentials, db)


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

    if not user.google_calendar_connected or not user.google_refresh_token:
        return {
            "success": False,
            "message": (
                "Google Calendar is not connected for this account. "
                "Please connect your calendar on the home screen and try again."
            ),
        }

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
            "message": f"An appointment already exists on {date} at {time}.",
        }

    title = name.strip() if name and name.strip() else f"Clinic visit for {user.name}"
    calendar_token_expired = False
    google_event_id = None
    try:
        google_event_id = _create_calendar_event(user, title, date, time, db)
    except CalendarTokenExpiredError:
        calendar_token_expired = True

    appointment = Appointment(
        user_id=user_id,
        title=title,
        date=date,
        time=time,
        status="active",
        google_event_id=google_event_id,
    )
    db.add(appointment)
    db.commit()
    db.refresh(appointment)

    response: dict[str, Any] = {
        "success": True,
        "confirmation": {
            "appointment_id": appointment.id,
            "title": appointment.title,
            "date": appointment.date,
            "time": appointment.time,
            "calendar_synced": google_event_id is not None,
        },
    }
    if calendar_token_expired:
        response["calendar_token_expired"] = True
        response["success"] = False
        response["message"] = (
            "Google Calendar access expired. Appointment was not created. "
            "Please reconnect your calendar and try again."
        )
        db.delete(appointment)
        db.commit()
        return response
    if google_event_id is None:
        response["success"] = False
        response["message"] = (
            "Could not add the appointment to Google Calendar. Please try again."
        )
        db.delete(appointment)
        db.commit()
        return response
    return response


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

    user = db.query(User).filter(User.id == user_id).first()
    calendar_token_expired = False
    if user and appointment.google_event_id:
        try:
            _delete_calendar_event(user, appointment.google_event_id, db)
        except CalendarTokenExpiredError:
            calendar_token_expired = True

    appointment.status = "cancelled"
    db.commit()
    result: dict[str, Any] = {"success": True, "appointment_id": appointment_id}
    if calendar_token_expired:
        result["calendar_token_expired"] = True
    return result


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

    user = db.query(User).filter(User.id == user_id).first()
    calendar_token_expired = False
    if user and appointment.google_event_id:
        try:
            _update_calendar_event(
                user, appointment.google_event_id, appointment.title, new_date, new_time, db
            )
        except CalendarTokenExpiredError:
            calendar_token_expired = True

    appointment.date = new_date
    appointment.time = new_time
    db.commit()
    db.refresh(appointment)

    result: dict[str, Any] = {"success": True, "appointment": _appointment_dict(appointment)}
    if calendar_token_expired:
        result["calendar_token_expired"] = True
    return result


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
