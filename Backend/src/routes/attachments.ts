import { Elysia, t } from "elysia";
import { prisma } from "../../lib/prisma";
import { validator } from "../plugins/authValidator";
import { saveFile } from "../plugins/fileUpload";
import { broadcaster } from "../ws/broadcaster";
import { AttachmentType } from "../../generated/prismabox/AttachmentType";

export const attachments = new Elysia({ prefix: "/attachments" })
  .use(validator);

const UPLOAD_DIR = "./uploads";

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

  // Upload attachment(s) via multipart/form-data
  .post(
    "/",
    async ({ body, user, roles, status }) => {
      const { ticket_id, files, type } = body as any;

      if (!ticket_id) return status(400, { message: "ticket_id is required" });
      if (!files || !files.length) return status(400, { message: "At least one file is required" });

      const ticket = await checkTicketAccess(ticket_id, user, roles || []);
      if (!ticket) return status(403, { message: "Access denied" });

      const fileArray = Array.isArray(files) ? files : [files];
      const created: any[] = [];

      for (const file of fileArray) {
        if (!(file instanceof File)) continue;

        // Save file to disk
        const { fileName, fileSize, mimeType } = await saveFile(file, UPLOAD_DIR);

        // Infer type from mimeType if not provided
        let inferredType = type;
        if (!inferredType) {
          if (mimeType.startsWith("image/")) {
            inferredType = "image";
          } else if (
            mimeType.startsWith("video/")
          ) {
            inferredType = "video";
          } else if (
            mimeType === "application/pdf" ||
            mimeType.includes("msword") ||
            mimeType.includes("officedocument") ||
            mimeType.startsWith("text/")
          ) {
            inferredType = "document";
          } else {
            inferredType = "other";
          }
        }

        // Create attachment record
        const attachment = await prisma.attachment.create({
          data: {
            ticket_id,
            file_name: fileName,
            file_url: `/uploads/${fileName}`,
            file_size: fileSize,
            mime_type: mimeType,
            type: inferredType,
          },
        });

        // Audit log
        await prisma.auditLog.create({
          data: {
            ticket_id,
            performed_by_id: user,
            action: "attachment_uploaded",
            new_value: file.name,
          },
        });

        created.push(attachment);
      }

      if (created.length > 0) {
        broadcaster.ticketUpdated(ticket_id, {
          field: 'attachments',
          new_value: created.length === 1 ? created[0].file_name : `${created.length} files`,
          updated_by: `User #${user}`
        });
      }

      return status(201, created.length === 1 ? created[0] : created);
    },
    {
      body: t.Object({
        ticket_id: t.Numeric(),
        files: t.Files(),
        type: t.Optional(AttachmentType),
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
      if (!roles?.includes("admin") && !roles?.includes("mis")) {
        return status(403, { message: "Only admin/MIS can delete attachments" });
      }

      const attachment = await prisma.attachment.findUnique({
        where: { id: params.id },
      });
      if (!attachment) return status(404, { message: "Attachment not found" });

      // Delete file from disk
      try {
        const filePath = `.${attachment.file_url}`;
        await Bun.file(filePath).exists();
        await Bun.write(filePath, "");
      } catch {
        // File may not exist, continue
      }

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
