import { Elysia, t } from "elysia";
import { prisma } from "../../lib/prisma";
import { validator } from "../plugins/authValidator";

export const attachments = new Elysia({ prefix: "/attachments" })
  .use(validator);

/**
 * Check if user has access to a ticket
 */
async function checkTicketAccess(
  ticketId: number,
  userId: number,
  roles: string[],
) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { approvers: true },
  });
  if (!ticket) return null;

  const isOwner = ticket.requester_id === userId;
  const isAssignee = ticket.assignee_id === userId;
  const isApprover = ticket.approvers.some((a) => a.approver_id === userId);
  const hasAccess =
    roles.includes("admin") ||
    roles.includes("mis") ||
    isOwner ||
    isAssignee ||
    isApprover;

  return hasAccess ? ticket : null;
}

attachments
  // List attachments for a ticket
  .get(
    "/",
    async ({ query, user, roles, status }) => {
      const ticket = await checkTicketAccess(query.ticket_id, user, roles || []);
      if (!ticket) return status(403, { message: "Access denied" });

      const items = await prisma.attachment.findMany({
        where: { ticket_id: query.ticket_id },
        orderBy: { uploaded_at: "desc" },
      });
      return status(200, items);
    },
    {
      query: t.Object({ ticket_id: t.Numeric() }),
      isAuth: true,
    },
  )

  // Upload attachment
  .post(
    "/",
    async ({ body, user, roles, status }) => {
      const ticket = await checkTicketAccess(body.ticket_id, user, roles || []);
      if (!ticket) return status(403, { message: "Access denied" });

      const attachment = await prisma.attachment.create({
        data: {
          ticket_id: body.ticket_id,
          file_name: body.file_name,
          file_url: body.file_url,
          file_size: body.file_size ?? null,
          mime_type: body.mime_type ?? null,
          type: body.type ?? "other",
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          ticket_id: body.ticket_id,
          performed_by_id: user,
          action: "attachment_uploaded",
          new_value: body.file_name,
        },
      });

      return status(201, attachment);
    },
    {
      body: t.Object({
        ticket_id: t.Numeric(),
        file_name: t.String(),
        file_url: t.String(),
        file_size: t.Optional(t.Numeric()),
        mime_type: t.Optional(t.String()),
        type: t.Optional(t.String()),
      }),
      isAuth: true,
    },
  )

  // Get single attachment
  .get(
    "/:id",
    async ({ params, user, roles, status }) => {
      const attachment = await prisma.attachment.findUnique({
        where: { id: params.id },
      });
      if (!attachment) return status(404, { message: "Attachment not found" });

      const ticket = await checkTicketAccess(attachment.ticket_id, user, roles || []);
      if (!ticket) return status(403, { message: "Access denied" });

      return status(200, attachment);
    },
    {
      params: t.Object({ id: t.Numeric() }),
      isAuth: true,
    },
  )

  // Delete attachment
  .delete(
    "/:id",
    async ({ params, user, roles, status }) => {
      // Only admin/MIS can delete attachments
      if (!roles?.includes("admin") && !roles?.includes("mis")) {
        return status(403, { message: "Only admin/MIS can delete attachments" });
      }

      const attachment = await prisma.attachment.findUnique({
        where: { id: params.id },
      });
      if (!attachment) return status(404, { message: "Attachment not found" });

      await prisma.auditLog.create({
        data: {
          ticket_id: attachment.ticket_id,
          performed_by_id: user,
          action: "attachment_deleted",
          old_value: attachment.file_name,
        },
      });

      await prisma.attachment.delete({ where: { id: params.id } });
      return status(204);
    },
    {
      params: t.Object({ id: t.Numeric() }),
      isAuth: true,
    },
  );
