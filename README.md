# EchoCareAI — Voice Appointment Assistant

EchoCareAI is a healthcare voice receptionist that lets patients call in, speak naturally with an AI agent named **Aria**, and book, check, modify, or cancel clinic appointments. Appointments are stored in a local SQLite database with hardcoded availability slots and double-booking prevention.

## Architecture

```
┌─────────────────┐     WebSocket (tool events)     ┌──────────────────┐
│  React Frontend │ ◄────────────────────────────── │  FastAPI Backend │
│  (Vite + LK)    │     REST API + LiveKit token    │  (main.py)       │
└────────┬────────┘                                 └────────┬─────────┘
         │                                                   │
         │  LiveKit WebRTC audio                             │  SQLite
         ▼                                                   ▼
┌─────────────────┐                                 ┌──────────────────┐
│  LiveKit Cloud  │ ◄── agent dispatch ──────────── │  LiveKit Agent   │
│  (room audio)   │                                 │  (agent.py)      │
└─────────────────┘                                 └──────────────────┘
                                                           │
                     Deepgram STT · Groq LLM · Cartesia TTS
```

| Layer | Tech |
|-------|------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, LiveKit Components |
| Backend API | FastAPI, SQLAlchemy, SQLite |
| Voice agent | LiveKit Agents, Deepgram (STT), Groq (LLM), Cartesia (TTS) |
| Realtime | LiveKit Cloud rooms + WebSocket activity feed |

## Project structure

```
voice-assistant/
├── backend/
│   ├── agent.py              # LiveKit voice agent (Aria)
│   ├── main.py               # FastAPI server, tokens, REST, WebSocket
│   ├── tools.py              # Appointment CRUD, slots, identify user
│   ├── models.py             # SQLAlchemy models
│   ├── db.py                 # DB engine + migrations runner
│   ├── phone_utils.py        # Phone normalization / lookup
│   ├── tool_events.py        # Emit tool events to frontend WS
│   ├── ws_tools.py           # WebSocket connection manager
│   ├── migrations/           # SQL migrations (applied on startup)
│   ├── requirements.txt
│   └── .env                  # Secrets (not committed)
├── frontend/
│   ├── src/
│   │   ├── App.tsx           # Screen routing (call ↔ summary)
│   │   ├── api.ts            # Backend API client
│   │   ├── components/
│   │   │   ├── VoiceAgent.tsx    # Call UI, LiveKit room, activity feed
│   │   │   ├── OrbComponent.tsx  # Animated AI orb (canvas)
│   │   │   ├── Navbar.tsx
│   │   │   ├── CallSummary.tsx
│   │   │   └── ui/avatar.tsx     # shadcn-style Avatar
│   │   └── hooks/
│   │       └── useAgentTalking.ts  # Audio RMS → isTalking
│   ├── vite.config.ts
│   └── package.json
└── README.md
```

## Features

- **Voice-first booking** — Patients talk to Aria; no forms during the call.
- **User identification** — Lookup or create user by phone number.
- **Hardcoded slots** — `10:00 AM`, `11:00 AM`, `2:00 PM`, `3:00 PM`, `4:00 PM` per day.
- **Double-booking prevention** — Same date + time cannot be booked twice while `active`.
- **Live activity feed** — Tool calls (identify, fetch slots, book, etc.) stream to the UI via WebSocket.
- **Call summary** — End-of-call screen with summary and appointment list.
- **Animated agent orb** — Canvas-based plasma orb reacts when the agent is speaking.

## Prerequisites

