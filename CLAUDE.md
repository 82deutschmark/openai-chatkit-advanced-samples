# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**openai-chatkit-advanced-samples** is a full-stack web application demonstrating production-ready ChatKit integration with OpenAI's Agent framework. It combines a React frontend with a FastAPI backend to create a conversational UI with agent-powered tools and interactive widgets.

The project includes:
- A main sample application (ChatKit Guide + ARC Explainer integration)
- Three advanced example applications (Customer Support, Knowledge Assistant, Marketing Assets)
- Client-side tool execution and widget rendering
- Persistent fact storage and theme management

## Quick Start Commands

### Run Everything
```bash
npm start  # Starts backend (port 8000) and frontend (port 5170) concurrently
```

### Frontend Only
```bash
cd frontend
npm install
npm run dev      # Start dev server on http://127.0.0.1:5170
npm run build    # Build for production
npm run lint     # Run ESLint
```

### Backend Only
```bash
cd backend
uv sync                                              # Install dependencies (or pip install -e .)
uv run uvicorn app.main:app --reload --port 8000   # Start dev server on http://127.0.0.1:8000
```

### Run Example Applications
```bash
cd examples/{customer-support|knowledge-assistant|marketing-assets}
npm start  # Launches on different ports
```

## Environment Setup

Create a `.env` file in the repository root:

```
# Required for backend
OPENAI_API_KEY=sk-proj-...

# Optional - ARC Explainer integration
ARC_EXPLAINER_BASE_URL=https://arc-explainer-staging.up.railway.app
ARC_EXPLAINER_MODEL=openai/o4-mini
ARC_AGENT_MODEL=gpt-4.1-mini

# Optional - Frontend configuration
VITE_CHATKIT_API_DOMAIN_KEY=domain_pk_localhost_dev  # for local development
```

## Project Architecture

### Tech Stack

