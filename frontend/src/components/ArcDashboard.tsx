/**
 * Author: Cascade (model: Cascade)
 * Date: 2025-11-02 23:32 UTC-05:00
 * PURPOSE: Presents the ARC Explainer workspace, coordinating puzzle browsing, detail inspection,
 * solver requests, explanation authoring, and ChatKit collaboration in a single surface.
 * SRP/DRY check: Pass - orchestrator component composed of dedicated submodules and shared utilities.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";

import { ChatKitPanel } from "./ChatKitPanel";
import { ArcGrid } from "./ArcGrid";
import { ThemeToggle } from "./ThemeToggle";
import type { ColorScheme } from "../hooks/useColorScheme";
import { useFacts } from "../hooks/useFacts";
import type { FactAction } from "../hooks/useFacts";
import {
  type ArcAnalysisResult,
  type ArcPuzzleDetail,
  type ArcPuzzleListItem,
  analyzeArcPuzzle,
  checkArcPuzzleHasExplanation,
  fetchArcPuzzle,
  listArcPuzzles,
  saveArcPuzzleExplanation,
} from "../lib/arc";

const SECTION_TITLE_CLASS = "text-lg font-semibold text-slate-800 dark:text-slate-100";
const PAGE_SIZE = 32;

type ArcDashboardProps = {
  scheme: ColorScheme;
  handleThemeChange: (scheme: ColorScheme) => void;
};

type PuzzleListProps = {
  puzzles: ArcPuzzleListItem[];
  loading: boolean;
  error: string | null;
  selectedTaskId: string | null;
  onSelect: (taskId: string) => void;
  onRefresh: () => void;
};

type PuzzleDetailProps = {
  detail: ArcPuzzleDetail | null;
  loading: boolean;
  error: string | null;
  hasExplanation: boolean | null;
};

type AnalysisProps = {
  disabled: boolean;
  isRunning: boolean;
  analysis: ArcAnalysisResult | null;
  error: string | null;
  explanationDraft: string;
  onDraftChange: (value: string) => void;
  onRunAnalysis: () => void;
  onSaveExplanation: () => void;
  saveState: "idle" | "saving" | "saved" | "error";
  saveError: string | null;
};

export function ArcDashboard({ scheme, handleThemeChange }: ArcDashboardProps) {
  const [puzzles, setPuzzles] = useState<ArcPuzzleListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [listReload, setListReload] = useState(0);

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const [detailState, setDetailState] = useState<{
    detail: ArcPuzzleDetail | null;
    hasExplanation: boolean | null;
    loading: boolean;
    error: string | null;
  }>({ detail: null, hasExplanation: null, loading: false, error: null });

  const [analysisState, setAnalysisState] = useState<{
    result: ArcAnalysisResult | null;
    loading: boolean;
    error: string | null;
  }>({ result: null, loading: false, error: null });

  const [explanationDraft, setExplanationDraft] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const { performAction: performFactAction } = useFacts();

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    setListError(null);

    void (async () => {
      try {
        const items = await listArcPuzzles({ page: 1, limit: PAGE_SIZE });
        if (!cancelled) {
          setPuzzles(items);
          setSelectedTaskId((current) => {
            if (current && items.some((item) => item.taskId === current)) {
              return current;
            }
            return items.length > 0 ? items[0].taskId : null;
          });
        }
      } catch (error) {
        if (!cancelled) {
          setListError((error as Error).message);
        }
      } finally {
        if (!cancelled) {
          setListLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [listReload]);

  useEffect(() => {
    if (!selectedTaskId) {
      setDetailState({ detail: null, hasExplanation: null, loading: false, error: null });
      setAnalysisState({ result: null, loading: false, error: null });
      setExplanationDraft("");
      setSaveState("idle");
      setSaveError(null);
      return;
    }

    let cancelled = false;
    setDetailState({ detail: null, hasExplanation: null, loading: true, error: null });
    setAnalysisState({ result: null, loading: false, error: null });
    setExplanationDraft("");
    setSaveState("idle");
    setSaveError(null);

    void (async () => {
      try {
        const puzzle = await fetchArcPuzzle(selectedTaskId);
        if (cancelled) {
          return;
        }

        let explanationStatus: boolean | null = null;
        try {
          explanationStatus = await checkArcPuzzleHasExplanation(puzzle.puzzleId);
        } catch (explanationError) {
          console.warn("Failed to determine explanation status", explanationError);
        }

        if (!cancelled) {
          setDetailState({ detail: puzzle, hasExplanation: explanationStatus, loading: false, error: null });
        }
      } catch (error) {
        if (!cancelled) {
          setDetailState({ detail: null, hasExplanation: null, loading: false, error: (error as Error).message });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedTaskId]);

  const handleRefreshList = useCallback(() => {
    setListReload((token) => token + 1);
  }, []);

  const handleSelectPuzzle = useCallback((taskId: string) => {
    setSelectedTaskId(taskId);
  }, []);

  const handleAnalysis = useCallback(async () => {
    if (!selectedTaskId) {
      return;
    }
    setAnalysisState({ result: null, loading: true, error: null });
    try {
      const result = await analyzeArcPuzzle(selectedTaskId, { captureReasoning: true });
      setAnalysisState({ result, loading: false, error: null });
    } catch (error) {
      setAnalysisState({ result: null, loading: false, error: (error as Error).message });
    }
  }, [selectedTaskId]);

  const handleSaveExplanation = useCallback(async () => {
    if (!detailState.detail) {
      return;
    }
    const draft = explanationDraft.trim();
    if (!draft) {
      return;
    }

    setSaveState("saving");
    setSaveError(null);
    try {
      await saveArcPuzzleExplanation(detailState.detail.puzzleId, { explanation: draft });
      setSaveState("saved");
      setDetailState((current) => ({ ...current, hasExplanation: true }));
    } catch (error) {
      setSaveState("error");
      setSaveError((error as Error).message);
    }
  }, [detailState.detail, explanationDraft]);

  const handleWidgetAction = useCallback(
    async (action: FactAction) => {
      await performFactAction(action);
    },
    [performFactAction],
  );

  const handleChatResponseEnd = useCallback(() => {
    /* Additional response handling can be added here (e.g., refresh detail metadata). */
  }, []);

  const themeClass = useMemo(
    () =>
      clsx(
        "min-h-screen bg-gradient-to-br transition-colors duration-300",
        scheme === "dark"
          ? "from-slate-950 via-slate-900 to-slate-800 text-slate-100"
          : "from-slate-100 via-white to-slate-200 text-slate-900",
      ),
    [scheme],
  );

  return (
    <div className={themeClass}>
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-6 py-8 lg:flex-row">
        <aside className="w-full max-w-sm rounded-3xl border border-slate-200/70 bg-white/90 p-6 shadow-lg ring-1 ring-slate-200/70 backdrop-blur dark:border-slate-800/70 dark:bg-slate-900/80 dark:ring-slate-800/70">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">ARC Puzzle Catalog</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Browse curated ARC tasks sourced from the Explainer API.
              </p>
            </div>
            <ThemeToggle value={scheme} onChange={handleThemeChange} />
          </div>

          <PuzzleList
            puzzles={puzzles}
            loading={listLoading}
            error={listError}
            selectedTaskId={selectedTaskId}
            onSelect={handleSelectPuzzle}
            onRefresh={handleRefreshList}
          />
        </aside>

        <main className="flex-1 overflow-y-auto">
          <PuzzleDetailPanel
            detail={detailState.detail}
            loading={detailState.loading}
            error={detailState.error}
            hasExplanation={detailState.hasExplanation}
          />
          <AnalysisPanel
            disabled={!detailState.detail}
            isRunning={analysisState.loading}
            analysis={analysisState.result}
            error={analysisState.error}
            explanationDraft={explanationDraft}
            onDraftChange={setExplanationDraft}
            onRunAnalysis={handleAnalysis}
            onSaveExplanation={handleSaveExplanation}
            saveState={saveState}
            saveError={saveError}
          />
          <section className="rounded-3xl border border-slate-200/70 bg-white/90 shadow-xl ring-1 ring-slate-200/70 backdrop-blur dark:border-slate-800/70 dark:bg-slate-900/80 dark:ring-slate-800/70">
            <ChatKitPanel
              theme={scheme}
              onWidgetAction={handleWidgetAction}
              onResponseEnd={handleChatResponseEnd}
              onThemeRequest={handleThemeChange}
            />
          </section>
        </main>
      </div>
    </div>
  );
}

