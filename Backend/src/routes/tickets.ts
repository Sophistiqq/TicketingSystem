import { Elysia, t } from "elysia";
import { prisma } from "../../lib/prisma";
import { validator } from "../plugins/authValidator";
import { broadcaster } from "../ws/broadcaster";
import { createAndPushNotification } from "./notifications";

export const tickets = new Elysia({ prefix: "/tickets" })
  .use(validator);

// Valid status transitions
const STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ["in_progress", "pending_approval", "rejected"],
  in_progress: ["pending_approval", "pending_hard_copy", "resolved", "open"],
  pending_approval: ["in_progress", "rejected"],
  pending_hard_copy: ["resolved", "in_progress"],
  resolved: ["closed", "open"],
  closed: ["open"],
  rejected: ["open"],
};

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
        department_id,
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
      if (department_id) where.department_id = department_id;
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

      const data = await prisma.ticket.findMany({
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
      });
      const total = await prisma.ticket.count({ where });

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
        department_id: t.Optional(t.Numeric()),
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
          request_type: { select: { id: true, name: true, department_id: true } },
          affected_system: { select: { id: true, name: true, department_id: true } },
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
          department: true,
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

  // Get ticket preview (title only for references)
  .get(
    "/:id/preview",
    async ({ params, status }) => {
      const ticket = await prisma.ticket.findUnique({
        where: { id: params.id },
        select: { id: true, title: true }
      });
      if (!ticket) return status(404, { message: "Ticket not found" });
      return status(200, ticket);
    },
    {
      params: t.Object({ id: t.Numeric() }),
      isAuth: true
    }
  )

  // Create ticket
  .post(
    "/",
    async ({ body, user }) => {
      return await prisma.$transaction(async (tx) => {
        // 1. Resolve Request Type with fallback
        let requestTypeId = body.request_type_id;
        if (!requestTypeId) {
          const others = await tx.requestType.findUnique({ where: { name: "Others" } });
          requestTypeId = others?.id;
        }

        const requestType = requestTypeId
          ? await tx.requestType.findUnique({ where: { id: requestTypeId } })
          : null;

        // 2. Resolve Affected System with fallback
        let affectedSystemId = body.affected_system_id;
        if (!affectedSystemId) {
          const others = await tx.affectedSystem.findUnique({ where: { name: "Others" } });
          affectedSystemId = others?.id;
        }

        // 3. Resolve Targeted Department
        let departmentId = body.department_id;
        if (!departmentId) {
          // Fallback order: Affected System -> Request Type -> Default MIS
          const system = affectedSystemId
            ? await tx.affectedSystem.findUnique({ where: { id: affectedSystemId } })
            : null;
          
          if (system?.department_id) {
            departmentId = system.department_id;
          } else {
            const rt = requestTypeId
              ? await tx.requestType.findUnique({ where: { id: requestTypeId } })
              : null;
            if (rt?.department_id) {
              departmentId = rt.department_id;
            } else {
              // Final fallback: Find 'MIS' department
              const misDept = await tx.department.findUnique({ where: { name: "MIS" } });
              departmentId = misDept?.id;
            }
          }
        }

        // 4. Determine Approval Workflow
        const requiresApproval = body.requires_approval ?? requestType?.requires_approval_by_default ?? false;
        const priority = (body.priority ?? "medium") as any;

        // 5. Automatic SLA Calculation (if not provided)
        let dueDate = body.due_date ? new Date(body.due_date) : null;
        if (!dueDate) {
          const now = new Date();
          if (priority === "critical") dueDate = new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4h
          else if (priority === "high") dueDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h
          else if (priority === "medium") dueDate = new Date(now.getTime() + 72 * 60 * 60 * 1000); // 3 days
          else dueDate = new Date(now.getTime() + 120 * 60 * 60 * 1000); // 5 days
        }

        // 6. Create Ticket
        const ticket = await tx.ticket.create({
          data: {
            title: body.title,
            description: body.description,
            priority,
            requester_id: user,
            request_type_id: requestTypeId,
            affected_system_id: affectedSystemId,
            department_id: departmentId,
            requires_approval: requiresApproval,
            status: requiresApproval ? "pending_approval" : "open",
            due_date: dueDate,
          },
          include: {
            requester: { omit: { password: true } },
            request_type: true,
            affected_system: true,
            department: true,
          },
        });

        // 7. Audit initial creation
        await tx.auditLog.create({
          data: {
            ticket_id: ticket.id,
            performed_by_id: user,
            action: "ticket_created",
            new_value: ticket.status,
            notes: `Ticket created for ${ticket.department?.name ?? 'Unknown'} department with priority ${priority}. SLA set to ${dueDate?.toLocaleString() ?? 'none'}.`
          }
        });

        // 7. Handle Approvers if needed
        if (requiresApproval) {
          let defaultApprover = await tx.user.findFirst({
            where: { is_active: true, roles: { some: { role: 'approver' } } },
          });

          if (!defaultApprover) {
            defaultApprover = await tx.user.findFirst({
              where: { is_active: true, roles: { some: { role: { in: ['admin', 'mis'] } } } },
            });
          }

          if (defaultApprover) {
            await tx.ticketApprover.create({
              data: {
                ticket_id: ticket.id,
                approver_id: defaultApprover.id,
                status: 'pending',
              },
            });

            await createAndPushNotification(
              defaultApprover.id,
              ticket.id,
              'approval_requested',
              `New approval request for ticket #${ticket.id}: ${ticket.title}`,
              tx
            );
          }
        }

        // 8. Notify MIS if no approval needed
        if (!requiresApproval) {
          const misUsers = await tx.user.findMany({
            where: { roles: { some: { role: "mis" } }, is_active: true },
          });

          for (const misUser of misUsers) {
            await createAndPushNotification(
              misUser.id,
              ticket.id,
              "ticket_created",
              `New ticket created: ${ticket.title}`,
              tx
            );
          }
        }

        return ticket;
      });
    },
    {
      body: t.Object({
        title: t.String({ minLength: 5 }),
        description: t.String({ minLength: 20 }),
        priority: t.Optional(t.String()),
        request_type_id: t.Optional(t.Numeric()),
        affected_system_id: t.Optional(t.Numeric()),
        department_id: t.Optional(t.Numeric()),
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

        // ENFORCEMENT: Only admin can close a ticket
        if (body.status === "closed" && !roles?.includes("admin")) {
          return status(403, { message: "Only an administrator can close this ticket." });
        }

        // ENFORCEMENT: Only requester can reopen a ticket
        if (body.status === "open" && (ticket.status === "closed" || ticket.status === "resolved")) {
          if (ticket.requester_id !== user) {
            return status(403, { message: "Only the requester can reopen this ticket." });
          }
        }

        // ENFORCEMENT: require assignee for in_progress
        if (body.status === "in_progress") {
          const finalAssigneeId = body.assignee_id !== undefined ? body.assignee_id : ticket.assignee_id;
          if (!finalAssigneeId) {
            return status(400, { message: "An assignee is required to start progress on this ticket." });
          }
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

          await createAndPushNotification(
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

          await createAndPushNotification(
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

          // Automated chat message
          await prisma.message.create({
            data: {
              content: `You have been assigned to ticket #${params.id}: ${ticket.title}`,
              receiver_id: body.assignee_id,
              sender_id: user, // System or current user acting as system
              ticket_id: params.id,
            }
          });
          
          broadcaster.messageSent(body.assignee_id, {
            content: `You have been assigned to ticket #${params.id}: ${ticket.title}`,
            sender_id: user,
            receiver_id: body.assignee_id,
            ticket_id: params.id,
          } as any);
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
          await createAndPushNotification(
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
          department: true,
        },
      });

      // Broadcast ticket update to subscribers
      if (Object.keys(updateData).length > 0) {
        broadcaster.ticketUpdated(params.id, {
          field: Object.keys(updateData).join(', '),
          old_value: null, // Simplification
          new_value: null, // Simplification
          status: updated.status,
          updated_by: `User #${user}`
        });
      }

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

  // Escalate ticket to approval (MIS only)
  .post(
    "/:id/escalate",
    async ({ params, user, status }) => {
      const ticket = await prisma.ticket.findUnique({
        where: { id: params.id },
        include: { approvers: true },
      });
      if (!ticket) return status(404, { message: "Ticket not found" });

      // Check if already escalated or has pending approvals
      if (ticket.escalated_to_approval) {
        return status(400, { message: "Ticket is already escalated" });
      }

      const hasPendingApproval = ticket.approvers.some(a => a.status === 'pending');
      
      return await prisma.$transaction(async (tx) => {
        // Find a default approver if none exist
        if (!hasPendingApproval) {
          let defaultApprover = await tx.user.findFirst({
            where: { is_active: true, roles: { some: { role: 'approver' } } },
          });

          if (!defaultApprover) {
             // Fallback to admin if no specific approver found
             defaultApprover = await tx.user.findFirst({
               where: { is_active: true, roles: { some: { role: 'admin' } } },
             });
          }

          if (defaultApprover) {
            await tx.ticketApprover.create({
              data: {
                ticket_id: ticket.id,
                approver_id: defaultApprover.id,
                status: 'pending',
              },
            });

            await createAndPushNotification(
              defaultApprover.id,
              ticket.id,
              'approval_requested',
              `ESCALATED: Ticket #${ticket.id} requires urgent approval.`,
              tx
            );
          }
        }

        const updated = await tx.ticket.update({
          where: { id: params.id },
          data: {
            status: "pending_approval",
            escalated_to_approval: true,
            escalated_at: new Date(),
            escalated_by_id: user,
          },
        });

        await tx.auditLog.create({
          data: {
            ticket_id: ticket.id,
            performed_by_id: user,
            action: "escalated",
            old_value: ticket.status,
            new_value: "pending_approval",
            notes: "Ticket escalated to approval by MIS staff.",
          }
        });

        // Notify requester
        await createAndPushNotification(
          ticket.requester_id,
          ticket.id,
          "escalated",
          `Your ticket "${ticket.title}" has been escalated for approval.`,
          tx
        );

        // Broadcast update
        broadcaster.ticketUpdated(ticket.id, {
          field: 'status, escalated',
          old_value: ticket.status,
          new_value: 'pending_approval',
          status: 'pending_approval',
          updated_by: `MIS Staff #${user}`
        });

        return updated;
      });
    },
    {
      params: t.Object({ id: t.Numeric() }),
      isAuth: true,
      hasRole: ["mis", "admin"],
    }
  )

  // Delete ticket (admin/MIS only)
  .delete(
    "/:id",
    async ({ params, user, status }) => {
      const ticket = await prisma.ticket.findUnique({
        where: { id: params.id },
      });
      if (!ticket) return status(404, { message: "Ticket not found" });

      await prisma.ticket.update({
        where: { id: params.id },
        data: { status: "closed" },
      });

      // Broadcast ticket update
      broadcaster.ticketUpdated(params.id, {
        field: 'status',
        old_value: ticket.status,
        new_value: 'closed',
        status: 'closed',
        updated_by: `User #${user}`
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

      const data = await prisma.ticket.findMany({
        where: { requester_id: user },
        include: {
          assignee: { omit: { password: true } },
          request_type: true,
          affected_system: true,
        },
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      });
      const total = await prisma.ticket.count({ where: { requester_id: user } });

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

      const data = await prisma.ticket.findMany({
        where: { assignee_id: user },
        include: {
          requester: { omit: { password: true } },
          request_type: true,
          affected_system: true,
        },
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      });
      const total = await prisma.ticket.count({ where: { assignee_id: user } });

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

  // Toggle approver (MIS only)
  .post(
    "/:id/approver/toggle",
    async ({ params, body, user, status }) => {
      const ticketId = params.id;
      const approverId = body.approver_id;

      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        include: { approvers: true },
      });
      if (!ticket) return status(404, { message: "Ticket not found" });

      // Prevent managing approvers on completed tickets
      if (["resolved", "closed", "rejected"].includes(ticket.status)) {
        return status(400, {
          message: "Cannot manage approvers on a completed or rejected ticket.",
        });
      }

      const existing = ticket.approvers.find((a) => a.approver_id === approverId);

      if (existing) {
        // If already approved/rejected, don't allow removal via simple toggle
        if (existing.status !== "pending") {
          return status(400, {
            message: "Cannot remove an approver who has already decided.",
          });
        }

        return await prisma.$transaction(async (tx) => {
          await tx.ticketApprover.delete({ where: { id: existing.id } });

          // Check remaining pending approvers
          const remainingPending = await tx.ticketApprover.count({
            where: {
              ticket_id: ticketId,
              status: "pending",
            },
          });

          // Check if any approvers remain at all
          const totalRemaining = await tx.ticketApprover.count({
            where: { ticket_id: ticketId },
          });

          let newStatus = ticket.status;
          if (remainingPending === 0 && ticket.status === "pending_approval") {
            // Move back to in_progress if assigned, else open
            newStatus = ticket.assignee_id ? "in_progress" : "open";
            await tx.ticket.update({
              where: { id: ticketId },
              data: {
                status: newStatus,
                // If no approvers left at all, reset escalation flag
                ...(totalRemaining === 0 ? { escalated_to_approval: false } : {}),
              },
            });

            await tx.auditLog.create({
              data: {
                ticket_id: ticketId,
                performed_by_id: user,
                action: "status_change",
                old_value: "pending_approval",
                new_value: newStatus,
                notes:
                  "Ticket returned to " +
                  newStatus +
                  " because no pending approvers remain." +
                  (totalRemaining === 0 ? " Escalation flag reset." : ""),
              },
            });

            // Broadcast status change
            broadcaster.ticketUpdated(ticketId, {
              field: "status",
              old_value: "pending_approval",
              new_value: newStatus,
              status: newStatus,
              updated_by: `MIS Staff #${user}`,
            });
          }

          await createAuditLog(
            ticketId,
            user,
            "approver_removed",
            null,
            approverId.toString(),
          );
          return { action: "removed", status: newStatus };
        });
      } else {
        // Verify user is valid approver
        const approverUser = await prisma.user.findFirst({
          where: {
            id: approverId,
            is_active: true,
            roles: { some: { role: "approver" } },
          },
        });
        if (!approverUser)
          return status(400, { message: "Invalid approver selected." });

        return await prisma.$transaction(async (tx) => {
          await tx.ticketApprover.create({
            data: {
              ticket_id: ticketId,
              approver_id: approverId,
              status: "pending",
            },
          });

          // Always move to pending_approval if not already there when adding a pending approver
          const needsStatusUpdate = ticket.status !== "pending_approval";
          const needsEscalationFlag =
            !ticket.requires_approval && !ticket.escalated_to_approval;

          if (needsStatusUpdate || needsEscalationFlag) {
            await tx.ticket.update({
              where: { id: ticketId },
              data: {
                status: "pending_approval",
                ...(needsEscalationFlag
                  ? {
                      escalated_to_approval: true,
                      escalated_at: new Date(),
                      escalated_by_id: user,
                    }
                  : {}),
              },
            });

            await tx.auditLog.create({
              data: {
                ticket_id: ticketId,
                performed_by_id: user,
                action: needsEscalationFlag ? "escalated" : "status_change",
                old_value: ticket.status,
                new_value: "pending_approval",
                notes: needsEscalationFlag
                  ? "Ticket escalated via approver assignment."
                  : "Ticket returned to pending approval due to new approver assignment.",
              },
            });
          }

          const approverName = `${approverUser.first_name} ${approverUser.last_name}`;
          await createAuditLog(
            ticketId,
            user,
            "approver_added",
            null,
            approverName,
          );

          await createAndPushNotification(
            approverId,
            ticketId,
            "approval_requested",
            `You have been requested to approve ticket #${ticketId}: ${ticket.title}`,
            tx,
          );

          // Broadcast update
          broadcaster.ticketUpdated(ticketId, {
            field: "status, escalated",
            old_value: ticket.status,
            new_value: "pending_approval",
            status: "pending_approval",
            updated_by: `MIS Staff #${user}`,
          });

          return { action: "added", escalated: needsEscalationFlag };
        });
      }
    },
    {
      params: t.Object({ id: t.Numeric() }),
      body: t.Object({ approver_id: t.Numeric() }),
      hasRole: ["mis", "admin"],
    },
  );
