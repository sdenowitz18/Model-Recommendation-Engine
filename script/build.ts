import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, mkdir, writeFile, cp } from "fs/promises";

// Server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "multer",
  "nanoid",
  "officeparser",
  "openai",
  "pg",
  "uuid",
  "xlsx",
  "zod",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });
  await rm(".vercel/output", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild(); // outputs to dist/public

  console.log("building server (self-hosted)...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: { "process.env.NODE_ENV": '"production"' },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  // -------------------------------------------------------------------------
  // Vercel Build Output API (v3)
  // Generates .vercel/output/ so Vercel uses our explicit routing config.
  // This avoids all auto-detection ambiguities with api/ directory + rewrites.
  // -------------------------------------------------------------------------
  console.log("building vercel output...");

  const funcDir = ".vercel/output/functions/index.func";
  await mkdir(funcDir, { recursive: true });
  await mkdir(".vercel/output/static", { recursive: true });

  // Bundle the Express handler as a self-contained ESM function
  await esbuild({
    entryPoints: ["api/_entry.ts"],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile: `${funcDir}/index.js`,
    define: { "process.env.NODE_ENV": '"production"' },
    external: ["bufferutil"],
    logLevel: "info",
  });

  // Vercel function config
  await writeFile(
    `${funcDir}/.vc-config.json`,
    JSON.stringify(
      {
        runtime: "nodejs20.x",
        handler: "index.js",
        launcherType: "Nodejs",
        shouldAddHelpers: false,
      },
      null,
      2,
    ),
  );

  // Copy Vite build to Vercel static output
  await cp("dist/public", ".vercel/output/static", { recursive: true });

  // Routing: API calls → function, static files served from filesystem, SPA fallback
  await writeFile(
    ".vercel/output/config.json",
    JSON.stringify(
      {
        version: 3,
        routes: [
          { src: "/api/(.*)", dest: "/index" },
          { handle: "filesystem" },
          { src: "/(.*)", dest: "/index.html" },
        ],
      },
      null,
      2,
    ),
  );

  console.log("vercel output ready at .vercel/output/");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
