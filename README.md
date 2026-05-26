# ⚡ Claudius

Claudius — o teu agente pessoal de treino com IA — agrega dados do Garmin, Strava e TrainingPeaks e usa Claude como agente de coaching.

## Stack

| Camada       | Tecnologia                            |
|--------------|---------------------------------------|
| Frontend     | React 18 + Vite + TypeScript + Tailwind |
| Backend      | Python FastAPI + SQLAlchemy           |
| Base de dados| PostgreSQL + Redis (cache)            |
| IA           | Claude (Anthropic API)                |
| Bot          | Python Telegram Bot                   |
| Infra        | Docker Compose                        |

## Arquitetura

```
Garmin API ─┐
Strava API  ├─► FastAPI Backend ─► PostgreSQL
TP API     ─┘        │
                      ├─► React Dashboard (localhost:5173)
Claude API ──────────┤
                      └─► Telegram Bot (agente pessoal)
```

## Setup rápido

```bash
git clone https://github.com/TU_USERNAME/claudius
cd claudius
cp .env.example .env
# Preenche as API keys no .env
bash scripts/setup.sh
bash scripts/dev.sh
```

## Estrutura do projecto

```
claudius/
├── backend/
│   └── app/
│       ├── api/routes/      # FastAPI endpoints
│       ├── agents/          # Claude agent logic
│       ├── models/          # SQLAlchemy models
│       ├── services/        # Garmin, Strava, TP clients
│       └── core/            # Config, settings
├── frontend/
│   └── src/
│       ├── components/      # Layout, charts, chat UI
│       ├── pages/           # Dashboard, Activities, Analytics, Chat
│       ├── services/        # API client (axios)
│       └── types/           # TypeScript types
├── telegram-bot/
│   └── bot.py               # Agente Telegram
├── docker-compose.yml
├── .env.example
└── scripts/
    ├── setup.sh
    └── dev.sh
```

## API Keys necessárias

| Serviço       | Onde obter                                        |
|---------------|---------------------------------------------------|
| Garmin        | Email/password da conta Garmin Connect            |
| Strava        | https://www.strava.com/settings/api               |
| TrainingPeaks | https://developers.trainingpeaks.com/             |
| Anthropic     | https://console.anthropic.com/                    |
| Telegram Bot  | @BotFather no Telegram → /newbot                  |

## Roadmap

- [x] Estrutura base do projecto
- [x] Autenticação OAuth Strava
- [x] Sync Garmin via garth
- [x] Agente Claude (chat + análise de treino)
- [x] Bot Telegram básico
- [ ] Dashboard com charts (recharts)
- [ ] Página de analytics avançada (CTL/ATL/TSB)
- [ ] Sync automático agendado (APScheduler)
- [ ] Notificações Telegram diárias
- [ ] Deploy (Railway / Render / VPS)

## Aprendizagem AI Engineering

Este projecto cobre:
- **APIs REST** — design, OAuth2, async Python
- **AI Agents** — system prompts, context injection, tool use (próximo passo)
- **Data pipelines** — sync, normalização, storage
- **Prompt engineering** — coaching prompts, análise de dados
