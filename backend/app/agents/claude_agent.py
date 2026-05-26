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
"""


async def chat(user_message: str, context: str | None = None) -> str:
    messages = []

    if context:
        messages.append({
            "role": "user",
            "content": f"Context about my recent training:\n{context}\n\nQuestion: {user_message}",
        })
    else:
        messages.append({"role": "user", "content": user_message})

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=messages,
    )
    return response.content[0].text


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
