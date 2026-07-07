"""LLM-as-judge evaluation: score each coach reply on grounding, actionability, and hallucination risk."""
import json
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.eval import ConversationEval

log = logging.getLogger("claudius")

_JUDGE_MODEL = "claude-haiku-4-5-20251001"

_JUDGE_PROMPT = """\
You are an objective evaluator of AI sports coaching responses. Score the COACH REPLY on three dimensions.

The coach had access to: the TRAINING CONTEXT, the CONVERSATION HISTORY, and the TOOL RESULTS below.
A claim grounded in ANY of those three sources counts as grounded — not a hallucination.

## Dimensions (all 0.0 to 1.0 floats)

**data_grounding** — Does the reply cite specific numbers from the athlete's actual data (context, history, or tool results)?
- 1.0 = multiple concrete metrics traceable to the sources (exact pace, HR bpm, TSS, specific dates)
- 0.5 = some data reference but vague ("your recent runs showed high HR")
- 0.0 = entirely generic, no numbers from any source

**actionability** — Is the advice specific and immediately actionable?
- 1.0 = concrete, time-bound prescription ("Run 50 min at HR 130–140 on Thursday")
- 0.5 = directional but vague ("do an easy run this week")
- 0.0 = pure analysis, no concrete recommendation

**hallucination_risk** — Does the reply make specific numeric or factual claims NOT present in the context, history, or tool results?
- 0.0 = every claim maps to one of the sources or is a sound general training principle
- 0.5 = one minor claim cannot be verified from any source
- 1.0 = makes specific numbers (paces, TSS values, dates) that appear in NO source

Return ONLY this JSON object — no other text:
{{"data_grounding": <float>, "actionability": <float>, "hallucination_risk": <float>, "reasoning": "<one sentence about hallucination_risk if > 0.3, else empty string>"}}

---
ATHLETE MESSAGE:
{user_message}

TRAINING CONTEXT (built from the athlete's synced data):
{training_context}

CONVERSATION HISTORY (earlier messages in this conversation):
{history}

TOOL RESULTS (data the coach retrieved while answering):
{tool_results}

COACH REPLY:
{coach_reply}"""


def _fmt_history(history: list[dict] | None, max_msgs: int = 6, max_chars: int = 600) -> str:
    if not history:
        return "(First message of the conversation.)"
    lines = []
    for m in history[-max_msgs:]:
        content = str(m.get("content", ""))
        if len(content) > max_chars:
            content = content[:max_chars] + " …[truncated]"
        lines.append(f"{m.get('role', '?').upper()}: {content}")
    return "\n".join(lines)


async def evaluate_response(
    user_message: str,
    coach_reply: str,
    training_context: str | None,
    conversation_id: int,
    message_id: int | None,
    db: AsyncSession,
    history: list[dict] | None = None,
    tool_results: str | None = None,
) -> ConversationEval | None:
    from app.agents.claude_agent import client

    ctx = (training_context or "(No training context available for this exchange.)")[:3000]
    tools_txt = (tool_results or "(No tools were called for this reply.)")[:3000]
    prompt = _JUDGE_PROMPT.format(
        user_message=user_message,
        training_context=ctx,
        history=_fmt_history(history),
        tool_results=tools_txt,
        coach_reply=coach_reply,
    )

    try:
        response = client.messages.create(
            model=_JUDGE_MODEL,
            max_tokens=256,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1].lstrip("json").strip()

        scores = json.loads(raw)
        dg  = max(0.0, min(1.0, float(scores["data_grounding"])))
        ac  = max(0.0, min(1.0, float(scores["actionability"])))
        hr  = max(0.0, min(1.0, float(scores["hallucination_risk"])))
        overall = round(0.35 * dg + 0.40 * ac + 0.25 * (1.0 - hr), 3)

        record = ConversationEval(
            conversation_id=conversation_id,
            message_id=message_id,
            data_grounding=dg,
            actionability=ac,
            hallucination_risk=hr,
            overall_score=overall,
            judge_model=_JUDGE_MODEL,
            judge_reasoning=scores.get("reasoning", ""),
        )
        db.add(record)
        await db.commit()
        log.info(
            "Eval conv=%d overall=%.2f grounding=%.2f action=%.2f halluc=%.2f",
            conversation_id, overall, dg, ac, hr,
        )
        return record

    except Exception as e:
        log.warning("Evaluation failed for conversation %d: %s", conversation_id, e)
        return None
