from __future__ import annotations

import logging
import os
from typing import Any
from urllib.parse import quote

import httpx
from agents import Agent, RunContextWrapper, function_tool
from chatkit.agents import AgentContext
from pydantic import ConfigDict

logger = logging.getLogger(__name__)

ARC_EXPLAINER_BASE_URL_DEFAULT = "https://arc-explainer-staging.up.railway.app"
ARC_EXPLAINER_MODEL_DEFAULT = "openai/o4-mini"
ARC_AGENT_MODEL_DEFAULT = "gpt-4.1-mini"


def _get_arc_base_url() -> str:
    return os.getenv("ARC_EXPLAINER_BASE_URL", ARC_EXPLAINER_BASE_URL_DEFAULT).rstrip("/")


def _get_arc_model() -> str:
    return os.getenv("ARC_EXPLAINER_MODEL", ARC_EXPLAINER_MODEL_DEFAULT)


def _get_agent_model() -> str:
    return os.getenv("ARC_AGENT_MODEL", ARC_AGENT_MODEL_DEFAULT)


def get_arc_base_url() -> str:
    """Return the configured ARC Explainer base URL."""
    return _get_arc_base_url()


def get_default_arc_model() -> str:
    """Return the configured default model for ARC Explainer analyses."""
    return _get_arc_model()


class ArcAgentContext(AgentContext):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    arc_base_url: str = _get_arc_base_url()
    arc_default_model: str = _get_arc_model()


async def arc_api_request(
    method: str,
    path: str,
    *,
    params: dict[str, Any] | None = None,
    json: dict[str, Any] | None = None,
    base_url: str | None = None,
) -> Any:
    root = (base_url or _get_arc_base_url()).rstrip("/")
    url = f"{root}{path}"
    logger.debug("ARC Explainer request", extra={"method": method, "url": url, "params": params})
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(method, url, params=params, json=json)
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:  # pragma: no cover - network failure handling
        body: Any
        try:
            body = exc.response.json()
        except ValueError:
            body = exc.response.text
        message = f"ARC Explainer API error {exc.response.status_code}: {body}"
        logger.error(message)
        raise ValueError(message) from exc
    except httpx.RequestError as exc:  # pragma: no cover - network failure handling
        message = f"Unable to reach ARC Explainer API: {exc}"
        logger.error(message)
        raise ValueError(message) from exc

    if response.headers.get("content-type", "").startswith("application/json"):
        return response.json()
    return response.text


async def _arc_request(
    ctx: RunContextWrapper[ArcAgentContext],
    method: str,
    path: str,
    *,
    params: dict[str, Any] | None = None,
    json: dict[str, Any] | None = None,
) -> Any:
    base_url = getattr(ctx.context, "arc_base_url", _get_arc_base_url())
    return await arc_api_request(
        method,
        path,
        params=params,
        json=json,
        base_url=base_url,
    )


def encode_path_segment(value: str) -> str:
    return quote(value, safe="")


@function_tool(description_override="List ARC puzzles available from the ARC Explainer service.")
async def arc_list_puzzles(
    ctx: RunContextWrapper[ArcAgentContext],
    page: int = 1,
    limit: int = 10,
    source: str | None = None,
) -> dict[str, Any]:
    params: dict[str, Any] = {"page": page, "limit": limit}
    if source:
        params["source"] = source
    data = await _arc_request(ctx, "GET", "/api/puzzle/list", params=params)
    return {"puzzles": data}


@function_tool(description_override="Fetch a full ARC puzzle, including train/test grids, by task ID.")
async def arc_fetch_puzzle(
    ctx: RunContextWrapper[ArcAgentContext],
    task_id: str,
) -> dict[str, Any]:
    encoded_task_id = encode_path_segment(task_id)
    data = await _arc_request(ctx, "GET", f"/api/puzzle/task/{encoded_task_id}")
    return {"puzzle": data}


