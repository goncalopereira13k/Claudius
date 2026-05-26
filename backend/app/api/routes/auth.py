from fastapi import APIRouter
from fastapi.responses import RedirectResponse
import httpx
from app.core.config import settings

router = APIRouter()

STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize"
STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"


@router.get("/strava")
async def strava_auth():
    url = (
        f"{STRAVA_AUTH_URL}"
        f"?client_id={settings.STRAVA_CLIENT_ID}"
        f"&redirect_uri={settings.STRAVA_REDIRECT_URI}"
        f"&response_type=code"
        f"&scope=activity:read_all"
    )
    return RedirectResponse(url)


@router.get("/strava/callback")
async def strava_callback(code: str):
    async with httpx.AsyncClient() as client:
        resp = await client.post(STRAVA_TOKEN_URL, data={
            "client_id": settings.STRAVA_CLIENT_ID,
            "client_secret": settings.STRAVA_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
        })
    token_data = resp.json()
    # TODO: persist token_data to DB / Redis
    return {"status": "ok", "athlete": token_data.get("athlete", {}).get("username")}
