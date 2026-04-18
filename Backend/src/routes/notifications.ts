import { Elysia, t } from "elysia";
import { prisma } from "../../lib/prisma";
import { validator } from "../plugins/authValidator";

export const notifications = new Elysia({ prefix: "/notifications" })
  .use(validator)

  // Get my notifications
  .get(
    "/",
    async ({ user, roles, query, status }) => {
      const { unread_only, page = 1, limit = 50 } = query;

            const where: any = { user_id: user };
      
      // Approvers should not see comment notifications (only important/relevant items)
      if (roles?.includes("approver")) {
        where.type = { not: "comment_added" };
      }
      if (unread_only === "true") {
        where.is_read = false;
      }

      const skip = (page - 1) * limit;

      const [data, total] = await Promise.all([
        prisma.notification.findMany({
          where,
          include: {
            ticket: {
              select: { id: true, title: true, status: true },
            },
          },
          orderBy: { created_at: "desc" },
          skip,
          take: limit,
        }),
        prisma.notification.count({ where }),
      ]);

      return status(200, {
        data,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    },
    {
      query: t.Object({
        unread_only: t.Optional(t.String()),
        page: t.Optional(t.Numeric({ minimum: 1 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
      }),
      isAuth: true,
    },
  )

  // Get unread count
  .get(
    "/unread-count",
    async ({ user, roles, status }) => {
      const where: any = { user_id: user, is_read: false };
      
      if (roles?.includes("approver")) {
        where.type = { not: "comment_added" };
      }

      const count = await prisma.notification.count({ where });
      return status(200, { count });
    },
    { isAuth: true },
  )

  // Mark notification as read
  .put(
    "/:id/read",
    async ({ params, user, status }) => {
      const notification = await prisma.notification.findFirst({
        where: { id: params.id, user_id: user },
      });
      if (!notification) return status(404, { message: "Notification not found" });

      await prisma.notification.update({
        where: { id: params.id },
        data: { is_read: true, read_at: new Date() },
      });

      return status(204);
    },
    {
      params: t.Object({ id: t.Numeric() }),
      isAuth: true,
    },
  )

  // Mark all notifications as read
  .put(
    "/read-all",
    async ({ user, status }) => {
      await prisma.notification.updateMany({
        where: { user_id: user, is_read: false },
        data: { is_read: true, read_at: new Date() },
      });

      return status(204);
    },
    { isAuth: true },
  )

  // Delete a notification
  .delete(
    "/:id",
    async ({ params, user, status }) => {
      const notification = await prisma.notification.findFirst({
        where: { id: params.id, user_id: user },
      });
      if (!notification) return status(404, { message: "Notification not found" });

      await prisma.notification.delete({ where: { id: params.id } });
      return status(204);
    },
    {
      params: t.Object({ id: t.Numeric() }),
      isAuth: true,
    },
  );
