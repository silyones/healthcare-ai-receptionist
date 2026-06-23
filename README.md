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

## Project structure

```
voice-assistant/
├── railway.toml              # Deploy config (repo root)
├── backend/
│   ├── agent.py              # LiveKit voice agent (Aria)
│   ├── main.py               # FastAPI server, tokens, REST, WebSocket
│   ├── start.sh              # Production: agent + uvicorn in one container
│   ├── tools.py              # Appointment CRUD, slots, identify user
│   ├── models.py             # SQLAlchemy models
│   ├── db.py                 # DB engine + migrations runner
│   ├── phone_utils.py        # Phone normalization / lookup
│   ├── tool_events.py        # Agent → API → WebSocket activity feed
│   ├── ws_tools.py           # WebSocket connection manager
│   ├── migrations/           # SQL migrations (applied on startup)
│   ├── nixpacks.toml         # Railway/Nixpacks Python version
│   ├── railway.toml          # Deploy config when Root Directory = /backend
│   ├── railway.agent.toml    # Optional: separate agent-only Railway service
│   ├── requirements.txt
│   └── .env                  # Secrets (not committed)
├── frontend/
│   ├── src/
│   │   ├── App.tsx           # Screen routing (call ↔ summary)
│   │   ├── api.ts            # Backend API + WebSocket URL helpers
│   │   ├── components/
│   │   │   ├── VoiceAgent.tsx    # Call UI, LiveKit room, activity feed
│   │   │   ├── AgentAvatar.tsx   # In-call avatar (speaking animation)
│   │   │   ├── OrbComponent.tsx  # Canvas plasma orb (available, optional)
│   │   │   ├── Navbar.tsx
│   │   │   ├── CallSummary.tsx
│   │   │   └── ui/avatar.tsx
│   │   └── hooks/
│   │       └── useAgentTalking.ts
│   ├── vite.config.ts
│   └── package.json
└── README.md
```

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

## Environment variables

Create `backend/.env` locally (never commit real keys):

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
CORS_ORIGINS=http://localhost:5173,https://echocareai.vercel.app
```

### Frontend (build time)

Set in Vercel (or `.env` for local builds):

```env
VITE_API_BASE_URL=https://healthcare-ai-receptionist-production.up.railway.app
```

Vite bakes this into the bundle at **build time**. After changing it, redeploy the frontend.

### Railway (backend service)

Copy the same `backend/.env` values into **Railway → Variables** for the API service. When API and agent run in one container (`start.sh`), they share the same env.

`API_URL` defaults to `http://127.0.0.1:$PORT` in `tool_events.py` so the agent can POST tool events to the local FastAPI process inside the same container. You usually do not need to set `API_URL` on Railway unless debugging.

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

## Deploying to Vercel (frontend)

1. Import the repo and set **Root Directory** to `frontend`.
2. Add environment variable:
   ```env
   VITE_API_BASE_URL=https://your-railway-service.up.railway.app
   ```
3. Deploy. Redeploy after any change to `VITE_API_BASE_URL`.
4. Add your Vercel URL to `CORS_ORIGINS` on Railway if it is not already covered (default includes `https://echocareai.vercel.app`).

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

WebSocket URLs use `wss://` when `VITE_API_BASE_URL` is HTTPS (see `frontend/src/api.ts`).

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
