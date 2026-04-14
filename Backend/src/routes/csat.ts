import { Elysia, t } from "elysia";
import { prisma } from "../../lib/prisma";
import { validator } from "../plugins/authValidator";

export const csat = new Elysia({ prefix: "/csat" })
  .use(validator)

  // Submit CSAT for a ticket (requester only, after resolution)
  .post(
    "/",
    async ({ body, user, status }) => {
      const ticket = await prisma.ticket.findUnique({
        where: { id: body.ticket_id },
        include: { csat: true },
      });
      if (!ticket) return status(404, { message: "Ticket not found" });

      // Only the requester can submit CSAT
      if (ticket.requester_id !== user) {
        return status(403, { message: "Only the ticket requester can submit CSAT" });
      }

      // Ticket must be resolved or closed
      if (!["resolved", "closed"].includes(ticket.status)) {
        return status(400, {
          message: "CSAT can only be submitted for resolved or closed tickets",
        });
      }

      // CSAT already submitted
      if (ticket.csat) {
        return status(409, { message: "CSAT already submitted for this ticket" });
      }

      const csat = await prisma.cSAT.create({
        data: {
          ticket_id: body.ticket_id,
          rating: body.rating,
          comment: body.comment ?? null,
          agent_id: ticket.assignee_id,
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          ticket_id: body.ticket_id,
          performed_by_id: user,
          action: "csat_submitted",
          new_value: `Rating: ${body.rating}/5`,
          notes: body.comment ?? null,
        },
      });

      return status(201, csat);
    },
    {
      body: t.Object({
        ticket_id: t.Numeric(),
        rating: t.Integer({ minimum: 1, maximum: 5 }),
        comment: t.Optional(t.String()),
      }),
      isAuth: true,
    },
  )

  // Get CSAT for a ticket
  .get(
    "/tickets/:ticketId",
    async ({ params, user, roles, status }) => {
      const ticket = await prisma.ticket.findUnique({
        where: { id: params.ticketId },
        include: {
          csat: true,
          approvers: true,
        },
      });
      if (!ticket) return status(404, { message: "Ticket not found" });

      // Check access
      const isOwner = ticket.requester_id === user;
      const isAssignee = ticket.assignee_id === user;
      const isApprover = ticket.approvers.some((a) => a.approver_id === user);
      const hasAccess =
        roles?.includes("admin") ||
        roles?.includes("mis") ||
        roles?.includes("approver") ||
        isOwner ||
        isAssignee ||
        isApprover;

      if (!hasAccess) return status(403, { message: "Access denied" });

      if (!ticket.csat) {
        return status(404, { message: "CSAT not submitted for this ticket" });
      }

      return status(200, ticket.csat);
    },
    {
      params: t.Object({ ticketId: t.Numeric() }),
      isAuth: true,
    },
  )

  // Get CSAT stats (admin/MIS only)
  .get(
    "/stats",
    async ({ query, status }) => {
      const { agent_id, start_date, end_date } = query;

      const where: any = {};
      if (agent_id) where.agent_id = agent_id;
      if (start_date || end_date) {
        where.submitted_at = {};
        if (start_date) where.submitted_at.gte = new Date(start_date);
        if (end_date) where.submitted_at.lte = new Date(end_date);
      }

      const csats = await prisma.cSAT.findMany({
        where,
        select: {
          rating: true,
          agent_id: true,
          submitted_at: true,
        },
      });

      if (csats.length === 0) {
        return status(200, {
          count: 0,
          average: 0,
          distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        });
      }

      const total = csats.reduce((sum, c) => sum + c.rating, 0);
      const average = total / csats.length;

      const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const c of csats) {
        distribution[c.rating]++;
      }

      return status(200, {
        count: csats.length,
        average: Math.round(average * 100) / 100,
        distribution,
      });
    },
    {
      query: t.Object({
        agent_id: t.Optional(t.Numeric()),
        start_date: t.Optional(t.String()),
        end_date: t.Optional(t.String()),
      }),
      hasRole: ["admin", "mis"],
    },
  )

  // Get my CSAT (as agent)
  .get(
    "/my/agent",
    async ({ user, query, status }) => {
      const { page = 1, limit = 20 } = query;
      const skip = (page - 1) * limit;

      const [data, total] = await Promise.all([
        prisma.cSAT.findMany({
          where: { agent_id: user },
          include: {
            ticket: {
              select: { id: true, title: true, status: true },
            },
          },
          orderBy: { submitted_at: "desc" },
          skip,
          take: limit,
        }),
        prisma.cSAT.count({ where: { agent_id: user } }),
      ]);

      return status(200, {
        data,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    },
    {
      query: t.Object({
        page: t.Optional(t.Numeric({ minimum: 1 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
      }),
      isAuth: true,
    },
  );
