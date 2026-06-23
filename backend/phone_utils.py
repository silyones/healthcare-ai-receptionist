import re

from sqlalchemy.orm import Session

from models import User


def normalize_phone_digits(phone: str) -> str:
    """Match phones by their significant digits (last 10 for typical mobiles)."""
    digits = re.sub(r"\D", "", phone.strip())
    if len(digits) >= 10:
        return digits[-10:]
    return digits


def find_user_by_phone(db: Session, phone: str) -> User | None:
    target = normalize_phone_digits(phone)
    if not target:
        return None

    matches = [
        user
        for user in db.query(User).all()
        if normalize_phone_digits(user.phone_number) == target
    ]
    if not matches:
        return None
    if len(matches) == 1:
        return matches[0]
    # Same phone stored under different formats — prefer the most recent record.
    return max(matches, key=lambda user: user.id)
