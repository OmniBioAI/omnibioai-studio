import '@omnibioai/design-tokens/tokens.css';
import '@omnibioai/ui/dist/index.css';
import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";
import "../index.css";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN ||
    "https://6f276b43d22779115f8bec538e562ada@o4511460178132992.ingest.us.sentry.io/4511464831188992",
  environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || "beta",
  release: "0.2.0-beta",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

Sentry.captureMessage("OmniBioAI Studio loaded", "info");

ReactDOM.createRoot(document.getElementById("root")).render(
  <App />
);
