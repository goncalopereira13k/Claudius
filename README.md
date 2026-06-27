# Claudius

A personal AI training coach that aggregates your endurance data from Garmin and Strava and lets you talk to it through Claude. Built as a learning project in AI Engineering.

![Claudius dark mode](claudius-04-dark.png)

## What it does

- **Syncs** your Garmin activities and planned workouts from the Garmin calendar
- **Connects** to Strava via OAuth to pull additional training data
- **Coaches** you through a Claude-powered chat — direct, data-driven, no fluff
- **Calendar** shows planned workouts vs completed sessions with a Plan vs Actual comparison table
- **Remembers** your training patterns using ML embeddings (pgvector) to give context-aware responses

## Stack

| Layer     | Technology                                        |
|-----------|---------------------------------------------------|
| Frontend  | React 18 + Vite + TypeScript + Tailwind CSS       |
| Backend   | Python 3.12 + FastAPI + SQLAlchemy (async)        |
| Database  | PostgreSQL 16 with pgvector extension             |
| Cache     | Redis                                             |
| AI        | Claude (Anthropic API) — Sonnet for chat, tool use |
| Sync      | Garmin Connect (garth), Strava OAuth2             |
| ML        | sentence-transformers for activity embeddings     |
| Infra     | Docker Compose                                    |

## Architecture

```
Garmin API ──┐
Strava API   ├──► FastAPI Backend ──► PostgreSQL + pgvector
             │         │
             └─────────├──► React Dashboard  (localhost:5173)
Claude API ────────────┤
                        └──► Redis (session cache)
```

## AI Coach — How it works

```mermaid
flowchart TD
    subgraph Sync["Data Ingestion (on demand)"]
        GA[Garmin Connect API] -->|activities · laps · calendar| SG[sync_garmin]
        SA[Strava API] -->|activities · splits| SS[sync_strava]
        SG & SS -->|upsert| DB[(PostgreSQL + pgvector)]
        DB -->|embed new activities| EMB[sentence-transformers]
        EMB -->|store vector| DB
    end

    subgraph Chat["AI Coach Chat Flow"]
        U([User message\nReact Chat UI]) -->|POST /api/agent/chat| API[FastAPI]

        API --> CTX{First message\nin conversation?}

        CTX -->|Yes| BC[build_training_context]
        BC -->|last 10 activities\n7-day health data\nplanned workouts\npgvector similarity| DB
        BC --> MERGE[Inject context into prompt]

        CTX -->|No| HIST[Load conversation\nhistory from DB]
        MERGE & HIST --> LLM

        LLM["Claude Sonnet\nchat_with_tools\nup to 6 tool rounds"] --> TR{Tool call\nneeded?}

        TR -->|yes| TOOL[Tool Executor]
        TOOL --> T1[search_training_history\nfilter by sport · distance · TSS]
        TOOL --> T2[get_activities\nrecent runs with pace + HR]
        TOOL --> T3[get_activity_detail\nlap splits from Garmin API or DB cache]
        TOOL --> T4[add · get · delete\ncalendar entry]
        T1 & T2 & T3 & T4 -->|tool result| LLM

        TR -->|final text| REPLY[Reply text]
        REPLY -->|save| DB
        REPLY --> U2([Response to user])

        REPLY -->|async fire-and-forget| BG[Background tasks]
        BG --> MEM[Memory extraction\nextract_and_save_memories]
        BG --> SUG[Suggestion extraction\nextract_suggestions]
        MEM & SUG --> DB
    end
```

## Prerequisites

- Docker and Docker Compose
- A [Garmin Connect](https://connect.garmin.com) account
- A [Strava](https://www.strava.com/settings/api) API app (free)
- An [Anthropic API key](https://console.anthropic.com)

## Quick start

```bash
git clone https://github.com/goncalopereira13k/Claudius
cd Claudius
cp .env.example .env
# Fill in your credentials in .env
bash scripts/dev.sh
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API docs (Swagger): http://localhost:8000/docs

## Environment variables

Copy `.env.example` to `.env` and fill in the values:

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key — get it at console.anthropic.com |
| `GARMIN_EMAIL` | Your Garmin Connect email |
| `GARMIN_PASSWORD` | Your Garmin Connect password |
| `STRAVA_CLIENT_ID` | Strava app Client ID |
| `STRAVA_CLIENT_SECRET` | Strava app Client Secret |
| `STRAVA_REDIRECT_URI` | OAuth callback — default `http://localhost:8000/api/auth/strava/callback` |
| `STRAVA_DEV_ACCESS_TOKEN` | Dev-only: your personal access token from strava.com/settings/api |
| `STRAVA_DEV_REFRESH_TOKEN` | Dev-only: your refresh token from strava.com/settings/api |
| `DB_USER` | Postgres user (default: `claudius`) |
| `DB_PASSWORD` | Postgres password (default: `claudius`) |
| `DB_NAME` | Postgres database name (default: `claudius`) |

> **Note on Strava tokens**: `STRAVA_DEV_ACCESS_TOKEN` and `STRAVA_DEV_REFRESH_TOKEN` are a shortcut for single-user development. In a multi-user setup these would be persisted per-user after OAuth.

## Project structure

```
Claudius/
├── backend/
│   ├── app/
│   │   ├── agents/          # Claude agent — system prompt, tool use, chat loop
│   │   ├── api/routes/      # FastAPI endpoints (activities, sync, agent, calendar, memory)
│   │   ├── models/          # SQLAlchemy ORM models
│   │   ├── services/        # Garmin, Strava, embedding, pattern detection
│   │   └── core/            # Config, database session
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── pages/           # Dashboard, Activities, Analytics, Calendar, Chat
│       ├── components/      # Shared layout
│       ├── services/        # Axios API client
│       └── types/           # TypeScript types
├── skill/
│   └── reference/           # Claude coach skill reference docs (periodization, zones, etc.)
├── scripts/
│   ├── setup.sh
│   └── dev.sh
├── docker-compose.yml
└── .env.example
```

## Key API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/sync/trigger` | Trigger Garmin + Strava sync |
| `GET`  | `/api/sync/calendar` | Planned workouts from Garmin calendar |
| `GET`  | `/api/activities` | Paginated activity list |
| `POST` | `/api/agent/chat` | Send a message to the Claude coach |
| `GET`  | `/api/auth/strava` | Start Strava OAuth flow |
| `GET`  | `/api/memory` | Retrieve stored training memories |

Full interactive docs at http://localhost:8000/docs when running locally.

## ML memory system

Each activity is embedded with `sentence-transformers` and stored in PostgreSQL via pgvector. When you chat with the coach, relevant past activities are retrieved by semantic similarity and injected into the Claude context. See [`backend/docs/ml_memory_system.md`](backend/docs/ml_memory_system.md) for details.

## Roadmap

- [x] Garmin activity sync
- [x] Planned workouts via Garmin calendar
- [x] Strava OAuth integration
- [x] Claude AI coach (chat + tool use)
- [x] ML memory with pgvector embeddings
- [x] Calendar — Plan vs Actual comparison
- [ ] Analytics page — CTL / ATL / TSB form curve
- [ ] Scheduled auto-sync (APScheduler)
- [ ] Production deployment guide

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).
