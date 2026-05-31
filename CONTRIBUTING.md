# Contributing to Claudius

Thanks for your interest in contributing! This is a personal learning project, but PRs and issues are welcome.

## Development Setup

```bash
git clone https://github.com/goncalopereira13k/Claudius
cd Claudius
cp .env.example .env
# Fill in your API keys in .env
bash scripts/dev.sh
```

Services start at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API docs: http://localhost:8000/docs

## Project Structure

```
backend/app/
  agents/      Claude AI agent (tool use, context injection)
  api/routes/  REST endpoints
  models/      SQLAlchemy ORM models
  services/    Garmin, Strava, memory, pattern detection
  core/        Config and database setup

frontend/src/
  pages/       Dashboard, Activities, Analytics, Calendar, Chat
  components/  Shared layout and UI
  services/    Axios API client
  types/       TypeScript definitions

skill/reference/   Claude coach skill reference docs
```

## Making Changes

- **Backend**: Python 3.12 + FastAPI. Run `uvicorn main:app --reload` inside `backend/`.
- **Frontend**: React 18 + Vite. Run `npm run dev` inside `frontend/`.
- **Database migrations**: Use Alembic — `alembic revision --autogenerate -m "description"` then `alembic upgrade head`.

## Guidelines

- Keep PRs focused — one feature or fix per PR
- Backend: follow existing async/await patterns; don't block the event loop
- Frontend: typed props, no `any`
- No secrets in code — all credentials via `.env`

## Reporting Issues

Open a GitHub issue with steps to reproduce and your environment (OS, Python/Node version, Docker version).
