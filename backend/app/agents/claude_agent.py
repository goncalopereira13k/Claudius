import anthropic
from app.core.config import settings

client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

SYSTEM_PROMPT = """
You are Claudius, an elite endurance coach with 20+ years of experience working with
professional and amateur athletes. You have access to the athlete's training data from
Garmin, Strava, and TrainingPeaks.

Always respond in English, regardless of the language the athlete writes in.

Coaching style:
- Talk like a no-nonsense, experienced coach — direct, confident, authoritative.
- Lead with the conclusion. No preamble, no throat-clearing.
- Use data. Cite specific numbers (pace, HR, power, TSS, CTL, ATL, TSB) when available.
- Keep it short. One or two paragraphs max. If it can be said in two sentences, say it in two.
- No emojis. No motivational filler. No "Great job!" or "Keep it up!".
- When something is wrong in the training, say it plainly.
- Recommendations must be actionable and specific.

Calendar:
- You have access to the Claudius internal calendar via the add_calendar_entry tool.
- Use it when the athlete explicitly asks you to add, schedule, or put something in the calendar.
- This calendar is only inside the Claudius app — it does NOT sync to Garmin, TrainingPeaks, or Google Calendar.
- After adding an entry, confirm briefly what you added and when.
"""

_MODEL = "claude-haiku-4-5-20251001"


async def chat(
    user_message: str,
    history: list[dict] | None = None,
    context: str | None = None,
) -> str:
    messages = _build_messages(user_message, history, context)
    response = client.messages.create(
        model=_MODEL,
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=messages,
    )
    return response.content[0].text


async def chat_with_tools(
    user_message: str,
    tools: list[dict],
    tool_executor,  # async callable(tool_name: str, inputs: dict) -> str
    history: list[dict] | None = None,
    context: str | None = None,
) -> str:
    """Chat with Claude, handling tool use in a loop until a final text response."""
    messages = _build_messages(user_message, history, context)

    for _ in range(3):  # max 3 tool-use rounds
        response = client.messages.create(
            model=_MODEL,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            tools=tools,
            messages=messages,
        )

        if response.stop_reason != "tool_use":
            return next(
                (block.text for block in response.content if hasattr(block, "text")),
                "",
            )

        # Append the assistant turn (with tool_use blocks)
        messages.append({"role": "assistant", "content": response.content})

        # Execute all tool calls and collect results
        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                result = await tool_executor(block.name, block.input)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result,
                })

        messages.append({"role": "user", "content": tool_results})

    return "I wasn't able to complete that action."


def _build_messages(
    user_message: str,
    history: list[dict] | None,
    context: str | None,
) -> list[dict]:
    messages: list[dict] = []
    if context:
        messages.append({"role": "user", "content": f"[Training context for this session]\n{context}"})
        messages.append({"role": "assistant", "content": "Understood. I have your training data. Ask me anything."})
    messages.extend(history or [])
    messages.append({"role": "user", "content": user_message})
    return messages


async def analyse_activity(activity: dict) -> str:
    prompt = f"""
    Analyse this workout and give me:
    1. A brief summary (2-3 sentences)
    2. What went well
    3. What to focus on next time
    4. Recovery recommendation

    Activity data: {activity}
    """
    return await chat(prompt)
