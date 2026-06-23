import os
from typing import Any
from urllib.parse import quote, unquote

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from google_auth_oauthlib.flow import Flow
from sqlalchemy.orm import Session

from db import get_db
from models import User
from phone_utils import find_user_by_phone, normalize_phone_digits

load_dotenv()

router = APIRouter(prefix="/auth", tags=["auth"])

SCOPES = [
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.readonly",
]

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# PKCE code_verifier lives on the Flow instance — must reuse it on callback.
_pending_oauth_flows: dict[str, Flow] = {}


def _phone_key(phone: str) -> str:
    return normalize_phone_digits(phone)


def _get_flow() -> Flow:
    client_config = {
        "web": {
            "client_id": os.getenv("GOOGLE_CLIENT_ID"),
            "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [os.getenv("GOOGLE_REDIRECT_URI")],
        }
    }
    return Flow.from_client_config(
        client_config,
        scopes=SCOPES,
        redirect_uri=os.getenv("GOOGLE_REDIRECT_URI"),
    )


def _frontend_redirect(path: str) -> RedirectResponse:
    return RedirectResponse(url=f"{FRONTEND_URL}{path}")


@router.get("/login")
def login(phone: str, db: Session = Depends(get_db)):
    user = find_user_by_phone(db, phone)
    if not user:
        raise HTTPException(status_code=404, detail="User not found. Register first.")

    phone_key = _phone_key(phone)
    flow = _get_flow()
    authorization_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=phone,
    )
    _pending_oauth_flows[phone_key] = flow
    return RedirectResponse(url=authorization_url)


@router.get("/callback")
def callback(code: str, state: str, db: Session = Depends(get_db)):
    phone_number = unquote(state)
    phone_key = _phone_key(phone_number)

    flow = _pending_oauth_flows.pop(phone_key, None)
    if not flow:
        return _frontend_redirect(
            f"/?calendar=error&message={quote('OAuth session expired. Please try again.')}"
        )

    try:
        flow.fetch_token(code=code)
    except Exception:
        return _frontend_redirect(
            f"/?calendar=error&message={quote('Failed to connect Google Calendar. Please try again.')}"
        )

    credentials = flow.credentials
    user = find_user_by_phone(db, phone_number)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.google_access_token = credentials.token
    user.google_refresh_token = credentials.refresh_token
    user.google_calendar_connected = bool(
        credentials.refresh_token or credentials.token
    )
    db.commit()

    return _frontend_redirect(
        f"/?calendar=connected&phone={quote(phone_number)}"
    )


@router.get("/status")
def auth_status(phone: str, db: Session = Depends(get_db)):
    user = find_user_by_phone(db, phone)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "phone_number": user.phone_number,
        "google_calendar_connected": user.google_calendar_connected,
    }


def get_calendar_service(user: User) -> tuple[Any, Any]:
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    credentials = Credentials(
        token=user.google_access_token,
        refresh_token=user.google_refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.getenv("GOOGLE_CLIENT_ID"),
        client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
    )
    service = build("calendar", "v3", credentials=credentials)
    return service, credentials


def persist_refreshed_token(user: User, credentials: Any, db: Session) -> None:
    if credentials.token and credentials.token != user.google_access_token:
        user.google_access_token = credentials.token
        db.commit()
