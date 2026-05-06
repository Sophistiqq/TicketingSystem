import { Elysia, t } from "elysia";
import { prisma } from "../../lib/prisma";
import { validator } from "../plugins/authValidator";
import { broadcaster } from "../ws/broadcaster";
import { createAndPushNotification } from "./notifications";

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

// Helpers 

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

// PUT sub-handlers 

/**
 * Validates and applies a status transition.
 * Returns { error } on failure, or { updateData } with fields to merge.
 */
async function handleStatusTransition(
  ticketId: number,
  ticket: any,
  newStatus: string,
  body: any,
  userId: number,
  roles: string[] | undefined,
): Promise<{ error?: { code: number; message: string }; updateData?: Record<string, any> }> {
  const allowedTransitions = STATUS_TRANSITIONS[ticket.status] ?? [];
  if (!allowedTransitions.includes(newStatus)) {
    return {
      error: {
        code: 400,
        message: `Cannot transition from ${ticket.status} to ${newStatus}`,
      },
    };
  }

  // Only admins can close a ticket
  if (newStatus === "closed" && !roles?.includes("admin")) {
    return { error: { code: 403, message: "Only an administrator can close this ticket." } };
  }

  // Only requester or staff can reopen
  const isReopening =
    newStatus === "open" &&
    ["closed", "resolved", "rejected"].includes(ticket.status);

  if (isReopening) {
    const isStaff = roles?.includes("admin") || roles?.includes("mis");
    if (ticket.requester_id !== userId && !isStaff) {
      return {
        error: { code: 403, message: "Only the requester or staff can reopen this ticket." },
      };
    }
  }

  // Assignee required to start progress
  if (newStatus === "in_progress") {
    const finalAssigneeId = body.assignee_id !== undefined ? body.assignee_id : ticket.assignee_id;
    if (!finalAssigneeId) {
      return {
        error: { code: 400, message: "An assignee is required to start progress on this ticket." },
      };
    }
  }

  await createAuditLog(ticketId, userId, "status_change", ticket.status, newStatus);

  const updateData: Record<string, any> = { status: newStatus };

  if (newStatus === "in_progress") {
    updateData.started_at = new Date();
  }

  if (newStatus === "resolved" || newStatus === "closed") {
    updateData.completed_at = new Date();
  }

  if (isReopening) {
    updateData.completed_at = null;
    updateData.started_at = null;
    updateData.reopen_count = { increment: 1 };
    updateData.assignee_id = null;
  }

  // Side-effects: resolution attempt on resolve
  if (newStatus === "resolved" && ticket.assignee_id) {
    const attemptNumber =
      (await prisma.resolutionAttempt.count({ where: { ticket_id: ticketId } })) + 1;

    await prisma.resolutionAttempt.create({
      data: {
        ticket_id: ticketId,
        attempt_number: attemptNumber,
        handled_by_id: ticket.assignee_id,
        resolved_at: new Date(),
        notes: body.resolution_notes ?? null,
      },
    });

    await createAndPushNotification(
      ticket.requester_id,
      ticketId,
      "ticket_resolved",
      `Your ticket "${ticket.title}" has been resolved.`,
    );
  }

  // Side-effects: reopen bookkeeping
  if (isReopening) {
    const latestAttempt = await prisma.resolutionAttempt.findFirst({
      where: { ticket_id: ticketId },
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

    // Reset CSAT so it can be re-rated after new resolution
    await prisma.cSAT.deleteMany({ where: { ticket_id: ticketId } });

    await createAndPushNotification(
      ticket.requester_id,
      ticketId,
      "ticket_reopened",
      `Your ticket "${ticket.title}" has been reopened.`,
    );
  }

  return { updateData };
}

/**
 * Handles reassigning the ticket to a new assignee (or unassigning).
 * Returns fields to merge into updateData.
 */
async function handleReassignment(
  ticketId: number,
  ticket: any,
  newAssigneeId: number | null,
  userId: number,
): Promise<Record<string, any>> {
  const oldAssigneeName = ticket.assignee
    ? `${ticket.assignee.first_name} ${ticket.assignee.last_name} (${ticket.assignee.username})`
    : "unassigned";

  if (newAssigneeId) {
    const newAssignee = await prisma.user.findUnique({
      where: { id: newAssigneeId },
      select: { first_name: true, last_name: true, username: true },
    });
    const newAssigneeName = newAssignee
      ? `${newAssignee.first_name} ${newAssignee.last_name} (${newAssignee.username})`
      : newAssigneeId.toString();

    await createAuditLog(ticketId, userId, "assignment", oldAssigneeName, newAssigneeName);

    // Notify the new assignee (skip if self-assign)
    if (newAssigneeId !== userId) {
      await prisma.message.create({
        data: {
          content: `You have been assigned to ticket #${ticketId}: ${ticket.title}`,
          receiver_id: newAssigneeId,
          sender_id: userId,
          ticket_id: ticketId,
        },
      });

      broadcaster.messageSent(newAssigneeId, {
        content: `You have been assigned to ticket #${ticketId}: ${ticket.title}`,
        sender_id: userId,
        receiver_id: newAssigneeId,
        ticket_id: ticketId,
      } as any);
    }

    await createAndPushNotification(
      newAssigneeId,
      ticketId,
      "ticket_assigned",
      `You have been assigned to ticket: ${ticket.title}`,
    );
  } else {
    await createAuditLog(ticketId, userId, "assignment", oldAssigneeName, "unassigned");
  }

  // Keep CSAT agent in sync
  await prisma.cSAT.updateMany({
    where: { ticket_id: ticketId },
    data: { agent_id: newAssigneeId },
  });

  return { assignee_id: newAssigneeId };
}

/**
 * Audits and collects field-level changes (title, description, priority,
 * due_date, department, request_type, affected_system, other_* freetext).
 */
async function handleFieldUpdates(
  ticketId: number,
  ticket: any,
  body: any,
  userId: number,
  roles: string[] | undefined,
): Promise<Record<string, any>> {
  const updateData: Record<string, any> = {};

  if (body.title && body.title !== ticket.title) {
    await createAuditLog(ticketId, userId, "title_changed", ticket.title, body.title);
    updateData.title = body.title;
  }

  if (body.description && body.description !== ticket.description) {
    await createAuditLog(
      ticketId,
      userId,
      "description_changed",
      ticket.description.slice(0, 100),
      body.description.slice(0, 100),
    );
    updateData.description = body.description;
  }

  if (body.priority && body.priority !== ticket.priority) {
    await createAuditLog(ticketId, userId, "priority_changed", ticket.priority, body.priority);
    updateData.priority = body.priority;
  }

  if (body.due_date !== undefined) {
    if (body.due_date === null) {
      updateData.due_date = null;
      updateData.sla_breached = false;
      updateData.breached_at = null;
    } else {
      updateData.due_date = new Date(body.due_date);
    }
  }

  if (body.department_id !== undefined && body.department_id !== ticket.department_id) {
    await createAuditLog(
      ticketId,
      userId,
      "department_changed",
      ticket.department_id?.toString() ?? "none",
      body.department_id?.toString() ?? "none",
    );
    updateData.department_id = body.department_id;
  }

  if (body.request_type_id !== undefined && body.request_type_id !== ticket.request_type_id) {
    await createAuditLog(
      ticketId,
      userId,
      "request_type_changed",
      ticket.request_type_id?.toString() ?? "none",
      body.request_type_id?.toString() ?? "none",
    );
    updateData.request_type_id = body.request_type_id;
  }

  if (body.affected_system_id !== undefined && body.affected_system_id !== ticket.affected_system_id) {
    await createAuditLog(
      ticketId,
      userId,
      "affected_system_changed",
      ticket.affected_system_id?.toString() ?? "none",
      body.affected_system_id?.toString() ?? "none",
    );
    updateData.affected_system_id = body.affected_system_id;
  }

  if (body.hardware_item_id !== undefined && body.hardware_item_id !== ticket.hardware_item_id) {
    await createAuditLog(
      ticketId,
      userId,
      "hardware_item_changed",
      ticket.hardware_item_id?.toString() ?? "none",
      body.hardware_item_id?.toString() ?? "none",
    );
    updateData.hardware_item_id = body.hardware_item_id;
  }

  // Free-text "other" overrides - staff only to prevent requester abuse
  const isStaff = roles?.includes("admin") || roles?.includes("mis");
  if (isStaff) {
    if (body.other_request_type !== undefined) updateData.other_request_type = body.other_request_type;
    if (body.other_affected_system !== undefined) updateData.other_affected_system = body.other_affected_system;
    if (body.other_department !== undefined) updateData.other_department = body.other_department;
  }

  return updateData;
}

// Router 

export const tickets = new Elysia({ prefix: "/tickets" })
  .use(validator)

  // List tickets with filtering
  .get("/", async ({ query, user, roles, status }) => {
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

    if (!roles?.includes("admin") && !roles?.includes("mis") && !roles?.includes("approver")) {
      where.requester_id = user;
    }
    if (assignee_id) where.assignee_id = assignee_id;
    if (requester_id) where.requester_id = requester_id;
    if (department_id) where.department_id = department_id;
    if (priority) where.priority = priority;
    if (affected_system_id) where.affected_system_id = affected_system_id;
    if (request_type_id) where.request_type_id = request_type_id;
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }

    // Apply status filter - overdue takes priority and replaces any status param
    if (overdue === "true") {
      where.due_date = { lte: new Date() };
      where.status = { notIn: ["resolved", "closed"] };
    } else if (ticketStatus) {
      where.status = ticketStatus;
    }

    const skip = (page - 1) * limit;
    const orderBy: any = { [sort]: order };

    // Auto-detect SLA breaches
    await prisma.ticket.updateMany({
      where: {
        due_date: { lte: new Date() },
        sla_breached: false,
        status: { notIn: ["resolved", "closed"] },
      },
      data: { sla_breached: true, breached_at: new Date() },
    });

    const [data, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          requester: { omit: { password: true } },
          assignee: { omit: { password: true } },
          request_type: true,
          affected_system: true,
          _count: { select: { attachments: true, resolution_attempts: true } },
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
  }, {
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
          t.Literal("id"),
          t.Literal("title"),
          t.Literal("status"),
          t.Literal("priority"),
          t.Literal("created_at"),
          t.Literal("updated_at"),
          t.Literal("due_date"),
        ]),
      ),
      order: t.Optional(t.Union([t.Literal("asc"), t.Literal("desc")])),
    }),
    isAuth: true,
  })

  // Get single ticket
  .get("/:id", async ({ params, user, roles, status }) => {
    const ticket = await prisma.ticket.findUnique({
      where: { id: params.id },
      include: {
        requester: { omit: { password: true } },
        assignee: { omit: { password: true } },
        request_type: { select: { id: true, name: true, department_id: true } },
        affected_system: { select: { id: true, name: true, department_id: true } },
        hardware_item: true,
        approvers: { include: { approver: { omit: { password: true } } } },
        attachments: true,
        resolution_attempts: { include: { handled_by: { omit: { password: true } } } },
        audit_logs: {
          include: { performed_by: { omit: { password: true } } },
          orderBy: { created_at: "desc" },
        },
        csat: true,
        department: true,
      },
    });

    if (!ticket) return status(404, { message: "Ticket not found" });

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

    return status(200, ticket);
  }, {
    params: t.Object({ id: t.Numeric() }),
    isAuth: true,
  })

  // Get ticket preview (title only for references)
  .get("/:id/preview", async ({ params, status }) => {
    const ticket = await prisma.ticket.findUnique({
      where: { id: params.id },
      select: { id: true, title: true },
    });
    if (!ticket) return status(404, { message: "Ticket not found" });
    return status(200, ticket);
  }, {
    params: t.Object({ id: t.Numeric() }),
    isAuth: true,
  })

  // Create ticket
  .post("/", async ({ body, user }) => {
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

      // 3. Resolve Targeted Department (Affected System > Request Type > MIS)
      let departmentId = body.department_id;
      if (!departmentId) {
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
            const misDept = await tx.department.findUnique({ where: { name: "MIS" } });
            departmentId = misDept?.id;
          }
        }
      }

      // 4. Determine approval & priority
      const requiresApproval = body.requires_approval ?? requestType?.requires_approval_by_default ?? false;
      const priority = (body.priority ?? "medium") as any;

      // 5. Auto SLA calculation
      let dueDate = body.due_date ? new Date(body.due_date) : null;
      if (!dueDate) {
        const now = new Date();
        const slaHours: Record<string, number> = {
          critical: 4,
          high: 24,
          medium: 72,
          low: 120,
        };
        const hours = slaHours[priority] ?? 120;
        dueDate = new Date(now.getTime() + hours * 60 * 60 * 1000);
      }

      // 6. Create ticket
      const ticket = await tx.ticket.create({
        data: {
          title: body.title,
          description: body.description,
          priority,
          requester_id: user,
          request_type_id: requestTypeId,
          affected_system_id: affectedSystemId,
          hardware_item_id: body.hardware_item_id,
          department_id: departmentId,
          requires_approval: requiresApproval,
          status: requiresApproval ? "pending_approval" : "open",
          due_date: dueDate,
          other_request_type: body.other_request_type,
          other_affected_system: body.other_affected_system,
          other_department: body.other_department,
        },
        include: {
          requester: { omit: { password: true } },
          request_type: true,
          affected_system: true,
          hardware_item: true,
          department: true,
        },
      });

      // 7. Initial audit log
      await tx.auditLog.create({
        data: {
          ticket_id: ticket.id,
          performed_by_id: user,
          action: "ticket_created",
          new_value: ticket.status,
          notes: `Ticket created for ${ticket.department?.name ?? "Unknown"} department with priority ${priority}. SLA set to ${dueDate?.toLocaleString() ?? "none"}.`,
        },
      });

      // 8. Handle approvers
      if (requiresApproval) {
        const defaultApprover =
          (await tx.user.findFirst({
            where: { is_active: true, roles: { some: { role: "approver" } } },
          })) ??
          (await tx.user.findFirst({
            where: { is_active: true, roles: { some: { role: { in: ["admin", "mis"] } } } },
          }));

        if (defaultApprover) {
          await tx.ticketApprover.create({
            data: { ticket_id: ticket.id, approver_id: defaultApprover.id, status: "pending" },
          });
          await createAndPushNotification(
            defaultApprover.id,
            ticket.id,
            "approval_requested",
            `New approval request for ticket #${ticket.id}: ${ticket.title}`,
            tx,
          );
        }
      }

      // 9. Notify MIS if no approval needed
      if (!requiresApproval) {
        const misUsers = await tx.user.findMany({
          where: { roles: { some: { role: "mis" } }, is_active: true },
        });
        for (const misUser of misUsers) {
          await createAndPushNotification(misUser.id, ticket.id, "ticket_created", `New ticket created: ${ticket.title}`, tx);
        }
      }

      return ticket;
    });
  }, {
    body: t.Object({
      title: t.String({ minLength: 5 }),
      description: t.String({ minLength: 20 }),
      priority: t.Optional(t.String()),
      request_type_id: t.Optional(t.Numeric()),
      affected_system_id: t.Optional(t.Numeric()),
      hardware_item_id: t.Optional(t.Numeric()),
      department_id: t.Optional(t.Numeric()),
      requires_approval: t.Optional(t.Boolean()),
      due_date: t.Optional(t.String({ format: "date-time" })),
      other_request_type: t.Optional(t.String()),
      other_affected_system: t.Optional(t.String()),
      other_department: t.Optional(t.String()),
    }),
    isAuth: true,
  })

  // Update ticket
  .put("/:id", async ({ params, body, user, roles, status }) => {
    const ticket = await prisma.ticket.findUnique({
      where: { id: params.id },
      include: {
        requester: { select: { id: true, username: true, first_name: true, last_name: true } },
        assignee: { select: { id: true, username: true, first_name: true, last_name: true } },
      },
    });
    if (!ticket) return status(404, { message: "Ticket not found" });

    const canEdit =
      roles?.includes("admin") ||
      roles?.includes("mis") ||
      ticket.requester_id === user;
    if (!canEdit) return status(403, { message: "Access denied" });

    let updateData: Record<string, any> = {};

    // Status transition
    if (body.status && body.status !== ticket.status) {
      const result = await handleStatusTransition(
        params.id, ticket, body.status, body, user, roles,
      );
      if (result.error) return status(result.error.code as any, { message: result.error.message });
      Object.assign(updateData, result.updateData);
    }

    // Reassignment
    if (body.assignee_id !== undefined && body.assignee_id !== ticket.assignee_id) {
      const assignData = await handleReassignment(params.id, ticket, body.assignee_id, user);
      Object.assign(updateData, assignData);
    }

    // Field-level updates
    const fieldData = await handleFieldUpdates(params.id, ticket, body, user, roles);
    Object.assign(updateData, fieldData);

    if (Object.keys(updateData).length === 0) {
      return status(200, ticket); // Nothing changed
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

    broadcaster.ticketUpdated(params.id, {
      field: Object.keys(updateData).join(", "),
      old_value: null,
      new_value: null,
      status: updated.status,
      updated_by: `User #${user}`,
    });

    return status(200, updated);
  }, {
    params: t.Object({ id: t.Numeric() }),
    body: t.Object({
      title: t.Optional(t.String()),
      description: t.Optional(t.String()),
      status: t.Optional(t.String()),
      priority: t.Optional(t.String()),
      assignee_id: t.Optional(t.Nullable(t.Numeric())),
      department_id: t.Optional(t.Nullable(t.Numeric())),
      request_type_id: t.Optional(t.Nullable(t.Numeric())),
      affected_system_id: t.Optional(t.Nullable(t.Numeric())),
      hardware_item_id: t.Optional(t.Nullable(t.Numeric())),
      reopen_reason: t.Optional(t.String()),
      resolution_notes: t.Optional(t.String()),
      due_date: t.Optional(t.Nullable(t.String({ format: "date-time" }))),
      other_request_type: t.Optional(t.Nullable(t.String())),
      other_affected_system: t.Optional(t.Nullable(t.String())),
      other_department: t.Optional(t.Nullable(t.String())),
    }),
    isAuth: true,
  })

  // Escalate ticket to approval (MIS/admin only)
  .post("/:id/escalate", async ({ params, user, status }) => {
    const ticket = await prisma.ticket.findUnique({
      where: { id: params.id },
      include: { approvers: true },
    });
    if (!ticket) return status(404, { message: "Ticket not found" });

    if (ticket.escalated_to_approval) {
      return status(400, { message: "Ticket is already escalated" });
    }

    const hasPendingApproval = ticket.approvers.some((a) => a.status === "pending");

    return await prisma.$transaction(async (tx) => {
      if (!hasPendingApproval) {
        const defaultApprover =
          (await tx.user.findFirst({
            where: { is_active: true, roles: { some: { role: "approver" } } },
          })) ??
          (await tx.user.findFirst({
            where: { is_active: true, roles: { some: { role: "admin" } } },
          }));

        if (defaultApprover) {
          await tx.ticketApprover.create({
            data: { ticket_id: ticket.id, approver_id: defaultApprover.id, status: "pending" },
          });
          await createAndPushNotification(
            defaultApprover.id,
            ticket.id,
            "approval_requested",
            `ESCALATED: Ticket #${ticket.id} requires urgent approval.`,
            tx,
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
        },
      });

      await createAndPushNotification(
        ticket.requester_id,
        ticket.id,
        "escalated",
        `Your ticket "${ticket.title}" has been escalated for approval.`,
        tx,
      );

      broadcaster.ticketUpdated(ticket.id, {
        field: "status, escalated",
        old_value: ticket.status,
        new_value: "pending_approval",
        status: "pending_approval",
        updated_by: `MIS Staff #${user}`,
      });

      return updated;
    });
  }, {
    params: t.Object({ id: t.Numeric() }),
    isAuth: true,
    hasRole: ["mis", "admin"],
  })

  // Soft-delete ticket (sets status to closed)
  .delete("/:id", async ({ params, user, status }) => {
    const ticket = await prisma.ticket.findUnique({ where: { id: params.id } });
    if (!ticket) return status(404, { message: "Ticket not found" });

    await prisma.ticket.update({
      where: { id: params.id },
      data: { status: "closed" },
    });

    await createAuditLog(params.id, user, "status_change", ticket.status, "closed", "Ticket closed via delete action.");

    broadcaster.ticketUpdated(params.id, {
      field: "status",
      old_value: ticket.status,
      new_value: "closed",
      status: "closed",
      updated_by: `User #${user}`,
    });

    return status(204);
  }, {
    params: t.Object({ id: t.Numeric() }),
    hasRole: ["admin", "mis"],
  })

  // My requested tickets
  .get("/my/requested", async ({ user, query, status }) => {
    const {
      page = 1, limit = 20, sort = "created_at", order = "desc",
      search, status: ticketStatus, priority, overdue,
    } = query;

    const where: any = { requester_id: user };
    if (priority) where.priority = priority;
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }
    if (overdue === "true") {
      where.due_date = { lte: new Date() };
      where.status = { notIn: ["resolved", "closed"] };
    } else if (ticketStatus) {
      where.status = ticketStatus;
    }

    const skip = (page - 1) * limit;
    const orderBy: any = { [sort]: order };

    const [data, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          assignee: { omit: { password: true } },
          request_type: true,
          affected_system: true,
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
  }, {
    query: t.Object({
      page: t.Optional(t.Numeric({ minimum: 1 })),
      limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
      search: t.Optional(t.String()),
      status: t.Optional(t.String()),
      priority: t.Optional(t.String()),
      overdue: t.Optional(t.String()),
      sort: t.Optional(
        t.Union([
          t.Literal("id"),
          t.Literal("title"),
          t.Literal("status"),
          t.Literal("priority"),
          t.Literal("created_at"),
        ]),
      ),
      order: t.Optional(t.Union([t.Literal("asc"), t.Literal("desc")])),
    }),
    isAuth: true,
  })

  // My assigned tickets
  .get("/my/assigned", async ({ user, query, status }) => {
    const {
      page = 1, limit = 20, sort = "created_at", order = "desc",
      search, status: ticketStatus, priority, overdue,
    } = query;

    const where: any = { assignee_id: user };
    if (priority) where.priority = priority;
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
      ];
    }
    if (overdue === "true") {
      where.due_date = { lte: new Date() };
      where.status = { notIn: ["resolved", "closed"] };
    } else if (ticketStatus) {
      where.status = ticketStatus;
    }

    const skip = (page - 1) * limit;
    const orderBy: any = { [sort]: order };

    const [data, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        include: {
          requester: { omit: { password: true } },
          assignee: { omit: { password: true } },
          request_type: true,
          affected_system: true,
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
  }, {
    query: t.Object({
      page: t.Optional(t.Numeric({ minimum: 1 })),
      limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
      search: t.Optional(t.String()),
      status: t.Optional(t.String()),
      priority: t.Optional(t.String()),
      overdue: t.Optional(t.String()),
      sort: t.Optional(
        t.Union([
          t.Literal("id"),
          t.Literal("title"),
          t.Literal("status"),
          t.Literal("priority"),
          t.Literal("created_at"),
        ]),
      ),
      order: t.Optional(t.Union([t.Literal("asc"), t.Literal("desc")])),
    }),
    isAuth: true,
  })

  // Toggle approver (MIS/admin only)
  .post("/:id/approver/toggle", async ({ params, body, user, status }) => {
    const ticketId = params.id;
    const approverId = body.approver_id;

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { approvers: true },
    });
    if (!ticket) return status(404, { message: "Ticket not found" });

    if (["resolved", "closed", "rejected"].includes(ticket.status)) {
      return status(400, { message: "Cannot manage approvers on a completed or rejected ticket." });
    }

    const existing = ticket.approvers.find((a) => a.approver_id === approverId);

    if (existing) {
      if (existing.status !== "pending") {
        return status(400, { message: "Cannot remove an approver who has already decided." });
      }

      return await prisma.$transaction(async (tx) => {
        await tx.ticketApprover.delete({ where: { id: existing.id } });

        const remainingPending = await tx.ticketApprover.count({
          where: { ticket_id: ticketId, status: "pending" },
        });
        const totalRemaining = await tx.ticketApprover.count({
          where: { ticket_id: ticketId },
        });

        let newStatus = ticket.status;
        if (remainingPending === 0 && ticket.status === "pending_approval") {
          newStatus = ticket.assignee_id ? "in_progress" : "open";
          await tx.ticket.update({
            where: { id: ticketId },
            data: {
              status: newStatus,
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
                `Ticket returned to ${newStatus} because no pending approvers remain.` +
                (totalRemaining === 0 ? " Escalation flag reset." : ""),
            },
          });

          broadcaster.ticketUpdated(ticketId, {
            field: "status",
            old_value: "pending_approval",
            new_value: newStatus,
            status: newStatus,
            updated_by: `MIS Staff #${user}`,
          });
        }

        await createAuditLog(ticketId, user, "approver_removed", null, approverId.toString());
        return { action: "removed", status: newStatus };
      });
    } else {
      const approverUser = await prisma.user.findFirst({
        where: { id: approverId, is_active: true, roles: { some: { role: "approver" } } },
      });
      if (!approverUser) return status(400, { message: "Invalid approver selected." });

      return await prisma.$transaction(async (tx) => {
        await tx.ticketApprover.create({
          data: { ticket_id: ticketId, approver_id: approverId, status: "pending" },
        });

        const needsStatusUpdate = ticket.status !== "pending_approval";
        const needsEscalationFlag = !ticket.requires_approval && !ticket.escalated_to_approval;

        if (needsStatusUpdate || needsEscalationFlag) {
          await tx.ticket.update({
            where: { id: ticketId },
            data: {
              status: "pending_approval",
              ...(needsEscalationFlag
                ? { escalated_to_approval: true, escalated_at: new Date(), escalated_by_id: user }
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

        await createAuditLog(
          ticketId,
          user,
          "approver_added",
          null,
          `${approverUser.first_name} ${approverUser.last_name}`,
        );

        await createAndPushNotification(
          approverId,
          ticketId,
          "approval_requested",
          `You have been requested to approve ticket #${ticketId}: ${ticket.title}`,
          tx,
        );

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
  }, {
    params: t.Object({ id: t.Numeric() }),
    body: t.Object({ approver_id: t.Numeric() }),
    hasRole: ["mis", "admin"],
  });
