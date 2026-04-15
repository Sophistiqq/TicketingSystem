import { Elysia, t } from "elysia";
import { prisma } from "../../lib/prisma";
import { validator } from "../plugins/authValidator";

export const tickets = new Elysia({ prefix: "/tickets" })
  .use(validator);

// Valid status transitions
const STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ["in_progress", "pending_approval", "rejected"],
  in_progress: ["pending_approval", "resolved", "open"],
  pending_approval: ["in_progress"],
  resolved: ["closed"],
  closed: ["open"], // reopen
  rejected: ["open", "in_progress"],
};

/**
 * Create a notification for a user
 */
async function createNotification(
  userId: number,
  ticketId: number,
  type: string,
  message: string,
) {
  await prisma.notification.create({
    data: { user_id: userId, ticket_id: ticketId, type, message },
  });
}

/**
 * Create an audit log entry
 */
async function createAuditLog(
  ticketId: number,
  performedById: number,
  action: string,
  oldValue: string | null,
  newValue: string | null,
  notes?: string,
) {
  await prisma.auditLog.create({
    data: {
      ticket_id: ticketId,
      performed_by_id: performedById,
      action,
      old_value: oldValue,
      new_value: newValue,
      notes,
    },
  });
}

tickets
  // List tickets with filtering
  .get(
    "/",
    async ({ query, user, roles, status }) => {
      const {
        status: ticketStatus,
        priority,
        assignee_id,
        requester_id,
        affected_system_id,
        request_type_id,
        search,
        overdue,
        page = 1,
        limit = 20,
        sort = "created_at",
        order = "desc",
      } = query;

      const where: any = {};

      // Regular users see their own tickets; MIS/admin/approver see all
      if (!roles?.includes("admin") && !roles?.includes("mis") && !roles?.includes("approver")) {
        where.requester_id = user;
      }
      if (assignee_id) where.assignee_id = assignee_id;
      if (requester_id) where.requester_id = requester_id;
      if (ticketStatus) where.status = ticketStatus;
      if (priority) where.priority = priority;
      if (affected_system_id) where.affected_system_id = affected_system_id;
      if (request_type_id) where.request_type_id = request_type_id;
      if (search) {
        where.OR = [
          { title: { contains: search } },
          { description: { contains: search } },
        ];
      }

      // Overdue filter: tickets past due_date that are not resolved/closed
      if (overdue === "true") {
        where.due_date = { lte: new Date() };
        where.status = { notIn: ["resolved", "closed"] };
      }

      const skip = (page - 1) * limit;
      const orderBy: any = {};
      orderBy[sort] = order;

      // Auto-detect SLA breaches before fetching
      await prisma.ticket.updateMany({
        where: {
          due_date: { lte: new Date() },
          sla_breached: false,
          status: { notIn: ["resolved", "closed"] },
        },
        data: {
          sla_breached: true,
          breached_at: new Date(),
        },
      });

      const [data, total] = await Promise.all([
        prisma.ticket.findMany({
          where,
          include: {
            requester: { omit: { password: true } },
            assignee: { omit: { password: true } },
            request_type: true,
            affected_system: true,
            _count: {
              select: {
                attachments: true,
                resolution_attempts: true,
              },
            },
          },
          orderBy,
          skip,
          take: limit,
        }),
        prisma.ticket.count({ where }),
      ]);

      return status(200, {
        data,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    },
    {
      query: t.Object({
        status: t.Optional(t.String()),
        priority: t.Optional(t.String()),
        assignee_id: t.Optional(t.Numeric()),
        requester_id: t.Optional(t.Numeric()),
        affected_system_id: t.Optional(t.Numeric()),
        request_type_id: t.Optional(t.Numeric()),
        search: t.Optional(t.String()),
        overdue: t.Optional(t.String()),
        page: t.Optional(t.Numeric({ minimum: 1 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
        sort: t.Optional(
          t.Union([
            t.Literal("created_at"),
            t.Literal("updated_at"),
            t.Literal("priority"),
            t.Literal("status"),
          ]),
        ),
        order: t.Optional(t.Union([t.Literal("asc"), t.Literal("desc")])),
      }),
      isAuth: true,
    },
  )

  // Get single ticket
  .get(
    "/:id",
    async ({ params, user, roles, status }) => {
      const ticket = await prisma.ticket.findUnique({
        where: { id: params.id },
        include: {
          requester: { omit: { password: true } },
          assignee: { omit: { password: true } },
          request_type: true,
          affected_system: true,
          approvers: { include: { approver: { omit: { password: true } } } },
          attachments: true,
          resolution_attempts: {
            include: { handled_by: { omit: { password: true } } },
          },
          audit_logs: {
            include: { performed_by: { omit: { password: true } } },
            orderBy: { created_at: "desc" },
          },
          csat: true,
        },
      });

      if (!ticket) return status(404, { message: "Ticket not found" });

      // Check access
      const isOwner = ticket.requester_id === user;
      const isAssignee = ticket.assignee_id === user;
      const isApprover = ticket.approvers.some(
        (a) => a.approver_id === user,
      );
      const hasAccess =
        roles?.includes("admin") ||
        roles?.includes("mis") ||
        roles?.includes("approver") ||
        isOwner ||
        isAssignee ||
        isApprover;

      if (!hasAccess) return status(403, { message: "Access denied" });

      return status(200, ticket);
    },
    {
      params: t.Object({ id: t.Numeric() }),
      isAuth: true,
    },
  )

  // Create ticket
  .post(
    "/",
    async ({ body, user, status }) => {
      const requestType = body.request_type_id
        ? await prisma.requestType.findUnique({
            where: { id: body.request_type_id },
          })
        : null;

      const requiresApproval =
        body.requires_approval ??
        requestType?.requires_approval_by_default ??
        false;

      const ticket = await prisma.ticket.create({
        data: {
          title: body.title,
          description: body.description,
          priority: body.priority ?? "medium",
          requester_id: user,
          request_type_id: body.request_type_id ?? null,
          affected_system_id: body.affected_system_id ?? null,
          requires_approval: requiresApproval,
          status: requiresApproval ? "pending_approval" : "open",
          due_date: body.due_date ? new Date(body.due_date) : null,
        },
        include: {
          requester: { omit: { password: true } },
          request_type: true,
          affected_system: true,
        },
      });

      // Notify MIS team for assignment (if not pending approval)
      if (!requiresApproval) {
        const misUsers = await prisma.user.findMany({
          where: { roles: { some: { role: "mis" } }, is_active: true },
        });
        for (const misUser of misUsers) {
          await createNotification(
            misUser.id,
            ticket.id,
            "ticket_created",
            `New ticket created: ${ticket.title}`,
          );
        }
      }

      return status(201, ticket);
    },
    {
      body: t.Object({
        title: t.String(),
        description: t.String(),
        priority: t.Optional(t.String()),
        request_type_id: t.Optional(t.Numeric()),
        affected_system_id: t.Optional(t.Numeric()),
        requires_approval: t.Optional(t.Boolean()),
        due_date: t.Optional(t.String({ format: "date-time" })),
      }),
      isAuth: true,
    },
  )

  // Update ticket (status transitions, reassignment, etc.)
  .put(
    "/:id",
    async ({ params, body, user, roles, status }) => {
      const ticket = await prisma.ticket.findUnique({
        where: { id: params.id },
        include: {
          requester: { select: { id: true, username: true, first_name: true, last_name: true } },
          assignee: { select: { id: true, username: true, first_name: true, last_name: true } },
        },
      });
      if (!ticket) return status(404, { message: "Ticket not found" });

      // Check permission
      const canEdit =
        roles?.includes("admin") ||
        roles?.includes("mis") ||
        ticket.requester_id === user;
      if (!canEdit) return status(403, { message: "Access denied" });

      const updateData: any = {};

      // Handle status transition if provided
      if (body.status && body.status !== ticket.status) {
        const allowedTransitions = STATUS_TRANSITIONS[ticket.status] || [];
        if (!allowedTransitions.includes(body.status)) {
          return status(400, {
            message: `Cannot transition from ${ticket.status} to ${body.status}`,
          });
        }

        await createAuditLog(
          params.id,
          user,
          "status_change",
          ticket.status,
          body.status,
        );

        updateData.status = body.status;

        // Track time: started_at (open → in_progress)
        if (body.status === "in_progress") {
          updateData.started_at = new Date();
        }

        // Track time: completed_at (in_progress → resolved/closed)
        if (body.status === "resolved" || body.status === "closed") {
          updateData.completed_at = new Date();
        }

        // Clear time tracking on reopen
        if (body.status === "open") {
          updateData.completed_at = null;
        }

        // Clear started_at when going back to open (unassign/reset)
        if (body.status === "open" && ticket.status === "in_progress") {
          updateData.started_at = null;
        }

        // If resolving, create resolution attempt
        if (body.status === "resolved" && ticket.assignee_id) {
          const attemptNumber =
            (await prisma.resolutionAttempt.count({
              where: { ticket_id: params.id },
            })) + 1;

          await prisma.resolutionAttempt.create({
            data: {
              ticket_id: params.id,
              attempt_number: attemptNumber,
              handled_by_id: ticket.assignee_id,
              resolved_at: new Date(),
              notes: body.resolution_notes ?? null,
            },
          });

          await createNotification(
            ticket.requester_id,
            params.id,
            "ticket_resolved",
            `Your ticket "${ticket.title}" has been resolved.`,
          );
        }

        // If reopening
        if (body.status === "open" && ticket.status === "closed") {
          const latestAttempt = await prisma.resolutionAttempt.findFirst({
            where: { ticket_id: params.id },
            orderBy: { created_at: "desc" },
          });
          if (latestAttempt) {
            await prisma.resolutionAttempt.update({
              where: { id: latestAttempt.id },
              data: {
                reopened_at: new Date(),
                reopen_reason: body.reopen_reason || "Ticket reopened",
              },
            });
          }
          updateData.reopen_count = { increment: 1 };

          await createNotification(
            ticket.requester_id,
            params.id,
            "ticket_reopened",
            `Your ticket "${ticket.title}" has been reopened.`,
          );
        }
      }

      // If assigning to someone
      if (body.assignee_id !== undefined && body.assignee_id !== ticket.assignee_id) {
        const oldAssignee = ticket.assignee
          ? `${ticket.assignee.first_name} ${ticket.assignee.last_name} (${ticket.assignee.username})`
          : "unassigned";

        if (body.assignee_id) {
          const newAssignee = await prisma.user.findUnique({
            where: { id: body.assignee_id },
            select: { first_name: true, last_name: true, username: true },
          });
          const newAssigneeName = newAssignee
            ? `${newAssignee.first_name} ${newAssignee.last_name} (${newAssignee.username})`
            : body.assignee_id.toString();

          await createAuditLog(
            params.id,
            user,
            "assignment",
            oldAssignee,
            newAssigneeName,
          );
        } else {
          await createAuditLog(
            params.id,
            user,
            "assignment",
            oldAssignee,
            "unassigned",
          );
        }

        updateData.assignee_id = body.assignee_id;

        if (body.assignee_id) {
          await createNotification(
            body.assignee_id,
            params.id,
            "ticket_assigned",
            `You have been assigned to ticket: ${ticket.title}`,
          );
        }
      }

      // Audit title change
      if (body.title && body.title !== ticket.title) {
        await createAuditLog(
          params.id,
          user,
          "title_changed",
          ticket.title,
          body.title,
        );
        updateData.title = body.title;
      }

      // Audit description change
      if (body.description && body.description !== ticket.description) {
        await createAuditLog(
          params.id,
          user,
          "description_changed",
          ticket.description.slice(0, 100),
          body.description.slice(0, 100),
        );
        updateData.description = body.description;
      }

      // Audit priority change
      if (body.priority && body.priority !== ticket.priority) {
        await createAuditLog(
          params.id,
          user,
          "priority_changed",
          ticket.priority,
          body.priority,
        );
        updateData.priority = body.priority;
      }

      // Update due_date (admin/MIS only can clear)
      if (body.due_date !== undefined) {
        if (body.due_date === null) {
          updateData.due_date = null;
          // Clear SLA breach if due_date is removed
          updateData.sla_breached = false;
          updateData.breached_at = null;
        } else {
          updateData.due_date = new Date(body.due_date);
        }
      }

      const updated = await prisma.ticket.update({
        where: { id: params.id },
        data: updateData,
        include: {
          requester: { omit: { password: true } },
          assignee: { omit: { password: true } },
          request_type: true,
          affected_system: true,
        },
      });

      return status(200, updated);
    },
    {
      params: t.Object({ id: t.Numeric() }),
      body: t.Object({
        title: t.Optional(t.String()),
        description: t.Optional(t.String()),
        status: t.Optional(t.String()),
        priority: t.Optional(t.String()),
        assignee_id: t.Optional(t.Nullable(t.Numeric())),
        reopen_reason: t.Optional(t.String()),
        resolution_notes: t.Optional(t.String()),
        due_date: t.Optional(t.Nullable(t.String({ format: "date-time" }))),
      }),
      isAuth: true,
    },
  )

  // Delete ticket (admin/MIS only)
  .delete(
    "/:id",
    async ({ params, status }) => {
      const ticket = await prisma.ticket.findUnique({
        where: { id: params.id },
      });
      if (!ticket) return status(404, { message: "Ticket not found" });

      await prisma.ticket.update({
        where: { id: params.id },
        data: { status: "closed" },
      });
      return status(204);
    },
    {
      params: t.Object({ id: t.Numeric() }),
      hasRole: ["admin", "mis"],
    },
  )

  // Get my tickets (as requester)
  .get(
    "/my/requested",
    async ({ user, query, status }) => {
      const { page = 1, limit = 20 } = query;
      const skip = (page - 1) * limit;

      const [data, total] = await Promise.all([
        prisma.ticket.findMany({
          where: { requester_id: user },
          include: {
            assignee: { omit: { password: true } },
            request_type: true,
            affected_system: true,
          },
          orderBy: { created_at: "desc" },
          skip,
          take: limit,
        }),
        prisma.ticket.count({ where: { requester_id: user } }),
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
  )

  // Get tickets assigned to me
  .get(
    "/my/assigned",
    async ({ user, query, status }) => {
      const { page = 1, limit = 20 } = query;
      const skip = (page - 1) * limit;

      const [data, total] = await Promise.all([
        prisma.ticket.findMany({
          where: { assignee_id: user },
          include: {
            requester: { omit: { password: true } },
            request_type: true,
            affected_system: true,
          },
          orderBy: { created_at: "desc" },
          skip,
          take: limit,
        }),
        prisma.ticket.count({ where: { assignee_id: user } }),
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