**Frontend:**
- React 19 + TypeScript + Vite 7 (bundler & dev server)
- Tailwind CSS 3 (styling with dark mode support)
- ChatKit React component (OpenAI's UI framework)
- Custom hooks: `useColorScheme` (theme), `useFacts` (state management)
- API clients: `arc.ts`, `facts.ts`

**Backend:**
- FastAPI (web framework) + Uvicorn (ASGI server)
- Python 3.11+ with Pydantic validation
- OpenAI Agents SDK + ChatKit Python SDK
- Async/await throughout with proper context management
- Thread-safe in-memory storage with asyncio locks

### Data Flow Architecture

```
User Input (ChatKit UI)
    ↓
Frontend /chatkit proxy → Backend ChatKitServer
    ↓
ArcAssistantServer (extends ChatKitServer)
    ├─ Routing to OpenAI Agent
    ├─ Agent tool invocation
    └─ Response streaming via SSE
    ↓
Tool Execution:
├─ Server-side: record_fact, get_weather, ARC analysis
└─ Client-side: switch_theme, record_fact (confirmed)
    ↓
Widget Rendering (frontend interprets tool responses)
    ↓
State Updates (facts list, theme toggle, UI refresh)
```

### Key Components

**Frontend Components:**
- `Home.tsx` - Main layout with facts panel sidebar
- `ChatKitPanel.tsx` - ChatKit UI wrapper with client tool handlers
- `ArcDashboard.tsx` - ARC puzzle display and interaction
- `ArcGrid.tsx` - Puzzle grid cell rendering
- `FactCard.tsx` - Individual saved fact display
- `ThemeToggle.tsx` - Dark/light mode switcher

**Backend Endpoints:**
- `POST /chatkit` - ChatKit message streaming (SSE)
- `GET /facts` - List saved facts
- `POST /facts/{id}/save` - Mark fact as saved
- `POST /facts/{id}/discard` - Remove fact
- `GET /arc/puzzles` - List ARC puzzles
- `POST /arc/puzzles/{id}/analyze` - Analyze puzzle with model
- `GET /health` - Health check

**Agent Tools:**
- `record_fact()` - Server-side fact storage (also callable client-side)
- `switch_theme()` - Client-side theme toggle
- `get_weather()` - Weather API integration
- ARC-specific tools for puzzle analysis

### Configuration Files

**Frontend:**
- `vite.config.ts` - Dev server (5170), proxies to backend (/chatkit, /facts)
- `tailwind.config.ts` - Dark mode (class-based), custom colors
- `tsconfig.json` - Strict TypeScript, ES2022 target
- `lib/config.ts` - API URLs, domain key, starter prompts
- `constants/colors.ts` - Color palette definitions

**Backend:**
- `pyproject.toml` - Dependencies locked with `uv.lock`
- `app/constants.py` - System prompts, model names
- `app/arc_agent.py` - ARC agent configuration
- `app/memory_store.py` - Thread storage implementation

## Code Quality Standards

From `agents.md`:
- **SRP (Single Responsibility):** Each file should have one clear purpose
- **DRY (Don't Repeat Yourself):** Reuse utilities, avoid duplication
- **File Headers:** Include purpose comments documenting the file's role
- **Type Safety:** Leverage TypeScript and Pydantic for validation
- **Error Handling:** Proper HTTP status codes and error messages

### File Header Template
```typescript
/*
 * Author: <Name> (model: <Model>)
 * Date: <Date> <Timezone>
 * PURPOSE: <One sentence describing what this file does>
 * SRP/DRY check: Pass/Fail - <Brief justification>
 */
```

## Development Workflow

1. **Local Development:**
   - Run `npm start` from root to start both servers
   - Frontend hot-reloads on file changes
   - Backend auto-reloads with `--reload` flag
   - Open http://127.0.0.1:5170 to test

2. **Testing:**
   - Frontend: `cd frontend && npm run test`
   - Vitest configured for component testing
   - No backend test command configured yet

3. **Building:**
   - Frontend: `cd frontend && npm run build` → outputs to `dist/`
   - Backend: Uses FastAPI directly (no separate build step)

4. **Deployment:**
   - Frontend: Deploy `dist/` folder to static host
   - Backend: Run FastAPI with production ASGI server
   - See example apps for multi-port deployment patterns

## Important Implementation Details

### ChatKit Integration
- Frontend uses ChatKit React component from `/chatkit` endpoint (proxied to backend)
- Backend runs `ArcAssistantServer` which extends `ChatKitServer`
- Messages stream back via Server-Sent Events (SSE)
- Responses can include tool invocations and widget renderings

### Client Tools
- Tools defined on backend but executed on frontend when appropriate
- `switch_theme()` and client-side `record_fact()` execute in browser
- Server validates and confirms tool execution
- Check `ChatKitPanel.tsx` for tool handler implementation

### Fact Storage
- In-memory store with async locks (thread-safe for concurrent requests)
- Facts persist during session but reset on server restart
- Frontend syncs via GET `/facts` and POST endpoints
- Consider database migration for production

### Theme Management
- Class-based dark mode via Tailwind (`dark:` prefix)
- `useColorScheme` hook manages state in localStorage
- Theme toggle triggers switch_theme() agent tool
- Colors defined in `constants/colors.ts`

### API Proxying
Vite dev server proxies:
- `/chatkit` → `http://127.0.0.1:8000` (ChatKit messages)
- `/facts` → `http://127.0.0.1:8000` (Facts API)

Remove proxies in production; use absolute URLs instead.

## Advanced Examples

Three complete applications demonstrating different use cases:

1. **customer-support** - Airline support workflow (seat changes, cancellations, luggage)
2. **knowledge-assistant** - File-based knowledge base with semantic search
3. **marketing-assets** - Marketing creative generation workflow

Each runs on different ports and can be deployed independently.

## Cursor Rules & Contribution Notes

From `agents.md`:
- Follow SRP/DRY principles strictly
- Add purpose headers to all new files
- Keep components focused and testable
- Use TypeScript strict mode and Pydantic validation
- Document complex logic with inline comments

## Git Workflow

- Main branch is the primary development branch
- Recent commits show active development with focus on ChatKit styling and code documentation
- Repository is clean (no uncommitted changes)
