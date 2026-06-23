# EchoCareAI — Voice Appointment Assistant

EchoCareAI is a healthcare voice receptionist that lets patients call in, speak naturally with an AI agent named **Aria**, and book, check, modify, or cancel clinic appointments. Appointments are stored in a local SQLite database with hardcoded availability slots and double-booking prevention.

**Production URLs (example deployment)**

| Service | URL |
|---------|-----|
| Frontend (Vercel) | https://echocareai.vercel.app |
| Backend API (Railway) | https://healthcare-ai-receptionist-production.up.railway.app |

## Architecture

```
┌─────────────────┐     WebSocket (tool events)     ┌──────────────────────────────┐
│  React Frontend │ ◄────────────────────────────── │  Railway (single service)    │
│  (Vite + LK)    │     REST API + LiveKit token    │  ┌──────────┐ ┌───────────┐ │
└────────┬────────┘                                 │  │ FastAPI  │ │ LiveKit   │ │
         │                                          │  │ uvicorn  │ │ agent.py  │ │
         │  LiveKit WebRTC audio                    │  │ :$PORT   │ │ (worker)  │ │
         ▼                                          │  └──────────┘ └───────────┘ │
┌─────────────────┐     agent dispatch              │         start.sh             │
│  LiveKit Cloud  │ ◄───────────────────────────────┴──────────────────────────────┘
│  (room audio)   │              SQLite
└─────────────────┘
         Deepgram STT · Groq LLM · Cartesia TTS
```

| Layer | Tech |
|-------|------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4, LiveKit Components |
| Backend API | FastAPI, SQLAlchemy, SQLite |
| Voice agent | LiveKit Agents, Deepgram (STT), Groq (LLM), Cartesia (TTS) |
| Realtime | LiveKit Cloud rooms + WebSocket activity feed |
| Deploy | Railway (backend), Vercel (frontend) |

On **Railway**, one service runs both processes via `backend/start.sh`: the LiveKit agent worker in the background and FastAPI (uvicorn) in the foreground on `$PORT`.


## Features

- **Voice-first booking** — Patients talk to Aria; no forms during the call.
- **User identification** — Lookup or create user by phone number before joining the room.
- **Hardcoded slots** — `10:00 AM`, `11:00 AM`, `2:00 PM`, `3:00 PM`, `4:00 PM` per day.
- **Double-booking prevention** — Same date + time cannot be booked twice while `active`.
- **Live activity feed** — Tool calls (identify, fetch slots, book, etc.) stream to the UI via WebSocket.
- **Call summary** — End-of-call screen with summary and appointment list.
- **Animated agent avatar** — Speaking indicator on the in-call screen.

## Prerequisites

- **Python 3.12+** (matches `backend/nixpacks.toml`)
- **Node.js 20+**
- Accounts / API keys for:
  - [LiveKit Cloud](https://livekit.io/)
  - [Groq](https://groq.com/) (LLM)
  - [Deepgram](https://deepgram.com/) (speech-to-text)
  - [Cartesia](https://cartesia.ai/) (text-to-speech)


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

Use **three terminals** (same as production logic, but agent uses `dev` mode):

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

## Deploying to Railway (backend)

One Railway service runs **both** the API and the LiveKit agent worker.

### Service settings

| Setting | Value |
|---------|--------|
| **Root Directory** | `/backend` |
| **Start command** | `sh start.sh` (from `railway.toml`) |
| **Builder** | Nixpacks (`backend/nixpacks.toml`) |

`start.sh` does the following:

```sh
python agent.py start &                              # LiveKit worker (background)
exec python -m uvicorn main:app --host 0.0.0.0 --port "$PORT"   # API (foreground)
```

Uvicorn **must** stay in the foreground on `$PORT` — that is what Railway’s public URL proxies to.

### Networking (critical)

After deploy, check **Deploy Logs** for the port uvicorn binds to, e.g.:

```
INFO: Uvicorn running on http://0.0.0.0:8080
```

In **Settings → Networking**, the domain’s target port **must match** that port (e.g. `8080`, not `8000`). A mismatch causes **502 Bad Gateway** on `/health` and `/api/identify` even when the app started successfully.

### Verify deployment

```text
GET https://your-service.up.railway.app/health
→ {"status":"ok"}
```

Deploy logs should show **both**:

- `Uvicorn running on http://0.0.0.0:...`
- `registered worker` with `agent_name: mykare-receptionist`

### Optional: split into two Railway services

For higher reliability, you can run API and agent separately:

| Service | Start command | Public domain |
|---------|---------------|---------------|
| API | `python -m uvicorn main:app --host 0.0.0.0 --port $PORT` | Yes |
| Agent | `python agent.py start` | No |

See `backend/railway.agent.toml` for the agent-only config. Both services need the same LiveKit and AI provider env vars.

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
| In-call | `call` (started) | Avatar, activity feed, End Call |
| Summary | `summary` | Call recap + appointments |

Call layout: **80%** agent panel (avatar + controls), **20%** activity feed sidebar.

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| **502 Bad Gateway** on API | Uvicorn port vs Railway Networking port — they must match. Check `/health` first. |
| **CORS / Failed to fetch** | Usually a 502 side effect. Fix the API first. Then verify `CORS_ORIGINS` includes your Vercel URL. |
| **"Aria is joining the room…" forever** | Agent worker not running. Deploy logs need `registered worker` + `mykare-receptionist`. Ensure `start.sh` is used, not uvicorn-only. |
| **Agent dispatch fails** | API logs show `Failed to dispatch agent...`. Check `LIVEKIT_*` keys and `LIVEKIT_AGENT_NAME` matches on API and agent. |
| **Activity feed empty** | WebSocket to `/ws/tools/{room}` must reach the API. Agent posts events via `API_URL` (defaults to `127.0.0.1:$PORT` in same container). |
| **No agent locally** | Run `python agent.py dev` in a second terminal. |
| **Agent silent / 429 errors** | Groq daily token limit — wait or upgrade tier / switch model. |
| **Mic not working** | Browser permission; HTTPS or localhost required. |
| **Wrong user / duplicate phones** | `phone_utils.py` normalizes last 10 digits; clean duplicate rows in SQLite. |
| **Vercel still hits localhost** | `VITE_API_BASE_URL` not set at build time — redeploy Vercel after setting the variable. |

## License

MIT