@function_tool(
    description_override=(
        "Run an automated analysis for an ARC task using the ARC Explainer inference endpoints. "
        "Returns the provider's reasoning, predicted outputs, and response identifiers."
    )
)
async def arc_run_analysis(
    ctx: RunContextWrapper[ArcAgentContext],
    task_id: str,
    model: str | None = None,
    prompt_id: str | None = None,
    temperature: float | None = 0.2,
    capture_reasoning: bool | None = True,
    original_explanation: str | None = None,
    custom_challenge: str | None = None,
    previous_response_id: str | None = None,
) -> dict[str, Any]:
    chosen_model = model or getattr(ctx.context, "arc_default_model", _get_arc_model())
    encoded_task_id = encode_path_segment(task_id)
    encoded_model = encode_path_segment(chosen_model)
    payload: dict[str, Any] = {}
    if prompt_id is not None:
        payload["promptId"] = prompt_id
    if temperature is not None:
        payload["temperature"] = temperature
    if capture_reasoning is not None:
        payload["captureReasoning"] = capture_reasoning
    if original_explanation is not None:
        payload["originalExplanation"] = original_explanation
    if custom_challenge is not None:
        payload["customChallenge"] = custom_challenge
    if previous_response_id is not None:
        payload["previousResponseId"] = previous_response_id
    data = await _arc_request(
        ctx,
        "POST",
        f"/api/puzzle/analyze/{encoded_task_id}/{encoded_model}",
        json=payload,
    )
    return {"analysis": data, "model": chosen_model}


@function_tool(description_override="Check whether an ARC puzzle already has a saved explanation in ARC Explainer.")
async def arc_has_explanation(
    ctx: RunContextWrapper[ArcAgentContext],
    puzzle_id: str,
) -> dict[str, Any]:
    encoded_puzzle_id = encode_path_segment(puzzle_id)
    data = await _arc_request(
        ctx,
        "GET",
        f"/api/puzzle/{encoded_puzzle_id}/has-explanation",
    )
    return {"hasExplanation": data}


@function_tool(description_override="Persist a custom explanation for an ARC puzzle back to the ARC Explainer service.")
async def arc_save_explanation(
    ctx: RunContextWrapper[ArcAgentContext],
    puzzle_id: str,
    explanation: str,
    custom_challenge: str | None = None,
    tags: list[str] | None = None,
) -> dict[str, Any]:
    encoded_puzzle_id = encode_path_segment(puzzle_id)
    payload: dict[str, Any] = {"explanation": explanation}
    if custom_challenge is not None:
        payload["customChallenge"] = custom_challenge
    if tags:
        payload["tags"] = tags

    data = await _arc_request(
        ctx,
        "POST",
        f"/api/puzzle/save-explained/{encoded_puzzle_id}",
        json=payload,
    )
    return {"saved": data}


ARC_SOLVER_INSTRUCTIONS = f"""
You are an ARC (Abstraction and Reasoning Corpus) research assistant connected to the ARC Explainer
service at {{base_url}}.

Your job is to help users inspect ARC puzzles, reason about their transformations, and capture clear
solutions. Follow this workflow:

1. Discover tasks with `arc_list_puzzles`, optionally filtering by dataset source.
2. Load the full puzzle specification with `arc_fetch_puzzle` before proposing a solution.
3. Use `arc_run_analysis` to execute automated solver prompts when you need provider reasoning or to
   validate a hypothesis. Summarise the provider's response and track `responseId` values so you can
   extend a conversation with `previous_response_id` when helpful.
4. If an explanation already exists, check with `arc_has_explanation` and review it before creating
   redundant work.
5. When you produce your own explanation, push it back with `arc_save_explanation` so other teams can
   review your findings.

General guidance:
- Think in terms of the ARC canonical workflow: compare every training input/output pair, extract
  rules, and test them against held-out grids before committing.
- Always report predicted output grids in bracketed row notation (e.g. `[ [0, 1], [1, 0] ]`).
- When delegating to `arc_run_analysis`, state why you are calling it and incorporate the returned
  reasoning into your final summary.
- Surface next steps when the task remains unsolved (e.g. additional hypotheses to try).
- If the API reports an error, relay the key details and suggest recovery actions (retry, adjust
  parameters, choose another task, etc.).

Close responses with a concise recap of the inferred rule set, the proposed output grid(s), and any
follow-up actions you recommend.
""".strip().format(base_url=_get_arc_base_url())


arc_agent = Agent[ArcAgentContext](
    model=_get_agent_model(),
    name="ARC Explainer Solver",
    instructions=ARC_SOLVER_INSTRUCTIONS,
    tools=[
        arc_list_puzzles,
        arc_fetch_puzzle,
        arc_run_analysis,
        arc_has_explanation,
        arc_save_explanation,
    ],
)
