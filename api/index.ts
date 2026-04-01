import type { IncomingMessage, ServerResponse } from "http";
import { createApp } from "../server/createApp";

// On Vercel, static files are served by the CDN from dist/public (outputDirectory).
// Express only needs to handle API routes here.
const { app, ready } = createApp({ serveStaticFiles: false });

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await ready;
  app(req, res);
}
