// Follow-up board routes (docs/09 feature order #4, docs/07 board rules).
// The board is the People table regrouped by follow-up status; the API only
// needs the read (ordered like BoardPage: first name ascending, no notes —
// cards never show them) and the "move to" write, which is its own action:
// Admin may move anyone; the Follow-up Coordinator only people assigned to
// them (docs/09 row scope: "a volunteer sees only their assigned people").
// Pastor and Info Desk have no board:move (policy matrix denies them).
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { audit } from "../audit.js";
import { currentMember } from "../lib/route-helpers.js";
import { asFollowUpStatus } from "../lib/enums.js";
import { followUpStatusSchema } from "../schemas/people.js";
import { PERSON_INCLUDE, serializePerson } from "./people.js";

export async function registerBoardRoutes(app: FastifyInstance): Promise<void> {
  // ---- Board data -----------------------------------------------------------
  app.get("/api/board", { config: { access: "auth", action: "people:read" } }, async (req) => {
    const rows = await req.prisma.people.findMany({
      orderBy: [{ firstName: "asc" }],
      include: PERSON_INCLUDE,
    });
    return { items: rows.map((row) => serializePerson(row, false)) };
  });

  // ---- Move (drag & drop / "Move to" menu) ----------------------------------
  app.patch<{ Params: { id: string } }>(
    "/api/people/:id/follow-up-status",
    { config: { access: "auth", action: "board:move" } },
    async (req, reply) => {
      const param = z.uuid().safeParse(req.params.id);
      if (!param.success) {
        return reply.code(400).send({ error: "invalid person id" });
      }
      const parsed = z.object({ followUpStatus: followUpStatusSchema }).safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid follow-up status" });
      }
      const row = await req.prisma.people.findUnique({
        where: { id: param.data },
        select: { id: true, assignedTo: true },
      });
      if (!row) {
        return reply.code(404).send({ error: "not found" });
      }
      // Row scope: the coordinator moves only their assigned people.
      if ((req.roleName ?? "") === "Follow-up Coordinator") {
        const member = await currentMember(req.prisma, req.user!);
        if (!member || row.assignedTo !== member.id) {
          return reply.code(403).send({ error: "forbidden" });
        }
      }
      const updated = await req.prisma.people.update({
        where: { id: row.id },
        data: { followUpStatus: asFollowUpStatus(parsed.data.followUpStatus) },
        include: PERSON_INCLUDE,
      });
      await audit(req.prisma, {
        userId: req.user!.id,
        action: "board.move",
        entity: "people",
        entityId: row.id,
        message: `follow-up status moved to ${parsed.data.followUpStatus}`,
      });
      return serializePerson(updated, false);
    },
  );
}