- **Python 3.11+**
- **Node.js 20+**
- Accounts / API keys for:
  - [LiveKit Cloud](https://livekit.io/)
  - [Groq](https://groq.com/) (LLM)
  - [Deepgram](https://deepgram.com/) (speech-to-text)
  - [Cartesia](https://cartesia.ai/) (text-to-speech)

## Environment variables

Create `backend/.env` (never commit real keys):

```env
# LiveKit
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
LIVEKIT_AGENT_NAME=mykare-receptionist

# AI providers
GROQ_API_KEY=your_groq_key
DEEPGRAM_API_KEY=your_deepgram_key
CARTESIA_API_KEY=your_cartesia_key

# Optional voice IDs (Cartesia)
CARTESIA_VOICE_EN=9626c31c-bec5-4cca-baa8-f8ba9e84c8bc
CARTESIA_VOICE_HI=0f14d8cb-f039-41fe-a813-a9b4bee7eed8

# Database
DATABASE_URL=sqlite:///./appointments.db

# Optional
CLINIC_TIMEZONE=Asia/Kolkata
API_URL=http://localhost:8000
```

Optional frontend override in `frontend/.env`:

```env
VITE_API_URL=http://localhost:8000
```

## Setup

### Backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Migrations run automatically when the API starts (`init_db()` in `main.py`).

### Frontend

```powershell
cd frontend
npm install
```

## Running locally

Use **three terminals**:

**Terminal 1 — API server**

```powershell
cd backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 2 — Voice agent**

```powershell
cd backend
python agent.py dev
```

**Terminal 3 — Frontend**

```powershell
cd frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

1. Enter phone number → **Start Call**
2. Allow microphone access
3. Speak with Aria to book or manage appointments
4. **End Call** → view summary

## API reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/token` | Issue LiveKit room token + dispatch agent |
| `POST` | `/api/identify` | Find or create user by phone |
| `POST` | `/api/slots` | Available slots for a date |
| `POST` | `/api/book` | Book appointment |
| `GET` | `/api/appointments/{user_id}` | List active appointments |
| `DELETE` | `/api/appointments/{id}?user_id=` | Cancel appointment |
| `PATCH` | `/api/appointments/{id}` | Reschedule appointment |
| `POST` | `/api/conversation/end` | Save conversation summary |
| `WS` | `/ws/tools/{room_name}` | Real-time tool activity feed |
| `POST` | `/api/tools/emit` | Internal: agent → WebSocket broadcast |

## Database schema

**users**

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER | Primary key |
| phone_number | VARCHAR(50) | Unique |
| name | VARCHAR(255) | Display name |

**appointments**

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER | Primary key |
| user_id | INTEGER | FK → users |
| title | VARCHAR(255) | e.g. "Clinic visit for Trisha" |
| date | VARCHAR(10) | `YYYY-MM-DD` |
| time | VARCHAR(20) | e.g. `2:00 PM` |
| status | VARCHAR(20) | `active` or `cancelled` |

**conversation_summaries** — Stores end-of-call summaries per user.

## Agent tools (voice)

Aria exposes these tools to the LLM:

| Tool | Purpose |
|------|---------|
| `identify_user_tool` | Resolve phone → `user_id` |
| `fetch_slots_tool` | Available times for a date |
| `book_appointment_tool` | Create appointment in DB |
| `retrieve_appointments_tool` | List user's appointments |
| `cancel_appointment_tool` | Cancel by ID |
| `modify_appointment_tool` | Reschedule |
| `end_conversation_tool` | End call with summary |

## Frontend screens

| Screen | Route (state) | Description |
|--------|---------------|-------------|
| Pre-call | `call` (not started) | Phone input + Start Call |
| In-call | `call` (started) | Orb, activity feed, End Call |
| Summary | `summary` | Call recap + appointments |

Call layout: **80%** agent panel (orb + controls), **20%** activity feed sidebar.

## Building for production

```powershell
# Frontend
cd frontend
npm run build
# Output: frontend/dist/

# Backend — run with production ASGI server
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000
python agent.py start   # LiveKit agent worker (not dev)
```

Serve `frontend/dist` via any static host; set `VITE_API_URL` to your API origin at build time.

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| Blank / crashed UI | Browser console; ensure LiveKit agent joined before speaking hooks run |
| No agent in room | `python agent.py dev` running; `LIVEKIT_*` env vars; agent name matches dispatch |
| Agent silent / 429 errors | Groq daily token limit — wait or upgrade tier / switch model |
| Activity feed empty | Backend running; WebSocket `ws://localhost:8000/ws/tools/{room}` reachable |
| Wrong user / duplicate phones | `phone_utils.py` normalizes last 10 digits; clean duplicate rows in SQLite |
| Mic not working | Browser permission; HTTPS or localhost required |

## License

Private / internal use unless otherwise specified.
