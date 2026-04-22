from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.auth import router as auth_router
from app.api.routes.compare import router as compare_router
from app.api.routes.datasets import router as datasets_router
from app.api.routes.provider_keys import router as provider_keys_router
from app.api.routes.prompts import router as prompts_router
from app.api.routes.runs import router as runs_router
from app.api.routes.seed import router as seed_router
from app.core.config import settings

app = FastAPI(title=settings.app_name)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url,
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "http://127.0.0.1:3001",
        "http://localhost:3001",
    ],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(datasets_router)
app.include_router(prompts_router)
app.include_router(provider_keys_router)
app.include_router(runs_router)
app.include_router(compare_router)
app.include_router(seed_router)


@app.get("/health")
def healthcheck():
    return {"status": "ok"}
