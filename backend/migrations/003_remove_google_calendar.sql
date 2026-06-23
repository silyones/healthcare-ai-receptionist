-- 003_remove_google_calendar.sql
-- Rebuild tables without Google Calendar columns (safe for upgraded databases).

CREATE TABLE IF NOT EXISTS users_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL
);

INSERT OR IGNORE INTO users_new (id, phone_number, name)
SELECT id, phone_number, name FROM users;

DROP TABLE IF EXISTS users;
ALTER TABLE users_new RENAME TO users;
CREATE INDEX IF NOT EXISTS ix_users_phone_number ON users (phone_number);

CREATE TABLE IF NOT EXISTS appointments_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    date VARCHAR(10) NOT NULL,
    time VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    FOREIGN KEY (user_id) REFERENCES users (id)
);

INSERT OR IGNORE INTO appointments_new (id, user_id, title, date, time, status)
SELECT id, user_id, title, date, time, status FROM appointments;

DROP TABLE IF EXISTS appointments;
ALTER TABLE appointments_new RENAME TO appointments;
CREATE INDEX IF NOT EXISTS ix_appointments_user_id ON appointments (user_id);
