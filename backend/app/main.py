import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .api.admin import router as admin_router
from .api.routes_events import router as events_router
from .api.routes_dashboard import router as dashboard_router
from .api.routes_sports import router as sports_router
from .api.routes_status import router as status_router
from .api.ws import redis_listener, router as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(redis_listener(app))
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="Sharpline API",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin_router)
app.include_router(events_router)
app.include_router(dashboard_router)
app.include_router(sports_router)
app.include_router(status_router)
app.include_router(ws_router)


@app.get("/health", tags=["system"])
async def health() -> dict:
    return {"status": "ok", "version": "0.1.0"}
