import express, { type Request, Response, NextFunction, type Express } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { createServer } from "http";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

/**
 * Configure an Express app with all middleware and API routes.
 * Returns the app and a `ready` Promise that resolves once async
 * initialization (migrations + route registration) is complete.
 *
 * Pass `serveStaticFiles: true` to also mount the Vite build output
 * for static file serving (used in self-hosted production mode).
 * On Vercel, static files are served by the function's includeFiles bundle
 * so we still call serveStatic — it works the same way.
 */
export function createApp(opts: { serveStaticFiles?: boolean } = {}) {
  const app = express();

  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: false }));

  const PgSession = connectPgSimple(session);
  app.use(
    session({
      store: new PgSession({
        conString: process.env.DATABASE_URL,
        tableName: "user_sessions",
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "dev-secret-change-in-production",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: "lax",
      },
    }),
  );

  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }
        log(logLine);
      }
    });

    next();
  });

  const ready = (async () => {
    try {
      await db.execute(sql`ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS reference_type text`);
      console.log("[migrate] knowledge_base.reference_type column ready");
    } catch (err) {
      console.warn("[migrate] Could not run knowledge_base migration:", err);
    }

    // httpServer is not actually used inside registerRoutes, so we pass a stub
    const stubServer = createServer(app);
    await registerRoutes(stubServer, app);

    app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      console.error("Internal Server Error:", err);
      if (res.headersSent) return next(err);
      return res.status(status).json({ message });
    });

    if (opts.serveStaticFiles) {
      serveStatic(app);
    }
  })();

  return { app, ready };
}
