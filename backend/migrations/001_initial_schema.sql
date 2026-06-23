-- 001_initial_schema.sql
-- SQLite schema for users and appointments

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    google_access_token TEXT,
    google_refresh_token TEXT,
    google_calendar_connected BOOLEAN NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_users_phone_number ON users (phone_number);

CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    date VARCHAR(10) NOT NULL,
    time VARCHAR(5) NOT NULL,
    google_event_id VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE INDEX IF NOT EXISTS ix_appointments_user_id ON appointments (user_id);
