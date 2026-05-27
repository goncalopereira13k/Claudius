# ML Memory System — How It Works

Claudius learns about the user across three interconnected systems: **conversation memory**, **data pattern detection**, and a **coaching feedback loop**. All three feed into the context injected to Claude at the start of each new conversation.

---

## Architecture Overview

```
User sends message
        │
        ▼
  ┌─────────────────────────────────────────┐
  │  First message of conversation?         │
  │  YES → build_training_context()         │
  │         ├─ recent activities            │
  │         ├─ health & recovery data       │
  │         ├─ plan vs actual               │
  │         ├─ upcoming workouts            │
  │         ├─ get_memory_context()    ←──────── user_memories table
  │         └─ get_pattern_context()   ←──────── training_patterns table
  │  NO  → no context injection             │
  └─────────────────────────────────────────┘
        │
        ▼
  Claude generates reply
        │
        ▼  (fire-and-forget, after HTTP response is sent)
  ┌─────────────────────────────────┐
  │ extract_and_save_memories()     │ ←── reads conversation, calls Claude, stores facts
  │ extract_suggestions()           │ ←── finds actionable suggestions, stores them
  └─────────────────────────────────┘

After each data sync:
  detect_patterns()             ←── runs 5 statistical detectors on activity/health data
  check_suggestion_followthrough() ←── checks if previous suggestions were acted on
```

---

## How Embeddings Work

**Model**: `all-MiniLM-L6-v2` from sentence-transformers (fully local, ~90 MB, no API key needed)

**Dimensions**: 384 floats per embedding

**What embeddings do**: They convert text into a point in 384-dimensional space such that semantically similar texts are close together. Two memories like "Athlete prefers morning training" and "User likes to train early in the day" will have a very high similarity score (~0.92), while "Athlete's FTP is 280W" and "Athlete prefers morning training" will be far apart (~0.25).

**Storage**: Embeddings are stored in PostgreSQL using the `pgvector` extension, which adds a native `vector(384)` column type and the `<=>` cosine distance operator.

**Lazy loading**: The model is loaded on first use (not at startup) to avoid adding ~5 seconds to boot time. After the first embedding call, it stays in memory for the process lifetime.

**Why this model?**: It is fast (CPU inference in ~5ms per sentence), small (90 MB), and scores well on semantic similarity benchmarks. It requires no internet connection after the first download.

---

## Memory Extraction

**When it runs**: After every chat message, as a background task (does not block the response).

**How it works**:

1. The full conversation is formatted as a dialogue string.
2. Claude Haiku is called with a focused extraction prompt asking for a JSON array of facts.
3. For each extracted item, an embedding is computed.
4. The new embedding is compared against the 50 most recent existing memories using cosine similarity.
5. If similarity ≥ 0.85 (near-duplicate), the memory is skipped.
6. New, unique memories are saved to the `user_memories` table.

**What gets extracted** (examples):
- `[goal]` "Athlete's goal is to qualify for the Boston Marathon in 2027." (importance: 0.9)
- `[preference]` "Athlete prefers concise, data-heavy responses." (importance: 0.6)
- `[fact]` "Athlete has a history of plantar fasciitis in the left foot." (importance: 0.7)
- `[feedback]` "Athlete felt the threshold session on Thursday was too hard." (importance: 0.8)

**Context injection**: At the start of a new conversation, the top 10 memories are ranked by `importance_score × log(1 + access_count)` and appended to the training context. This surfaces memories that are both important and frequently relevant.

**Deduplication threshold**: 0.85. Adjust in `memory_service.py → _DEDUP_THRESHOLD` if memories are too repetitive (increase) or too many duplicates slip through (decrease).

---

## Pattern Detection

**When it runs**: After every data sync (startup sync and manual `/api/sync/trigger`).

**How it works**: Five statistical detectors analyse the activity and health data. Each detector checks whether a fresh (non-expired) pattern of that type already exists before running — if it does, it skips.

### The Five Detectors

| Pattern | Data used | Method | Refresh interval |
|---|---|---|---|
| `sleep_performance` | DailyHealth.sleep_score + Activity.avg_hr (next day) | Pearson r | 7 days |
| `hrv_trend` | DailyHealth.avg_hrv (21 days) | Linear regression slope | 3 days |
| `training_load_trend` | Activity.tss (4 weeks) | % change last 2 vs prior 2 weeks | 7 days |
| `dow_performance` | Activity.tss grouped by weekday | Mean TSS per weekday | 14 days |
| `recovery_patterns` | Activity.start_date for TSS>80 sessions | Mean gap in hours | 7 days |

