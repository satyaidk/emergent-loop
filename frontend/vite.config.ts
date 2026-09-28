/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The FastAPI server (python) runs on :8000 — started with uvicorn or docker compose.
const API = "http://localhost:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // During `npm run dev`, calls to /api and /healthz are forwarded to FastAPI,
    // so the browser only ever talks to one address.
    proxy: {
      "/api": API,
      "/healthz": API,
      "/docs": API,
      "/openapi.json": API,
    },
  },
  build: {
    // FastAPI serves whatever lands here (see STATIC_DIR in app/main.py).
    outDir: "../app/static",
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    restoreMocks: true,
  },
});
