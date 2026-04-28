import { Elysia, t } from "elysia";
import { prisma } from "../../lib/prisma";
import { validator } from "../plugins/authValidator";
import { createAndPushNotification } from "./notifications";
import { broadcaster } from "../ws/broadcaster";

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
export const approvals = new Elysia({ prefix: "/approvals" })
  .use(validator)
  // List approvers for a ticket
  .get("/", async ({ query, user, roles, status }) => {
    const ticket = await prisma.ticket.findUnique({
      where: { id: query.ticket_id },
      include: {
        approvers: {
          include: { approver: { omit: { password: true } } },
        },
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
      isOwner ||
      isAssignee ||
      isApprover;

    if (!hasAccess) return status(403, { message: "Access denied" });

    return status(200, ticket.approvers);
  },
    {
      query: t.Object({ ticket_id: t.Numeric() }),
      isAuth: true,
    },
  )

  // Add approvers to a ticket (admin/MIS only)
  .post("/", async ({ body, user, roles, status }) => {
    const ticket = await prisma.ticket.findUnique({
      where: { id: body.ticket_id },
      include: { approvers: true },
    });
    if (!ticket) return status(404, { message: "Ticket not found" });

    // Only admin/MIS can add approvers
    if (!roles?.includes("admin") && !roles?.includes("mis")) {
      return status(403, { message: "Only admin/MIS can add approvers" });
    }

    // Verify all approvers exist and have approver role
    const approverUsers = await prisma.user.findMany({
      where: {
        id: { in: body.approver_ids },
        roles: { some: { role: "approver" } },
      },
      select: { id: true, first_name: true, last_name: true, username: true },
    });

    if (approverUsers.length !== body.approver_ids.length) {
      return status(400, {
        message: "One or more users are not valid approvers",
      });
    }

    // Create approver records (skip duplicates)
    const existingApproverIds = ticket.approvers.map((a) => a.approver_id);
    const newApproverIds = body.approver_ids.filter(
      (id: number) => !existingApproverIds.includes(id),
    );

    const createdApprovers = await Promise.all(
      newApproverIds.map((approverId: number) =>
        prisma.ticketApprover.create({
          data: {
            ticket_id: body.ticket_id,
            approver_id: approverId,
            status: "pending",
          },
        }),
      ),
    );

    // Build approver names for audit log
    const approverNames = approverUsers
      .filter((u) => newApproverIds.includes(u.id))
      .map((u) => `${u.first_name} ${u.last_name} (${u.username})`)
      .join(", ");

    // Notify each approver and the requester
    await Promise.all([
      ...newApproverIds.map((approverId: number) =>
        createAndPushNotification(
          approverId,
          body.ticket_id,
          "approval_requested",
          `You have been requested to approve ticket: ${ticket.title}`,
        )
      ),
      createAndPushNotification(
        ticket.requester_id,
        body.ticket_id,
        "approval_requested",
        `Your ticket "${ticket.title}" is pending approval.`,
      )
    ]);

    // Update ticket status to pending_approval if not already
    if (ticket.status !== "pending_approval") {
      await prisma.ticket.update({
        where: { id: body.ticket_id },
        data: { status: "pending_approval" },
      });
    }

    await createAuditLog(
      body.ticket_id,
      user,
      "approvers_added",
      null,
      approverNames,
    );

    return status(201, createdApprovers);
  },
    {
      body: t.Object({
        ticket_id: t.Numeric(),
        approver_ids: t.Array(t.Numeric(), { minItems: 1 }),
      }),
      isAuth: true,
    },
  )

  // Remove an approver from a ticket
  .delete("/:id", async ({ params, query, user, roles, status }) => {
    const ticket = await prisma.ticket.findUnique({
      where: { id: query.ticket_id },
      include: { approvers: true },
    });
    if (!ticket) return status(404, { message: "Ticket not found" });

    if (!roles?.includes("admin") && !roles?.includes("mis")) {
      return status(403, { message: "Only admin/MIS can remove approvers" });
    }

    const deleted = await prisma.$transaction(async (tx) => {
      const del = await tx.ticketApprover.deleteMany({
        where: {
          id: params.id,
          ticket_id: query.ticket_id,
          status: "pending",
        },
      });

      if (del.count > 0) {
        // Check remaining pending approvers
        const remainingPending = await tx.ticketApprover.count({
          where: {
            ticket_id: query.ticket_id,
            status: "pending",
          },
        });

        // Check if any approvers remain at all
        const totalRemaining = await tx.ticketApprover.count({
          where: { ticket_id: query.ticket_id },
        });

        if (remainingPending === 0 && ticket.status === "pending_approval") {
          const newStatus = ticket.assignee_id ? "in_progress" : "open";
          await tx.ticket.update({
            where: { id: query.ticket_id },
            data: {
              status: newStatus,
              // If no approvers left at all, reset escalation flag
              ...(totalRemaining === 0 ? { escalated_to_approval: false } : {}),
            },
          });

          await tx.auditLog.create({
            data: {
              ticket_id: query.ticket_id,
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

          broadcaster.ticketUpdated(query.ticket_id, {
            field: "status",
            old_value: "pending_approval",
            new_value: newStatus,
            status: newStatus,
            updated_by: `MIS Staff #${user}`,
          });
        }
      }

      return del;
    });

    if (deleted.count === 0) {
      return status(404, {
        message: "Pending approver not found for this ticket",
      });
    }

    await createAuditLog(
      query.ticket_id,
      user,
      "approver_removed",
      null,
      params.id.toString(),
    );

    return status(204);
  },
    {
      params: t.Object({ id: t.Numeric() }),
      query: t.Object({ ticket_id: t.Numeric() }),
      isAuth: true,
    },
  )

  // Approve or reject a ticket (by approver)
  .post("/:id/decide", async ({ body, user, status }) => {
    const ticket = await prisma.ticket.findUnique({
      where: { id: body.ticket_id },
      include: { approvers: true },
    });
    if (!ticket) return status(404, { message: "Ticket not found" });

    // Find the approver record for the current user
    const approverRecord = ticket.approvers.find(
      (a) => a.approver_id === user && a.status === "pending",
    );
    if (!approverRecord) {
      return status(403, {
        message: "You are not a pending approver for this ticket",
      });
    }

    // Update the approver record
    await prisma.ticketApprover.update({
      where: { id: approverRecord.id },
      data: {
        status: body.decision as any,
        remarks: body.remarks ?? null,
        decided_at: new Date(),
      },
    });

    // Get approver name for audit
    const approverUser = await prisma.user.findUnique({
      where: { id: user },
      select: { first_name: true, last_name: true, username: true },
    });
    const approverName = approverUser
      ? `${approverUser.first_name} ${approverUser.last_name} (${approverUser.username})`
      : user.toString();

    await createAuditLog(
      body.ticket_id,
      user,
      "approval_decision",
      null,
      body.decision,
      `${approverName}: ${body.remarks || "(no remarks)"}`,
    );

    // Check if all approvers have decided
    const updatedTicket = await prisma.ticket.findUnique({
      where: { id: body.ticket_id },
      include: { approvers: true },
    });

    const allDecided = updatedTicket!.approvers.every(
      (a) => a.status !== "pending",
    );
    const allApproved = updatedTicket!.approvers.every(
      (a) => a.status === "approved",
    );
    const anyRejected = updatedTicket!.approvers.some(
      (a) => a.status === "rejected",
    );

    if (anyRejected) {
      await prisma.ticket.update({
        where: { id: body.ticket_id },
        data: { status: "rejected" },
      });

      await Promise.all([
        createAndPushNotification(
          ticket.requester_id,
          body.ticket_id,
          "approval_decided",
          `Your ticket "${ticket.title}" has been rejected.`,
        ),
        broadcaster.ticketUpdated(body.ticket_id, {
          field: 'status',
          old_value: ticket.status,
          new_value: 'rejected',
          status: 'rejected',
          updated_by: `Approver #${user}`
        })
      ]);

      return status(200, {
        message: `Ticket ${body.decision}`,
        ticket_status: "rejected",
      });
    } else if (allDecided && allApproved) {
      // Correct workflow: If approved, it should be 'open' (waiting for assignment) 
      // unless it already has an assignee (then 'in_progress' is appropriate).
      const finalStatus = ticket.assignee_id ? "in_progress" : "open";

      await prisma.ticket.update({
        where: { id: body.ticket_id },
        data: {
          status: finalStatus,
          started_at: finalStatus === "in_progress" ? new Date() : null
        },
      });

      // Notify requester and MIS for assignment
      const misUsers = await prisma.user.findMany({
        where: { roles: { some: { role: "mis" } }, is_active: true },
      });

      await Promise.all([
        createAndPushNotification(
          ticket.requester_id,
          body.ticket_id,
          "approval_decided",
          `Your ticket "${ticket.title}" has been approved.`,
        ),
        ...misUsers.map(misUser =>
          createAndPushNotification(
            misUser.id,
            body.ticket_id,
            "approval_decided",
            `Ticket "${ticket.title}" has been approved and needs assignment.`,
          )
        ),
        broadcaster.ticketUpdated(body.ticket_id, {
          field: 'status',
          old_value: ticket.status,
          new_value: finalStatus,
          status: finalStatus,
          updated_by: `Approver #${user}`
        })
      ]);

      return status(200, {
        message: `Ticket ${body.decision}`,
        ticket_status: finalStatus,
      });
    }

    // Not all approvers have decided yet
    return status(200, {
      message: `Decision recorded as ${body.decision}`,
      ticket_status: updatedTicket!.status,
      pending_approvers: updatedTicket!.approvers.filter((a) => a.status === "pending").length,
    });
  },
    {
      params: t.Object({ id: t.Numeric() }),
      body: t.Object({
        ticket_id: t.Numeric(),
        decision: t.String(),
        remarks: t.Optional(t.String()),
      }),
      isAuth: true,
    },
  )

  // Get my pending approvals
  .get("/my/pending", async ({ user, status }) => {
    const pendingApprovals = await prisma.ticketApprover.findMany({
      where: {
        approver_id: user,
        status: "pending",
      },
      include: {
        ticket: {
          include: {
            requester: { omit: { password: true } },
            request_type: true,
            affected_system: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
    });

    return status(200, pendingApprovals);
  },
    { isAuth: true },
  );
