import type { IncomingMessage, ServerResponse } from "http";
import { createApp } from "../server/createApp";

// Static assets (.js, .css, etc.) are served from the CDN via .vercel/output/static.
// The function handles API routes AND serves index.html for SPA route fallbacks.
let app: ReturnType<typeof createApp>["app"] | null = null;
let ready: Promise<void> = Promise.resolve();
let initError: unknown = null;

try {
  const result = createApp({ serveStaticFiles: true });
  app = result.app;
  ready = result.ready;
} catch (err) {
  initError = err;
  console.error("[vercel] createApp failed during module init:", err);
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (initError || !app) {
    const msg = initError ? String(initError) : "App failed to initialize";
    console.error("[vercel] init error on request:", msg);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Server initialization failed", error: msg }));
    return;
  }
  try {
    await ready;
    app(req, res);
  } catch (err) {
    console.error("[vercel] handler error:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Handler error", error: String(err) }));
    }
  }
}
