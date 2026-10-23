// Process entrypoint: build the server, listen, shut down cleanly
// (docs/09: "Graceful shutdown"). Docker/PM2 stop signals close the HTTP
// server first, then disconnect the Prisma pool.
import { buildServer } from "./server.js";
import { loadEnv } from "./env.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await buildServer({ env });

  const port = env.API_PORT;
  const address = "127.0.0.1"; // loopback only; LAN exposure is Phase 9's proxy work

  await app.listen({ port, host: address });
  app.log.info(`API listening on ${address}:${port}`);

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    app.log.info(`received ${signal}, closing`);
    try {
      await app.close();
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  // Boot failures print the reason (config problems, route coverage) and exit
  // nonzero so a service manager reports it instead of silently looping.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
