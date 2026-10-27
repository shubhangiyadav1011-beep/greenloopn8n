import { createBackend } from "./app.mjs";

const server = createBackend();
// Fail startup on bad credentials/missing migrations rather than serving an
// apparently healthy deployment that cannot persist data. Never fall back silently.
await server.databaseReady();
const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? "127.0.0.1";

server.listen(port, host, () => {
  console.log(`GreenLoop backend: http://${host}:${port}`);
});
