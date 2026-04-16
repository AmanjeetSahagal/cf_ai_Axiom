# Axiom

Axiom is an LLM evaluation platform for running prompt and model experiments against structured datasets, scoring outputs, and comparing run quality, latency, and cost.

## Stack

- Frontend: Next.js, TypeScript, Tailwind CSS, Recharts
- Backend: FastAPI, SQLAlchemy, Pydantic
- Data: PostgreSQL
- Queue: Redis
- Workers: Celery
- LLM provider: Gemini

## Project Layout

- `backend/` FastAPI API, services, models, workers
- `frontend/` Next.js product UI
- `docker-compose.yml` local Postgres and Redis

## Local Setup

### 1. Infrastructure

```bash
docker compose up -d postgres redis
```

Verify containers:

```bash
docker compose ps
```

### 2. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload
```

Verify the API:

```bash
curl http://localhost:8000/health
```

### 3. Worker

```bash
cd backend
source .venv/bin/activate
celery -A app.tasks.worker.celery_app worker --loglevel=info
```

### 4. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Frontend dev now clears `.next` automatically before startup. The explicit clean command is still available:

```bash
cd frontend
npm run dev:clean
```

Open:

- Frontend: `http://localhost:3000`
- Backend docs: `http://localhost:8000/docs`

## Boot Sequence

Use three terminals:

1. `docker compose up -d postgres redis`
2. `cd backend && source .venv/bin/activate && alembic upgrade head`
3. `cd backend && source .venv/bin/activate && uvicorn app.main:app --reload`
4. `cd backend && source .venv/bin/activate && celery -A app.tasks.worker.celery_app worker --loglevel=info`
5. `cd frontend && npm run dev`

## Current Caveats

- Generation, embeddings, and judge scoring use Gemini from `backend/app/services/llm.py` and `backend/app/services/evaluators.py`.
- The frontend stores the app token in `localStorage` after Firebase Google sign-in.
- Run `alembic upgrade head` before starting the API after schema changes.

## Firebase Auth Setup

Create a Firebase project, enable Google sign-in in Authentication, then fill:

- `frontend/.env.local`
  - `NEXT_PUBLIC_FIREBASE_API_KEY`
  - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
  - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
  - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
  - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
  - `NEXT_PUBLIC_FIREBASE_APP_ID`
- `backend/.env`
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_SERVICE_ACCOUNT_JSON`
  - or `FIREBASE_SERVICE_ACCOUNT_PATH`

Use one of:

- `FIREBASE_SERVICE_ACCOUNT_JSON`: full service account JSON serialized onto one line
- `FIREBASE_SERVICE_ACCOUNT_PATH`: absolute path to the downloaded Firebase service account JSON file

## MVP Status

This repository includes:

- JWT auth and user-scoped records
- dataset, prompt, run, and compare APIs
- generated and imported run modes
- prompt rendering and Gemini-backed evaluation
- Celery-based async run processing flow
- a frontend shell for login, dashboard, datasets, prompts, runs, and compare

Model calls are wrapped behind service boundaries so provider-specific logic can be hardened without changing route handlers.

Imported runs can evaluate precomputed `model_output` values stored on dataset rows without calling Gemini for generation.
