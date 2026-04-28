import { Elysia, t } from "elysia";
import { prisma } from "../../lib/prisma";
import { validator } from "../plugins/authValidator";

export const audit = new Elysia({ prefix: "/audit" })
  .use(validator)
  // Get auth audit logs (admin/MIS only)
  .get("/auth", async ({ query, status }) => {
    const {
      action,
      exclude_action,
      performed_by_id,
      page = 1,
      limit = 50,
    } = query;

    const where: any = { ticket_id: null }; // Auth logs have NO ticket_id
    if (performed_by_id) where.performed_by_id = performed_by_id;
    if (action) where.action = { contains: action };
    if (exclude_action) where.action = { not: exclude_action };

    const skip = (page - 1) * limit;

    const data = await prisma.auditLog.findMany({
      where,
      include: {
        performed_by: {
          select: { id: true, first_name: true, last_name: true, username: true },
        },
      },
      orderBy: { created_at: "desc" },
      skip,
      take: limit,
    });
    const total = await prisma.auditLog.count({ where });

    return status(200, {
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  },
    {
      query: t.Object({
        action: t.Optional(t.String()),
        exclude_action: t.Optional(t.String()),
        performed_by_id: t.Optional(t.Numeric()),
        page: t.Optional(t.Numeric({ minimum: 1 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
      }),
      hasRole: ["admin", "mis"],
    },
  )

  // Get audit logs for a specific ticket
  .get("/tickets/:ticketId", async ({ params, user, roles, status }) => {
    const ticket = await prisma.ticket.findUnique({
      where: { id: params.ticketId },
      include: { approvers: true },
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

    const logs = await prisma.auditLog.findMany({
      where: { ticket_id: params.ticketId },
      include: {
        performed_by: {
          select: { id: true, first_name: true, last_name: true, username: true },
        },
      },
      orderBy: { created_at: "desc" },
    });

    return status(200, logs);
  },
    {
      params: t.Object({ ticketId: t.Numeric() }),
      isAuth: true,
    },
  )

  // Get all audit logs (admin/MIS only) with filtering
  .get("/", async ({ query, status }) => {
    const {
      ticket_id,
      performed_by_id,
      action,
      exclude_action,
      page = 1,
      limit = 50,
    } = query;

    // IMPORTANT: Ticket Activity MUST have a ticket_id
    // Auth activity has ticket_id: null
    const where: any = { ticket_id: { not: null } };

    if (ticket_id) where.ticket_id = ticket_id;
    if (performed_by_id) where.performed_by_id = performed_by_id;
    if (action) where.action = { contains: action };
    if (exclude_action) where.action = { not: exclude_action };

    const skip = (page - 1) * limit;

    const data = await prisma.auditLog.findMany({
      where,
      include: {
        ticket: {
          select: { id: true, title: true, status: true },
        },
        performed_by: {
          select: { id: true, first_name: true, last_name: true, username: true },
        },
      },
      orderBy: { created_at: "desc" },
      skip,
      take: limit,
    });
    const total = await prisma.auditLog.count({ where });

    return status(200, {
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  },
    {
      query: t.Object({
        ticket_id: t.Optional(t.Numeric()),
        performed_by_id: t.Optional(t.Numeric()),
        action: t.Optional(t.String()),
        exclude_action: t.Optional(t.String()),
        page: t.Optional(t.Numeric({ minimum: 1 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
      }),
      hasRole: ["admin", "mis"],
    },
  );
