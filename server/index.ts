import { createApp, log } from "./createApp";
import { createServer } from "http";
import { autoReindexIfNeeded } from "./embeddings";

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

declare module "express-session" {
  interface SessionData {
    userId: number;
  }
}

// Prevent transient DB / network errors from crashing the entire server
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception (server staying alive):", err.message);
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection (server staying alive):", reason);
});

(async () => {
  const isProduction = process.env.NODE_ENV === "production";
  const { app, ready } = createApp({ serveStaticFiles: isProduction });
  const httpServer = createServer(app);

  // In development, set up Vite HMR before waiting for route init
  if (!isProduction) {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  await ready;

  const port = parseInt(process.env.PORT || "5001", 10);
  httpServer.listen({ port, host: "0.0.0.0" }, () => {
    log(`serving on port ${port}`);

    autoReindexIfNeeded()
      .then((result) => {
        if (result) log(`Auto-indexed KB: ${result.entries} entries → ${result.total} chunks`);
      })
      .catch((err) => console.error("Auto-reindex failed:", err));
  });
})();