function PuzzleList({ puzzles, loading, error, selectedTaskId, onSelect, onRefresh }: PuzzleListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={`skeleton-${index}`}
            className="h-14 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800/60"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 text-sm text-red-600 dark:text-red-400">
        <p>Unable to load puzzles: {error}</p>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-full bg-slate-900 px-4 py-2 text-white shadow dark:bg-slate-200 dark:text-slate-900"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
        <span>Tasks</span>
        <span>{puzzles.length}</span>
      </div>
      <ul className="space-y-3 overflow-y-auto pr-1" style={{ maxHeight: "70vh" }}>
        {puzzles.map((puzzle) => {
          const active = puzzle.taskId === selectedTaskId;
          return (
            <li key={puzzle.taskId}>
              <button
                type="button"
                onClick={() => onSelect(puzzle.taskId)}
                className={clsx(
                  "w-full rounded-2xl border px-4 py-3 text-left transition focus-visible:outline focus-visible:outline-2",
                  active
                    ? "border-slate-900 bg-slate-900 text-white shadow-lg dark:border-slate-200 dark:bg-slate-200 dark:text-slate-900"
                    : "border-slate-200 bg-white text-slate-800 hover:border-slate-400 hover:shadow dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">{puzzle.taskId}</span>
                  {puzzle.source ? (
                    <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {puzzle.source}
                    </span>
                  ) : null}
                </div>
                {puzzle.title ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{puzzle.title}</p>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PuzzleDetailPanel({ detail, loading, error, hasExplanation }: PuzzleDetailProps) {
  if (loading) {
    return (
      <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-xl ring-1 ring-slate-200/70 backdrop-blur dark:border-slate-800/70 dark:bg-slate-900/70 dark:ring-slate-800/70">
        <div className="h-12 w-full animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800/60" />
        <div className="mt-4 h-36 animate-pulse rounded-3xl bg-slate-200/60 dark:bg-slate-800/50" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-3xl border border-red-200/70 bg-red-50/70 p-6 text-red-700 shadow-lg ring-1 ring-red-200 dark:border-red-900/70 dark:bg-red-950/50 dark:text-red-200 dark:ring-red-900">
        <h2 className={SECTION_TITLE_CLASS}>Puzzle details unavailable</h2>
        <p className="mt-2 text-sm">{error}</p>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="rounded-3xl border border-slate-200/70 bg-white/80 p-6 text-slate-600 shadow-xl ring-1 ring-slate-200/70 backdrop-blur dark:border-slate-800/70 dark:bg-slate-900/70 dark:text-slate-300 dark:ring-slate-800/70">
        <p>Select an ARC task to inspect its grids and metadata.</p>
      </section>
    );
  }

  const metadataEntries = Object.entries(detail.metadata).filter(([, value]) => value !== undefined);

  return (
    <section className="space-y-6 rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-xl ring-1 ring-slate-200/70 backdrop-blur dark:border-slate-800/70 dark:bg-slate-900/70 dark:ring-slate-800/70">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{detail.taskId}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Puzzle ID: {detail.puzzleId}</p>
        </div>
        <div className="flex items-center gap-2">
          {hasExplanation === true ? (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              Explanation saved
            </span>
          ) : hasExplanation === false ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
              No explanation yet
            </span>
          ) : null}
        </div>
      </header>

      {metadataEntries.length > 0 ? (
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {metadataEntries.map(([key, value]) => (
            <div key={key}
              className="rounded-2xl border border-slate-200/60 bg-white/70 px-4 py-3 text-sm shadow-sm dark:border-slate-700/60 dark:bg-slate-900/60">
              <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{key}</dt>
              <dd className="mt-1 font-medium text-slate-800 dark:text-slate-100">
                {typeof value === "string" ? value : JSON.stringify(value)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="space-y-4">
        <h3 className={SECTION_TITLE_CLASS}>Training examples</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {detail.train.map((example, index) => (
            <div key={`train-${index}`}>
              <ExampleCard label={`Train ${index + 1}`} example={example} />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className={SECTION_TITLE_CLASS}>Test examples</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {detail.test.map((example, index) => (
            <div key={`test-${index}`}>
              <ExampleCard label={`Test ${index + 1}`} example={example} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AnalysisPanel({
  disabled,
  isRunning,
  analysis,
  error,
  explanationDraft,
  onDraftChange,
  onRunAnalysis,
  onSaveExplanation,
  saveState,
  saveError,
}: AnalysisProps) {
  return (
    <section className="space-y-6 rounded-3xl border border-slate-200/70 bg-white/80 p-6 shadow-xl ring-1 ring-slate-200/70 backdrop-blur dark:border-slate-800/70 dark:bg-slate-900/70 dark:ring-slate-800/70">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Solver & Narrative Workspace
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow dark:bg-slate-200 dark:text-slate-900"
            onClick={() => void onRunAnalysis()}
            disabled={disabled || isRunning}
          >
            {isRunning ? "Running analysis…" : "Run ARC analysis"}
          </button>
          <button
            type="button"
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:text-slate-50"
            onClick={() => void onSaveExplanation()}
            disabled={disabled || !explanationDraft.trim() || saveState === "saving"}
          >
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
              ? "Explanation saved"
              : "Save explanation"}
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-200/70 bg-red-50/60 px-4 py-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {analysis ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Latest analysis ({analysis.model})
          </h3>
          <pre className="max-h-72 overflow-auto rounded-2xl bg-slate-900/90 p-4 text-xs text-slate-100 dark:bg-black/70">
            {JSON.stringify(analysis.analysis, null, 2)}
          </pre>
        </div>
      ) : null}

      <div className="space-y-3">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200" htmlFor="arc-explanation">
          Draft your explanation
        </label>
        <textarea
          id="arc-explanation"
          placeholder="Describe the transformation rules, predicted outputs, and verification steps."
          className="h-40 w-full resize-none rounded-2xl border border-slate-300/70 bg-white/80 px-4 py-3 text-sm text-slate-800 shadow-inner focus:border-slate-500 focus:outline-none dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-slate-100"
          value={explanationDraft}
          onChange={(event) => onDraftChange(event.target.value)}
        />
        {saveState === "error" && saveError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
        ) : saveState === "saved" ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-300">
            Explanation synced with ARC Explainer.
          </p>
        ) : null}
      </div>
    </section>
  );
}

type ArcExample = ArcPuzzleDetail["train"][number];

type ExampleCardProps = {
  label: string;
  example: ArcExample;
};

function ExampleCard({ label, example }: ExampleCardProps) {
  return (
    <div className="space-y-3 rounded-3xl border border-slate-200/60 bg-white/70 p-4 shadow-sm ring-1 ring-slate-200/50 dark:border-slate-700/60 dark:bg-slate-900/60 dark:ring-slate-800/50">
      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</h4>
      <ArcGrid grid={example.input} label="Input" />
      {example.output ? <ArcGrid grid={example.output} label="Output" /> : null}
    </div>
  );
}
