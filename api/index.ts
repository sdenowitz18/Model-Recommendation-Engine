import type { IncomingMessage, ServerResponse } from "http";
import { createApp } from "../server/createApp";

// Initialize the Express app once. The `ready` promise ensures migrations
// and route registration complete before the first request is handled.
const { app, ready } = createApp({ serveStaticFiles: true });

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await ready;
  app(req, res);
}
