from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from db import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    phone_number = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    google_access_token = Column(Text, nullable=True)
    google_refresh_token = Column(Text, nullable=True)
    google_calendar_connected = Column(Boolean, default=False, nullable=False)

    appointments = relationship("Appointment", back_populates="user")


class Appointment(Base):
    __tablename__ = "appointments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(255), nullable=False)
    date = Column(String(10), nullable=False)
    time = Column(String(5), nullable=False)
    google_event_id = Column(String(255), nullable=True)
    status = Column(String(20), default="active", nullable=False)

    user = relationship("User", back_populates="appointments")
