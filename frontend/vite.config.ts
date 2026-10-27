import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import svgr from "vite-plugin-svgr";
import { fileURLToPath } from "node:url";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, extname } from "node:path";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const sharedRoot = fileURLToPath(new URL("../shared", import.meta.url));
const frontendRoot = fileURLToPath(new URL(".", import.meta.url));

function publicLanding(): Plugin {
  const landing = resolve(frontendRoot, "public/landing/index.html");
  return {
    name: "greenloop-public-landing",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = new URL(req.url ?? "/", "http://localhost").pathname;
        if (!["GET", "HEAD"].includes(req.method ?? "") || !["/", "/index.html"].includes(path)) return next();
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.end(req.method === "HEAD" ? undefined : readFileSync(landing));
      });
    },
    writeBundle() {
      // Vite builds the authenticated SPA normally; retain its entry document
      // before replacing only the public root document with the supplied site.
      const dist = resolve(frontendRoot, "dist");
      copyFileSync(resolve(dist, "index.html"), resolve(dist, "app.html"));
      writeFileSync(resolve(dist, "index.html"), readFileSync(landing));
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = new URL(req.url ?? "/", "http://localhost").pathname;
        if (!["GET", "HEAD"].includes(req.method ?? "") || path === "/" || extname(path)) return next();
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.end(req.method === "HEAD" ? undefined : readFileSync(resolve(frontendRoot, "dist/app.html")));
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, projectRoot, ["PORT"]);
  const apiPort = process.env.PORT ?? rootEnv.PORT ?? "3001";
  const frontendPort = Number(process.env.VITE_PORT ?? 5173);
  return {
  envDir: projectRoot,
  server: { port: frontendPort, strictPort: true, proxy: { "/api": `http://127.0.0.1:${apiPort}` } },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": sharedRoot,
    },
  },
  plugins: [
    publicLanding(),
    react(),
    svgr({
      svgrOptions: {
        icon: true,
        // This will transform your SVG to a React component
        exportType: "named",
        namedExport: "ReactComponent",
      },
    }),
  ],
  build: {
    outDir: "dist",
    rolldownOptions: {
      onwarn(warning, warn) {
        // Skip eval warnings from react-jvectormap
        if (
          warning.code === "EVAL" &&
          warning.id?.includes("@react-jvectormap")
        ) {
          return;
        }
        warn(warning);
      },
    },
  },
  };
});
