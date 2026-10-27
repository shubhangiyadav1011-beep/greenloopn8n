import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "./import-public-site.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = resolve(root, ".env");
const backendArgs = [
  "--watch",
  ...(existsSync(envFile) ? [`--env-file=${envFile}`] : []),
  resolve(root, "backend/src/server.mjs"),
];
const viteEntry = resolve(root, "node_modules/vite/bin/vite.js");
const processes = [
  spawn(process.execPath, backendArgs, { cwd: root, stdio: "inherit" }),
  spawn(process.execPath, [viteEntry], {
    cwd: resolve(root, "frontend"),
    stdio: "inherit",
  }),
];

let stopping = false;
const stop = (code) => {
  if (stopping) return;
  stopping = true;
  for (const child of processes) child.kill();
  process.exitCode = code;
};

for (const child of processes) {
  child.on("exit", (code) => stop(code ?? 0));
  child.on("error", (error) => {
    console.error(error);
    stop(1);
  });
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
