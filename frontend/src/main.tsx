/*
 * Author: Cascade (model: Cascade)
 * Date: 2025-11-03 15:45 UTC-05:00
 * PURPOSE: Frontend entrypoint mounting the React tree with global ChatKit styling applied.
 * SRP/DRY check: Pass - orchestrates application bootstrap and shared styles.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "https://cdn.jsdelivr.net/npm/@openai/chatkit@0.0.0/styles.css";
import "./index.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element with id 'root' not found");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
