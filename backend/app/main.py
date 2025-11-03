"""FastAPI entrypoint wiring the ChatKit server and REST endpoints."""

from __future__ import annotations

import logging
from typing import Any

from chatkit.server import StreamingResult
from chatkit.store import NotFoundError
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.responses import Response, StreamingResponse
from starlette.responses import JSONResponse

from .chat import (
    FactAssistantServer,
    create_chatkit_server,
)
from .facts import fact_store

app = FastAPI(title="ChatKit API")

_chatkit_server: FactAssistantServer | None = create_chatkit_server()


def get_chatkit_server() -> FactAssistantServer:
    if _chatkit_server is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "ChatKit dependencies are missing. Install the ChatKit Python "
                "package to enable the conversational endpoint."
            ),
        )
    return _chatkit_server


@app.post("/chatkit")
async def chatkit_endpoint(
    request: Request, server: FactAssistantServer = Depends(get_chatkit_server)
) -> Response:
    payload = await request.body()
    result = await server.process(payload, {"request": request})
    if isinstance(result, StreamingResult):
        return StreamingResponse(result, media_type="text/event-stream")
    if hasattr(result, "json"):
        return Response(content=result.json, media_type="application/json")
    return JSONResponse(result)


@app.put("/attachments/{attachment_id}")
async def upload_attachment(
    attachment_id: str,
    request: Request,
    server: FactAssistantServer = Depends(get_chatkit_server),
) -> dict[str, Any]:
    attachment_store = getattr(server, "attachment_store", None)
    if attachment_store is None or not hasattr(attachment_store, "upload_attachment"):
        raise HTTPException(status_code=404, detail="Attachment uploads are disabled")

    payload = await request.body()
    if not payload:
        raise HTTPException(status_code=400, detail="Attachment payload is empty")

    content_type = request.headers.get("content-type")
    try:
        attachment = await attachment_store.upload_attachment(  # type: ignore[attr-defined]
            attachment_id,
            payload,
            mime_type=content_type,
        )
    except NotFoundError as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    store = getattr(server, "store", None)
    if store is not None and hasattr(store, "save_attachment"):
        try:
            await store.save_attachment(attachment, {"request": request})  # type: ignore[arg-type]
        except NotImplementedError:  # pragma: no cover - legacy stores
            pass
        except Exception:  # pragma: no cover - defensive logging
            logging.exception("Failed to persist attachment metadata in store")

    return {"attachment": attachment.model_dump()}


@app.get("/facts")
async def list_facts() -> dict[str, Any]:
    facts = await fact_store.list_saved()
    return {"facts": [fact.as_dict() for fact in facts]}


@app.post("/facts/{fact_id}/save")
async def save_fact(fact_id: str) -> dict[str, Any]:
    fact = await fact_store.mark_saved(fact_id)
    if fact is None:
        raise HTTPException(status_code=404, detail="Fact not found")
    return {"fact": fact.as_dict()}


@app.post("/facts/{fact_id}/discard")
async def discard_fact(fact_id: str) -> dict[str, Any]:
    fact = await fact_store.discard(fact_id)
    if fact is None:
        raise HTTPException(status_code=404, detail="Fact not found")
    return {"fact": fact.as_dict()}


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "healthy"}
