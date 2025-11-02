import type { StartScreenPromptDefinition } from "@openai/chatkit";

const { VITE_CHATKIT_API_URL, VITE_CHATKIT_API_DOMAIN_KEY, VITE_FACTS_API_URL } =
  import.meta.env;

export const CHATKIT_API_URL = VITE_CHATKIT_API_URL ?? "/chatkit";

/**
 * ChatKit still expects a domain key at runtime. Use any placeholder locally,
 * but register your production domain at
 * https://platform.openai.com/settings/organization/security/domain-allowlist
 * and deploy the real key.
 */
export const CHATKIT_API_DOMAIN_KEY =
  VITE_CHATKIT_API_DOMAIN_KEY ?? "domain_pk_localhost_dev";

export const FACTS_API_URL = VITE_FACTS_API_URL ?? "/facts";

export const THEME_STORAGE_KEY = "chatkit-boilerplate-theme";

export const GREETING = "Welcome to the ARC Explainer workspace";

export const STARTER_PROMPTS: StartScreenPromptDefinition[] = [
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
