import type { IncomingMessage, ServerResponse } from "http";
import { createApp } from "../server/createApp";

// On Vercel, static files are served by the CDN from dist/public (outputDirectory).
// Express only needs to handle API routes here.
let app: ReturnType<typeof createApp>["app"];
let ready: Promise<void>;

try {
  const result = createApp({ serveStaticFiles: false });
  app = result.app;
  ready = result.ready;
} catch (err) {
  console.error("[vercel] createApp failed during module init:", err);
  throw err;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    await ready;
    app(req, res);
  } catch (err) {
    console.error("[vercel] handler error:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "Server initialization failed", error: String(err) }));
    }
  }
}
