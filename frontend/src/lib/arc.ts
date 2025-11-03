import { ARC_API_URL } from "./config";

const BASE_URL = ARC_API_URL.replace(/\/$/, "");

type RequestOptions = RequestInit & { skipJson?: boolean };

type ArcExample = {
  input: number[][] | null | undefined;
  output?: number[][] | null | undefined;
};

export type ArcPuzzleListItem = {
  puzzleId: string;
  taskId: string;
  title?: string;
  source?: string;
  difficulty?: string;
  raw: unknown;
};

export type ArcPuzzleDetail = {
  puzzleId: string;
  taskId: string;
  title?: string;
  source?: string;
  difficulty?: string;
  train: ArcExample[];
  test: ArcExample[];
  metadata: Record<string, unknown>;
  raw: unknown;
};

export type ArcAnalysisOptions = {
  model?: string;
  promptId?: string;
  temperature?: number | null;
  captureReasoning?: boolean | null;
  originalExplanation?: string | null;
  customChallenge?: string | null;
  previousResponseId?: string | null;
  extraOptions?: Record<string, unknown> | null;
};

export type ArcAnalysisResult = {
  model: string;
  analysis: unknown;
};

export type ArcExplanationPayload = {
  explanation: string;
  customChallenge?: string | null;
  tags?: string[] | null;
};

export async function listArcPuzzles(params?: {
  page?: number;
  limit?: number;
  source?: string;
}): Promise<ArcPuzzleListItem[]> {
  const search = new URLSearchParams();
  if (params?.page) {
    search.set("page", String(params.page));
  }
  if (params?.limit) {
    search.set("limit", String(params.limit));
  }
  if (params?.source) {
    search.set("source", params.source);
  }

  const query = search.toString();
  const data = await request(`/puzzles${query ? `?${query}` : ""}`);
  const rows = Array.isArray((data as any)?.puzzles)
    ? (data as any).puzzles
    : Array.isArray(data)
    ? data
    : Array.isArray((data as any)?.items)
    ? (data as any).items
    : [];

  return rows.map(normalizePuzzleListItem);
}

export async function fetchArcPuzzle(taskId: string): Promise<ArcPuzzleDetail> {
  const encoded = encodeURIComponent(taskId);
  const payload = await request(`/puzzles/${encoded}`);
  const puzzle = (payload as any)?.puzzle ?? payload ?? {};

  const puzzleId =
    (puzzle?.puzzleId as string | undefined) ||
    (puzzle?.id as string | undefined) ||
    (puzzle?.taskId as string | undefined) ||
    taskId;

  const train = normalizeExamples(puzzle, "train");
  const test = normalizeExamples(puzzle, "test");

  return {
    puzzleId,
    taskId: (puzzle?.taskId as string | undefined) ?? taskId,
    title: puzzle?.title as string | undefined,
    source: puzzle?.source as string | undefined,
    difficulty: puzzle?.difficulty as string | undefined,
    train,
    test,
    metadata: buildMetadataSnapshot(puzzle),
    raw: puzzle,
  };
}

export async function analyzeArcPuzzle(
  taskId: string,
  options: ArcAnalysisOptions
): Promise<ArcAnalysisResult> {
  const encoded = encodeURIComponent(taskId);
  const payload = cleanPayload(options);
  const result = await request(`/puzzles/${encoded}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const model = (result as any)?.model ?? options.model ?? "unknown";
  const analysis = (result as any)?.analysis ?? result;
  return { model, analysis };
}

export async function checkArcPuzzleHasExplanation(
  puzzleId: string
): Promise<boolean> {
  const encoded = encodeURIComponent(puzzleId);
  const response = await request(
    `/puzzles/${encoded}/has-explanation`
  );

  const value = (response as any)?.hasExplanation ?? response;
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "object" && value !== null && "result" in value) {
    return Boolean((value as any).result);
  }
  return Boolean(value);
}

export async function saveArcPuzzleExplanation(
  puzzleId: string,
  payload: ArcExplanationPayload
): Promise<unknown> {
  const encoded = encodeURIComponent(puzzleId);
  const body = cleanPayload(payload);
  return request(`/puzzles/${encoded}/explanations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function request(path: string, options: RequestOptions = {}) {
  const url = `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, options);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      errorText || `${response.status} ${response.statusText || "Request failed"}`
    );
  }

  if (options.skipJson) {
    return null;
  }

  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    return text;
  }
}

function normalizePuzzleListItem(raw: any): ArcPuzzleListItem {
  const puzzleId =
    (raw?.puzzleId as string | undefined) ||
    (raw?.id as string | undefined) ||
    (raw?.taskId as string | undefined) ||
    "unknown";
  const taskId =
    (raw?.taskId as string | undefined) ||
    (raw?.puzzleId as string | undefined) ||
    puzzleId;

  return {
    puzzleId,
    taskId,
    title: raw?.title as string | undefined,
    source: raw?.source as string | undefined,
    difficulty: raw?.difficulty as string | undefined,
    raw,
  };
}

function normalizeExamples(puzzle: any, key: "train" | "test"): ArcExample[] {
  const candidates =
    (puzzle?.task?.[key] as unknown) ?? (puzzle?.[key] as unknown) ?? [];

  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates.map((example: any) => ({
    input: example?.input ?? null,
    output: example?.output ?? example?.answer ?? null,
  }));
}

function cleanPayload<T extends Record<string, unknown | null | undefined>>(payload: T) {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (typeof value === "object" && Object.keys(value).length === 0) {
      continue;
    }
    result[key] = value;
  }
  return result;
}

function buildMetadataSnapshot(puzzle: any): Record<string, unknown> {
  if (puzzle == null || typeof puzzle !== "object") {
    return {};
  }

  const snapshot: Record<string, unknown> = {};
  const keys = [
    "dataset",
    "source",
    "difficulty",
    "tags",
    "contributors",
    "createdAt",
    "updatedAt",
  ];

  for (const key of keys) {
    if (key in puzzle) {
      snapshot[key] = (puzzle as any)[key];
    }
  }

  return snapshot;
}
