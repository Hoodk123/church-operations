// Route registration hub. Feature areas are added here one by one (Phase 3
// order); the server's startup check refuses to boot if ANY registered route
// lacks its policy declaration.
import type { FastifyInstance } from "fastify";
import { registerHealthRoutes } from "./health.js";
import { registerAuthRoutes } from "./auth.js";
import { registerPeopleRoutes } from "./people.js";
import { registerCheckInRoutes } from "./checkin.js";
import { registerBoardRoutes } from "./board.js";
import { registerTemplateRoutes } from "./templates.js";
import { registerM1Routes } from "./m1.js";
import { registerMetricsRoutes } from "./metrics.js";
import { registerAdminRoutes } from "./admin.js";
import { registerBaptismRoutes } from "./baptism.js";
import { registerM1FileRoutes } from "./m1-files.js";
import { registerM1MessageRoutes } from "./m1-messages.js";

export async function addStandardRoutes(app: FastifyInstance): Promise<void> {
  await registerHealthRoutes(app);
  await registerAuthRoutes(app);
  await registerPeopleRoutes(app);
  await registerCheckInRoutes(app);
  await registerBoardRoutes(app);
  await registerTemplateRoutes(app);
  await registerM1Routes(app);
  await registerMetricsRoutes(app);
  await registerAdminRoutes(app);
  await registerBaptismRoutes(app);
  await registerM1FileRoutes(app);
  await registerM1MessageRoutes(app);
}
