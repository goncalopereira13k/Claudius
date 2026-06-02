import httpx
import json
from app.core.config import settings

STRAVA_API = "https://www.strava.com/api/v3"
STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"


async def get_valid_access_token() -> str | None:
    """Return a valid access token, refreshing if needed. Falls back to dev token."""
    # TODO: load per-user token from DB; for now use dev token from .env
    access_token = settings.STRAVA_DEV_ACCESS_TOKEN
    if not access_token:
        return None

    # Check if token is still valid by making a lightweight request
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{STRAVA_API}/athlete",
            headers={"Authorization": f"Bearer {access_token}"},
        )

    if resp.status_code == 200:
        return access_token

    # Token expired — refresh it
    return await refresh_access_token(settings.STRAVA_DEV_REFRESH_TOKEN)


async def refresh_access_token(refresh_token: str) -> str | None:
    """Exchange a refresh token for a new access token."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(STRAVA_TOKEN_URL, data={
            "client_id":     settings.STRAVA_CLIENT_ID,
            "client_secret": settings.STRAVA_CLIENT_SECRET,
            "grant_type":    "refresh_token",
            "refresh_token": refresh_token,
        })

    if resp.status_code != 200:
        return None

    data = resp.json()
    # TODO: persist new tokens to DB
    return data.get("access_token")


async def sync_strava(access_token: str | None = None) -> list[dict]:
    """Fetch recent activities from Strava API."""
    token = access_token or await get_valid_access_token()
    if not token:
        return []

    async with httpx.AsyncClient() as client:
        all_raw = []
        page = 1
        while True:
            resp = await client.get(
                f"{STRAVA_API}/athlete/activities",
                headers={"Authorization": f"Bearer {token}"},
                params={"per_page": 200, "page": page},
            )
            if resp.status_code != 200:
                break
            batch = resp.json()
            if not batch:
                break
            all_raw.extend(batch)
            if len(batch) < 200:
                break
            page += 1

    if not all_raw:
        return []

    raw = all_raw
    from datetime import datetime
    from sqlalchemy import select
    from app.core.database import AsyncSessionLocal
    from app.models.activity import Activity, Source

    async with AsyncSessionLocal() as session:
        for item in raw:
            external_id = str(item.get("id", ""))
            if not external_id:
                continue
            existing = await session.scalar(
                select(Activity).where(Activity.external_id == external_id)
            )
            if existing:
                continue

            start_str = item.get("start_date_local", "")
            try:
                start_date = datetime.fromisoformat(start_str.rstrip("Z"))
            except (ValueError, AttributeError):
                start_date = None

            distance = float(item.get("distance") or 0)

            # Skip if a non-Strava activity already exists on the same day with a similar
            # distance (within 5%) — avoids Garmin/Strava duplicates of the same workout.
            if start_date and distance > 0:
                day_start = start_date.replace(hour=0, minute=0, second=0, microsecond=0)
                day_end   = start_date.replace(hour=23, minute=59, second=59, microsecond=0)
                duplicate = await session.scalar(
                    select(Activity).where(
                        Activity.source != Source.strava,
                        Activity.start_date >= day_start,
                        Activity.start_date <= day_end,
                        Activity.distance_meters.between(distance * 0.95, distance * 1.05),
                    )
                )
                if duplicate:
                    continue

            splits = item.get("splits_metric") or []
            session.add(Activity(
                external_id=external_id,
                source=Source.strava,
                name=item.get("name", ""),
                sport_type=item.get("sport_type") or item.get("type", ""),
                start_date=start_date,
                duration_seconds=int(item.get("elapsed_time") or 0),
                distance_meters=distance,
                avg_hr=item.get("average_heartrate"),
                avg_power=item.get("average_watts"),
                tss=None,
                laps_json=json.dumps(splits) if splits else None,
            ))
        await session.commit()

    return raw
