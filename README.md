# Job Automation v1

Fully local AI-assisted job discovery, scoring, resume tailoring, recruiter outreach, and human-reviewed application preparation. AI runs through Ollama only, and candidate data is loaded from `config/candidate_profile.json`.

## Setup

```powershell
npm install
npm run prisma:generate
```

Copy `.env.example` to `.env` and set:

- `OLLAMA_URL=http://localhost:11434`
- `OLLAMA_MODEL=qwen2.5-coder:14b`
- `DB_ENABLED=true` only when Postgres is running
- `DATABASE_URL` for PostgreSQL
- `LIVE_BROWSER_DISCOVERY=true` only after logging in to browser profiles

Install and start Ollama, then pull the local model:

```powershell
ollama pull qwen2.5-coder:14b
ollama pull llama3.1
```

Or:

```powershell
npm run ollama:pull
```

## Commands

```powershell
npm run demo
npm run live -- --limit=25 --llm=false
npm run live -- --limit=25
npm run scheduler
npm run backend
npm run dashboard
```

## Login Sessions

Run once per platform:

```powershell
npm run login:linkedin
npm run login:instahyre
```

Run: pip install reportlab

These use `chromium.launchPersistentContext()` and store cookies under `profiles/`. Passwords are not stored by the app.


## PostgreSQL

Local Docker:

```powershell
docker compose up postgres redis
npm run prisma:push
```

Then set `DB_ENABLED=true`.

JSON compatibility remains available through `tracker/applications.json`.

## Apply Safety

The default flow does not submit applications. It prepares the page and pauses for human review.

Auto-submit remains disabled unless all of these are true:

- `AUTO_SUBMIT=true`
- supported ATS
- confidence >= 8.5
- low-risk form

## Deployment

`docker-compose.yml` includes:

- backend
- playwright-worker
- dashboard
- postgres
- redis
- ollama

For production, run browser automation on a VPS worker with persistent volumes for `profiles/`.
