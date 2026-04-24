import { Elysia, t } from "elysia";
import { prisma } from "../../lib/prisma";
import { validator } from "../plugins/authValidator";
import { createAndPushNotification } from "./notifications";
import { broadcaster } from "../ws/broadcaster";

export const comments = new Elysia({ prefix: "/comments" })
  .use(validator);

/**
 * Check if user has access to a ticket and return their role level
 */
async function checkTicketAccess(ticketId: number, userId: number, roles: string[]) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { approvers: true },
  });
  if (!ticket) return null;

  const isOwner = ticket.requester_id === userId;
  const isAssignee = ticket.assignee_id === userId;
  const isApprover = ticket.approvers.some((a) => a.approver_id === userId);
  const isStaff =
    roles?.includes("admin") ||
    roles?.includes("mis") ||
    roles?.includes("approver");

  return {
    ticket,
    canView: isStaff || isOwner || isAssignee || isApprover,
    canSeeInternal: isStaff,
    canWrite: isStaff || isOwner || isAssignee || isApprover,
  };
}

comments
  // List comments for a ticket
  .get(
    "/",
    async ({ query, user, roles, status }) => {
      const access = await checkTicketAccess(query.ticket_id, user, roles || []);
      if (!access || !access.canView) return status(403, { message: "Access denied" });

      const where: any = { ticket_id: query.ticket_id };
      // Requesters can't see internal notes
      if (!access.canSeeInternal) {
        where.is_internal = false;
      }

      const items = await prisma.ticketComment.findMany({
        where,
        include: {
          user: {
            select: { id: true, first_name: true, last_name: true, username: true },
          },
        },
        orderBy: { created_at: "asc" },
      });

      return status(200, items);
    },
    {
      query: t.Object({ ticket_id: t.Numeric() }),
      isAuth: true,
    },
  )

  // Add a comment
  .post(
    "/",
    async ({ body, user, roles, status }) => {
      const access = await checkTicketAccess(body.ticket_id, user, roles || []);
      if (!access || !access.canWrite) return status(403, { message: "Access denied" });

      // Only staff can post internal notes
      if (body.is_internal && !access.canSeeInternal) {
        return status(403, { message: "Only staff can post internal notes" });
      }

      const comment = await prisma.ticketComment.create({
        data: {
          ticket_id: body.ticket_id,
          user_id: user,
          content: body.content,
          is_internal: body.is_internal ?? false,
        },
        include: {
          user: {
            select: { id: true, first_name: true, last_name: true, username: true },
          },
        },
      });

      // Notify ticket participants (not the commenter)
      const ticket = access.ticket;
      const notifyUserIds = new Set<number>();
      notifyUserIds.add(ticket.requester_id);
      if (ticket.assignee_id) notifyUserIds.add(ticket.assignee_id);
      for (const a of ticket.approvers) notifyUserIds.add(a.approver_id);
      notifyUserIds.delete(user); // Don't notify the commenter

      // Parallelize all notifications and broadcasts
      await Promise.all([
        ...Array.from(notifyUserIds).map(notifyId => {
          // Don't notify requesters about internal notes
          if (comment.is_internal && notifyId === ticket.requester_id) return Promise.resolve();

          return createAndPushNotification(
            notifyId,
            body.ticket_id,
            "comment_added",
            `New ${comment.is_internal ? "internal note" : "comment"} on ticket: ${ticket.title}`,
          );
        }),
        // Push to ticket channel
        broadcaster[comment.is_internal ? 'internalNoteAdded' : 'commentAdded'](body.ticket_id, {
          id: comment.id,
          content: comment.content,
          is_internal: comment.is_internal,
          user: comment.user,
          created_at: comment.created_at
        })
      ]);

      // Audit log
      await prisma.auditLog.create({
        data: {
          ticket_id: body.ticket_id,
          performed_by_id: user,
          action: "comment_added",
          old_value: comment.is_internal ? "internal" : "public",
          new_value: comment.content.slice(0, 200),
        },
      });

      return status(201, comment);
    },
    {
      body: t.Object({
        ticket_id: t.Numeric(),
        content: t.String({ minLength: 1 }),
        is_internal: t.Optional(t.Boolean()),
      }),
      isAuth: true,
    },
  )

  // Get single comment
  .get(
    "/:id",
    async ({ params, user, roles, status }) => {
      const comment = await prisma.ticketComment.findUnique({
        where: { id: params.id },
        include: {
          user: {
            select: { id: true, first_name: true, last_name: true, username: true },
          },
        },
      });
      if (!comment) return status(404, { message: "Comment not found" });

      const access = await checkTicketAccess(comment.ticket_id, user, roles || []);
      if (!access || !access.canView) return status(403, { message: "Access denied" });

      // Requesters can't see internal notes
      if (comment.is_internal && !access.canSeeInternal) {
        return status(404, { message: "Comment not found" });
      }

      return status(200, comment);
    },
    {
      params: t.Object({ id: t.Numeric() }),
      isAuth: true,
    },
  )

  // Update comment (author only)
  .put(
    "/:id",
    async ({ params, body, user, status }) => {
      const comment = await prisma.ticketComment.findUnique({
        where: { id: params.id },
      });
      if (!comment) return status(404, { message: "Comment not found" });
      if (comment.user_id !== user) return status(403, { message: "You can only edit your own comments" });

      const updated = await prisma.ticketComment.update({
        where: { id: params.id },
        data: {
          content: body.content ?? comment.content,
          is_internal: body.is_internal ?? comment.is_internal,
        },
        include: {
          user: {
            select: { id: true, first_name: true, last_name: true, username: true },
          },
        },
      });

      return status(200, updated);
    },
    {
      params: t.Object({ id: t.Numeric() }),
      body: t.Object({
        content: t.Optional(t.String({ minLength: 1 })),
        is_internal: t.Optional(t.Boolean()),
      }),
      isAuth: true,
    },
  )

  // Delete comment (author or admin/MIS)
  .delete(
    "/:id",
    async ({ params, user, roles, status }) => {
      const comment = await prisma.ticketComment.findUnique({
        where: { id: params.id },
      });
      if (!comment) return status(404, { message: "Comment not found" });

      const isAuthor = comment.user_id === user;
      const isAdmin = roles?.includes("admin") || roles?.includes("mis");
      if (!isAuthor && !isAdmin) return status(403, { message: "You can only delete your own comments" });

      await prisma.auditLog.create({
        data: {
          ticket_id: comment.ticket_id,
          performed_by_id: user,
          action: "comment_deleted",
          old_value: comment.content.slice(0, 200),
        },
      });

      await prisma.ticketComment.delete({ where: { id: params.id } });
      return status(204);
    },
    {
      params: t.Object({ id: t.Numeric() }),
      isAuth: true,
    },
  );
