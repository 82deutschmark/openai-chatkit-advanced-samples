# ARC Explainer Integration Guide

This repo ships with an `arc_agent` helper that connects to the public ARC Explainer service so you
can browse puzzles, run solver prompts, and record your own explanations from inside ChatKit or other
agent runtimes.

The notes below mirror the quick-start guidance from the ARC Explainer project, adapted for this
codebase.

---

## Configuration

- **Base URL** – Defaults to `https://arc-explainer-staging.up.railway.app`. Override with the
  `ARC_EXPLAINER_BASE_URL` environment variable when pointing at a different deployment.
- **ARC analysis model** – Defaults to `openai/o4-mini`. Override with `ARC_EXPLAINER_MODEL` if you
  prefer another provider/model combo hosted by ARC Explainer.
- **Assistant model** – The ChatKit-facing agent runs on `gpt-4.1-mini` by default. Change via
  `ARC_AGENT_MODEL` if you want a different OpenAI model for orchestration.

All endpoints are unauthenticated—no headers or API keys required out of the box.

---

## Python Helper

The `backend/app/arc_agent.py` module exports:

- `arc_agent`: a fully wired `Agent` that exposes ARC-specific tools.
- Tool functions (`arc_list_puzzles`, `arc_fetch_puzzle`, `arc_run_analysis`, `arc_has_explanation`,
  `arc_save_explanation`) that can be re-used individually if you are composing your own agent.

Because the ARC Explainer API is public, the helper only depends on `httpx` and the existing
ChatKit abstractions—no extra packages required.

---

## Core Data Access

| Capability        | Tool / Endpoint                       | Notes |
|-------------------|----------------------------------------|-------|
| List puzzles      | `arc_list_puzzles` → `GET /api/puzzle/list` | Supports `page`, `limit`, `source`. Defaults return the full catalog. |
| Overview stats    | *(call directly if needed)* → `GET /api/puzzle/overview` | Not wrapped yet, but easy to add via `_arc_request`. |
| Fetch puzzle      | `arc_fetch_puzzle` → `GET /api/puzzle/task/:taskId` | Returns complete train/test grid data. |
| Check explanations| `arc_has_explanation` → `GET /api/puzzle/:puzzleId/has-explanation` | Boolean shortcut before drafting your own answer. |

---

## Running Model Analyses

`arc_run_analysis` issues `POST /api/puzzle/analyze/:taskId/:model` requests. Pass any subset of the
following keyword arguments:

- `model` – Defaults to `ARC_EXPLAINER_MODEL`.
- `prompt_id`, `temperature`, `capture_reasoning` – Match the ARC Explainer API fields.
- `original_explanation`, `custom_challenge` – Supply to trigger debate or custom challenge modes.
- `previous_response_id` – Continue a prior provider conversation (OpenAI/xAI backends).
- `extra_options` – Merge any remaining JSON keys the API supports without changing the signature.

The returned payload mirrors the ARC Explainer response: reasoning traces, predicted outputs, cost
metadata, and response identifiers.

---

## Dataset & Performance Intelligence

The helper doesn’t wrap these endpoints yet, but you can call them via `_arc_request` if you need
them in your workflow:

- `GET /api/model-dataset/datasets`
- `GET /api/model-dataset/models`
- `GET /api/model-dataset/performance/:modelName/:datasetName`

They provide dataset inventories plus historical performance stats for stored solver runs.

---

## Feedback & Analytics

ARC Explainer exposes feedback and metrics surfaces that are handy for dashboards and research:

- `/api/feedback` endpoints for submitting/querying per-puzzle or per-explanation feedback.
- `/api/feedback/accuracy-stats`, `/api/feedback/debate-accuracy-stats`,
  `/api/puzzle/performance-stats`, `/api/metrics/costs/*` for accuracy, debate, trustworthiness, and
  cost reporting.

Hook these up with `_arc_request` as needed—none of them require pagination parameters unless noted
in the API reference.

---

## Typical Workflow

1. **Discover a task** – Call `arc_list_puzzles` (optionally filter by source) and pick a `taskId` or
   `puzzleId` to investigate.
2. **Load puzzle data** – Use `arc_fetch_puzzle` to grab the train/test grids.
3. **Analyse** – Run `arc_run_analysis(task_id)` for automated reasoning. Capture the returned
   `responseId` if you plan to chain further analyses with `previous_response_id`.
4. **Summarise/Solve** – Combine your own reasoning with the provider output. Express predicted
   output grids in bracketed row notation.
5. **Persist** – When satisfied, store your explanation via `arc_save_explanation` so it shows up in
   the ARC Explainer UI.

---

## Error Handling & Tips

- Network or HTTP errors are surfaced as `ValueError` exceptions with the underlying status code or
  request failure reason.
- The agent instructions encourage users to explain why they call each tool and to share follow-up
  actions when a task remains unsolved.
- Override environment variables in your deployment stack (e.g., `docker-compose`, Render, Railway)
  to switch between staging/production ARC Explainer deployments without code changes.
