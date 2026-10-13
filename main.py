"""
FastAPI Application for Kolkata Pujo Parikrama Web.
Provides Google-inspired search & chat UI, shared guest quota (5 free questions),
and MCP-grounded responses using Gemini & Groq.
"""

import os
import uuid
import logging
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from quota_manager import QuotaManager, extract_client_ip
from mcp_client import mcp_client
from llm_providers import (
    call_gemini,
    call_groq,
    call_openai,
    call_anthropic,
    GEMINI_API_KEY,
    GROQ_API_KEY,
    GEMINI_MODEL,
    GROQ_MODEL,
    OPENAI_API_KEY,
    ANTHROPIC_API_KEY,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("web_main")

quota = QuotaManager()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm up MCP tool definitions in background
    logger.info("Starting up Kolkata Pujo Parikrama web backend...")
    try:
        tools = await mcp_client.get_tools()
        logger.info("Pre-warmed %d MCP tools", len(tools))
    except Exception as e:
        logger.warning("Could not pre-warm MCP tools at startup: %s", e)
    yield
    logger.info("Shutting down web backend...")

app = FastAPI(title="Kolkata Pujo Parikrama", lifespan=lifespan)

# Mount static folder
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(STATIC_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

class ChatRequest(BaseModel):
    message: str
    provider: str = "gemini"  # "gemini", "groq", "openai", "anthropic"
    history: list[dict] = []
    custom_api_key: str | None = None

def get_or_set_session_id(request: Request, response: Response) -> str:
    session_id = request.cookies.get("pujo_session")
    if not session_id or len(session_id.strip()) < 8:
        session_id = uuid.uuid4().hex
        response.set_cookie(
            key="pujo_session",
            value=session_id,
            max_age=30 * 24 * 3600,  # 30 days
            httponly=True,
            samesite="lax",
        )
    return session_id

@app.get("/")
async def index():
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "Kolkata Pujo Parikrama Web API is running."}

@app.get("/healthz")
async def healthz():
    return {"status": "ok"}

@app.get("/api/reset-quota")
@app.post("/api/reset-quota")
async def reset_quota(request: Request, response: Response):
    session_id = get_or_set_session_id(request, response)
    client_ip = extract_client_ip(request)
    client_key = quota.make_client_key(session_id, client_ip)
    quota.reset(client_key)
    used, remaining = quota.get_used_and_remaining(client_key)
    return {
        "status": "success",
        "message": "Quota successfully reset for testing.",
        "remaining": remaining,
        "limit": quota.limit,
    }

@app.get("/api/session")
async def get_session(request: Request, response: Response):
    session_id = get_or_set_session_id(request, response)
    client_ip = extract_client_ip(request)
    client_key = quota.make_client_key(session_id, client_ip)
    used, remaining = quota.get_used_and_remaining(client_key)
    
    return {
        "session_id": session_id,
        "limit": quota.limit,
        "used": used,
        "remaining": remaining,
        "providers": {
            "gemini": {
                "available": bool(os.environ.get("GEMINI_API_KEY") or GEMINI_API_KEY),
                "name": "Google Gemini",
                "model": os.environ.get("GEMINI_MODEL") or GEMINI_MODEL,
            },
            "groq": {
                "available": bool(os.environ.get("GROQ_API_KEY") or GROQ_API_KEY),
                "name": "Groq Llama 3.3",
                "model": os.environ.get("GROQ_MODEL") or GROQ_MODEL,
            },
        },
    }

@app.post("/api/chat")
async def chat(req: ChatRequest, request: Request, response: Response):
    user_message = req.message.strip()
    if not user_message:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    provider = req.provider.lower().strip()
    if provider not in ("gemini", "groq", "openai", "anthropic"):
        provider = "gemini"

    # If the user supplied their own custom API key, they get UNLIMITED questions (no guest quota deduction)
    custom_key = (req.custom_api_key or "").strip()
    is_custom_key = bool(custom_key)

    session_id = get_or_set_session_id(request, response)
    client_ip = extract_client_ip(request)
    client_key = quota.make_client_key(session_id, client_ip)
    
    if not is_custom_key:
        allowed, remaining = quota.reserve(client_key)
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "error": "guest_limit_reached",
                    "message": (
                        "You have used all free guest questions. "
                        "Add your own API key (Gemini, Groq, OpenAI, or Claude) in the Key Settings to continue asking unlimited questions!"
                    ),
                    "remaining": 0,
                },
            )
    else:
        # Custom key: unlimited
        remaining = 9999

    # Call AI provider with live MCP tools
    try:
        if provider == "groq":
            reply = await call_groq(user_message, req.history, mcp_client, api_key=custom_key if is_custom_key else None)
        elif provider == "openai":
            reply = await call_openai(user_message, req.history, mcp_client, api_key=custom_key if is_custom_key else None)
        elif provider == "anthropic":
            reply = await call_anthropic(user_message, req.history, mcp_client, api_key=custom_key if is_custom_key else None)
        else:
            try:
                reply = await call_gemini(user_message, req.history, mcp_client, api_key=custom_key if is_custom_key else None)
            except Exception as gemini_err:
                # If Gemini is experiencing 503 high demand or quota issues, automatically cascade to Groq Llama
                if not is_custom_key and ("503" in str(gemini_err) or "high demand" in str(gemini_err).lower() or "429" in str(gemini_err)):
                    logger.warning("Gemini unavailable (%s). Automatically falling back to Groq Llama...", gemini_err)
                    reply = await call_groq(user_message, req.history, mcp_client)
                    provider = "groq (fallback)"
                else:
                    raise gemini_err
            
        return {
            "reply": reply,
            "provider": provider,
            "remaining": remaining,
            "is_custom_key": is_custom_key,
        }
    except Exception as e:
        logger.error("Error generating answer: %s", e)
        # Refund 1 question if guest quota was decremented
        refunded_left = remaining
        if not is_custom_key:
            refunded_left = quota.refund(client_key)

        return JSONResponse(
            status_code=502,
            content={
                "error": "generation_failed",
                "message": f"Could not complete your request: {str(e)}",
                "remaining": refunded_left,
            },
        )

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8000"))
    reload_flag = os.environ.get("ENVIRONMENT", "").lower() == "development"
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=reload_flag)
