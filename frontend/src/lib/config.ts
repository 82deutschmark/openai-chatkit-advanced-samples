/*
 * Author: Cascade (model: Cascade)
 * Date: 2025-11-02 23:40 UTC-05:00
 * PURPOSE: Centralizes frontend runtime configuration for ChatKit and ARC integration values and UI copy.
 * SRP/DRY check: Pass - single responsibility for exposing environment-derived configuration constants.
 */

const env = import.meta.env as Record<string, string | undefined>;

type StartScreenPrompt = {
  label: string;
  prompt: string;
  icon?: string;
};

export const CHATKIT_API_URL = env.VITE_CHATKIT_API_URL ?? "/chatkit";

/**
 * ChatKit still expects a domain key at runtime. Use any placeholder locally,
 * but register your production domain at
 * https://platform.openai.com/settings/organization/security/domain-allowlist
 * and deploy the real key.
 */
export const CHATKIT_API_DOMAIN_KEY =
  env.VITE_CHATKIT_API_DOMAIN_KEY ?? "domain_pk_localhost_dev";

export const FACTS_API_URL = env.VITE_FACTS_API_URL ?? "/facts";

export const ARC_API_URL = env.VITE_ARC_API_URL ?? "/arc";

export const THEME_STORAGE_KEY = "chatkit-boilerplate-theme";

export const GREETING = "Welcome to the ARC Explainer workspace";

export const STARTER_PROMPTS: StartScreenPrompt[] = [
  {
    label: "Browse puzzles",
    prompt: "Show me ARC puzzles to explore",
    icon: "grid",
  },
  {
    label: "Explain a task",
    prompt: "Walk me through solving an ARC task",
    icon: "sparkle",
  },
  {
    label: "Run solver",
    prompt: "Call the ARC solver for a puzzle",
    icon: "cpu",
  },
  {
    label: "Save explanation",
    prompt: "Help me submit an explanation to ARC Explainer",
    icon: "bookmark",
  },
];

export const PLACEHOLDER_INPUT = "Ask about an ARC puzzle or solver run";
