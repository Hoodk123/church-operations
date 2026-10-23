// Route registration hub. Feature areas are added here one by one (Phase 3
// order); the server's startup check refuses to boot if ANY registered route
// lacks its policy declaration.
import type { FastifyInstance } from "fastify";
import { registerHealthRoutes } from "./health.js";
import { registerAuthRoutes } from "./auth.js";
import { registerPeopleRoutes } from "./people.js";
import { registerCheckInRoutes } from "./checkin.js";
import { registerBoardRoutes } from "./board.js";
import { registerMetricsRoutes } from "./metrics.js";

export async function addStandardRoutes(app: FastifyInstance): Promise<void> {
  await registerHealthRoutes(app);
  await registerAuthRoutes(app);
  await registerPeopleRoutes(app);
  await registerCheckInRoutes(app);
  await registerBoardRoutes(app);
  await registerMetricsRoutes(app);
}
