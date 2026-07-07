# Starts Postgres + Redis in Docker, then runs the backend (uvicorn) and
# frontend (vite) locally, each in its own PowerShell window.

$root = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path "$root\.env")) {
    Write-Host ".env not found — copy .env.example to .env and fill in your credentials first." -ForegroundColor Yellow
    exit 1
}

Write-Host "Starting Postgres + Redis containers..."
docker compose -f "$root\docker-compose.yml" up -d postgres redis
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to start containers — is Docker Desktop running?" -ForegroundColor Red
    exit 1
}

Write-Host "Starting backend at http://localhost:8000 ..."
Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$root\backend'; .\.venv\Scripts\Activate.ps1; uvicorn main:app --reload --port 8000"

Write-Host "Starting frontend at http://localhost:5173 ..."
Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$root\frontend'; npm run dev"

Write-Host ""
Write-Host "Claudius is starting:"
Write-Host "  Frontend: http://localhost:5173"
Write-Host "  Backend:  http://localhost:8000"
Write-Host "  API docs: http://localhost:8000/docs"
