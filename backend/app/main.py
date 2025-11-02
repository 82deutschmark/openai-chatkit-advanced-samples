"""FastAPI entrypoint wiring the ChatKit server and REST endpoints."""

from __future__ import annotations

from typing import Any

from chatkit.server import StreamingResult
from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from starlette.responses import JSONResponse

from .arc_agent import arc_api_request, encode_path_segment, get_default_arc_model
from .chat import ArcAssistantServer, create_chatkit_server

app = FastAPI(title="ChatKit API")

_chatkit_server: ArcAssistantServer | None = create_chatkit_server()


def get_chatkit_server() -> ArcAssistantServer:
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
    request: Request, server: ArcAssistantServer = Depends(get_chatkit_server)
) -> Response:
    payload = await request.body()
    result = await server.process(payload, {"request": request})
    if isinstance(result, StreamingResult):
        return StreamingResponse(result, media_type="text/event-stream")
    if hasattr(result, "json"):
        return Response(content=result.json, media_type="application/json")
    return JSONResponse(result)


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "healthy"}


class AnalyzeOptions(BaseModel):
    model: str | None = None
    promptId: str | None = None
    temperature: float | None = 0.2
    captureReasoning: bool | None = True
    originalExplanation: str | None = None
    customChallenge: str | None = None
    previousResponseId: str | None = None
    extraOptions: dict[str, Any] | None = None


class SaveExplanationPayload(BaseModel):
    explanation: str
    customChallenge: str | None = None
    tags: list[str] | None = None


@app.get("/arc/puzzles")
async def list_arc_puzzles(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    source: str | None = None,
) -> dict[str, Any]:
    params: dict[str, Any] = {"page": page, "limit": limit}
    if source:
        params["source"] = source
    data = await arc_api_request("GET", "/api/puzzle/list", params=params)
    return {"puzzles": data}


@app.get("/arc/puzzles/{task_id}")
async def fetch_arc_puzzle(task_id: str) -> dict[str, Any]:
    encoded_task_id = encode_path_segment(task_id)
    data = await arc_api_request("GET", f"/api/puzzle/task/{encoded_task_id}")
    return {"puzzle": data}


@app.post("/arc/puzzles/{task_id}/analyze")
async def analyze_arc_puzzle(task_id: str, options: AnalyzeOptions) -> dict[str, Any]:
    encoded_task_id = encode_path_segment(task_id)
    payload: dict[str, Any] = {}
    if options.promptId is not None:
        payload["promptId"] = options.promptId
    if options.temperature is not None:
        payload["temperature"] = options.temperature
    if options.captureReasoning is not None:
        payload["captureReasoning"] = options.captureReasoning
    if options.originalExplanation is not None:
        payload["originalExplanation"] = options.originalExplanation
    if options.customChallenge is not None:
        payload["customChallenge"] = options.customChallenge
    if options.previousResponseId is not None:
        payload["previousResponseId"] = options.previousResponseId
    if options.extraOptions:
        payload.update(options.extraOptions)

    selected_model = options.model or get_default_arc_model()
    encoded_model = encode_path_segment(selected_model)
    data = await arc_api_request(
        "POST",
        f"/api/puzzle/analyze/{encoded_task_id}/{encoded_model}",
        json=payload,
    )
    return {"analysis": data, "model": selected_model}


@app.get("/arc/puzzles/{puzzle_id}/has-explanation")
async def arc_puzzle_has_explanation(puzzle_id: str) -> dict[str, Any]:
    encoded_puzzle_id = encode_path_segment(puzzle_id)
    data = await arc_api_request(
        "GET",
        f"/api/puzzle/{encoded_puzzle_id}/has-explanation",
    )
    return {"hasExplanation": data}


@app.post("/arc/puzzles/{puzzle_id}/explanations")
async def arc_save_puzzle_explanation(
    puzzle_id: str, payload: SaveExplanationPayload
) -> dict[str, Any]:
    encoded_puzzle_id = encode_path_segment(puzzle_id)
    body: dict[str, Any] = {"explanation": payload.explanation}
    if payload.customChallenge is not None:
        body["customChallenge"] = payload.customChallenge
    if payload.tags:
        body["tags"] = payload.tags

    data = await arc_api_request(
        "POST",
        f"/api/puzzle/save-explained/{encoded_puzzle_id}",
        json=body,
    )
    return {"saved": data}