**Minimum data requirements**: Each detector has a minimum number of data points before it will produce a pattern (e.g., sleep_performance requires 7 sleep+run pairs, hrv_trend requires 7 HRV records). If there is not enough data, no pattern is saved.

**Expiry**: Patterns have an `expires_at` timestamp. After expiry, the next sync will re-run the detector with fresh data. Patterns without an `expires_at` never expire (reserved for manually pinned patterns).

---

## Coaching Feedback Loop

**When it runs**: Suggestion extraction runs after every chat response (background). Followthrough checking runs after every data sync.

### Step 1: Extract suggestions

After Claude's response, a second Claude Haiku call extracts concrete, actionable recommendations (e.g., "Run 45 minutes easy tomorrow, HR under 140bpm"). Each suggestion is embedded and stored in `coaching_suggestions`.

### Step 2: Check followthrough

After each sync, the system looks at suggestions from the last 14 days where `was_followed` is still `NULL`. For each:
- It finds activities in the 48h window after the suggestion was made.
- It applies simple heuristics:
  - **Rest day** suggestion → was there a high-TSS (>50) activity? If not: followed.
  - **Sport keyword** (run/ride/swim) → was there a matching activity type?
  - **HR target** ("HR under 140") → did the actual avg_hr meet the target?
- `was_followed` is set to `True` or `False`. If no heuristic matches, a note is added but the flag stays `NULL`.

---

## Context Injection Format

The final block injected into Claude on the first message of a conversation:

```
Today: 2026-05-27

Recent activities (last 10):
  2026-05-26  running  12.3km  58min  HR:142/168  pace:4:42/km  TSS:72

Health & recovery (last 7 days):
  2026-05-26  RHR:42bpm  HRV:68ms(balanced)  sleep:7.2h(score:83)  battery:35-89

Plan vs actual (last 2 weeks) — PLAN is what was scheduled:
  2026-05-25  running  PLAN:"Easy recovery 45min"  →  ACTUAL: 12.3km 58min HR:142

Upcoming workouts (next 2 weeks):
  2026-05-28  running  Threshold intervals 6×1km

Athlete memory (what I know about this athlete):
- [goal] Goal is to run a sub-4h marathon in October 2026. (importance: 0.9)
- [preference] Athlete prefers morning training sessions.
- [fact] Athlete has had recurring calf tightness on longer runs.

Detected training patterns:
- [hrv_trend] HRV declining 0.6ms/day over 21 days. Consider reducing intensity.
- [sleep_performance] Better sleep correlates with lower running HR next day (r=-0.68).
- [training_load_trend] Training load increased 28% in last 2 weeks vs prior 2 weeks.
```

---

## Inspecting and Managing Memories

| Endpoint | Description |
|---|---|
| `GET /api/memory/list` | All memories, sorted by importance descending |
| `DELETE /api/memory/{id}` | Delete a specific memory |
| `GET /api/memory/patterns` | All currently active (non-expired) patterns |
| `GET /api/memory/suggestions` | Recent coaching suggestions and followthrough status |

---

## Extending the System

### Adding a new pattern detector

1. Write an `async def _detect_<name>(db: AsyncSession) -> TrainingPattern | None` function in `pattern_service.py`.
2. Add it to the `_DETECTORS` list at the bottom of the file.
3. Set an appropriate `expires_at` (shorter = fresher data, more compute).

### Adding a new memory category

1. Add the new value to `MemoryCategory` enum in `backend/app/models/memory.py`.
2. Update the extraction prompt in `memory_service.py` to include the new category in the description.
3. Run a DB migration (or let SQLAlchemy recreate the enum type).

### Changing deduplication sensitivity

Edit `_DEDUP_THRESHOLD` in `memory_service.py`:
- Higher (e.g., 0.95) → fewer duplicates skipped, more memories stored
- Lower (e.g., 0.75) → more aggressive deduplication

---

## Telegram Proactive Messaging (Future)

The architecture is built to support proactive post-run messages without structural changes:

- `CoachingSuggestion.suggestion_embedding` is already stored so that, after a run syncs, a Telegram bot can find which previous suggestions this run might be addressing via vector similarity.
- `retrieve_relevant_memories(query, db)` in `memory_service.py` accepts any trigger text — a post-run message can query "completed 10km run at 5:30/km HR 142" and get the most relevant memories about this athlete.
- The future implementation needs: a `POST /api/notify/activity/{activity_id}` endpoint that triggers a Telegram push, and a webhook listener in the Telegram bot service.

---

## Privacy Note

All embeddings and memories are stored locally in your PostgreSQL instance. No training data, conversation content, or embeddings are sent to any external service. Only the Claude API calls (for extraction prompts) leave your infrastructure.
