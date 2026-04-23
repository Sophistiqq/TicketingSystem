import { Elysia, t } from "elysia";
import { prisma } from "../../lib/prisma";
import { validator } from "../plugins/authValidator";
import { broadcaster } from "../ws/broadcaster";
import webpush from "web-push";

export async function createAndPushNotification(
  userId: number,
  ticketId: number | null,
  type: string,
  message: string,
  tx?: any
) {
  const db = tx || prisma;
  
  // Fetch fresh env vars every time to avoid module-load timing issues
  const publicVapidKey = process.env.VAPID_PUBLIC_KEY || "";
  const privateVapidKey = process.env.VAPID_PRIVATE_KEY || "";
  const contactEmail = process.env.VAPID_CONTACT || "";

  const notification = await db.notification.create({
    data: {
      user_id: userId,
      ticket_id: ticketId,
      type: type as any,
      message,
    },
  });

  // 1. Push live via WebSocket
  broadcaster.notifyUser(userId, {
    id: notification.id,
    type: notification.type,
    message: notification.message,
    ticket_id: notification.ticket_id,
  });

  // 2. Push via Web Push API
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { user_id: userId },
  });

  if (subscriptions.length === 0) {
    console.log(`[PUSH] No push subscriptions found for user ${userId}`);
    return notification;
  }

  console.log(`[PUSH] Found ${subscriptions.length} subscriptions for user ${userId}`);

  if (!publicVapidKey || !privateVapidKey || !contactEmail) {
    console.error("[PUSH] CRITICAL: VAPID configuration is incomplete in environment!");
    console.error(`[PUSH] Status: Public=${!!publicVapidKey}, Private=${!!privateVapidKey}, Contact=${!!contactEmail}`);
    return notification;
  }

  const payload = JSON.stringify({
    title: "New Notification",
    body: message,
    url: ticketId ? `/tickets/${ticketId}` : "/notifications",
    type,
  });

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        },
        payload,
        {
          vapidDetails: {
            subject: contactEmail,
            publicKey: publicVapidKey,
            privateKey: privateVapidKey,
          },
        }
      );
      console.log(`[PUSH] Successfully sent to endpoint: ${sub.endpoint.substring(0, 40)}...`);
    } catch (error: any) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        console.log(`[PUSH] Subscription expired/invalid for user ${userId}, removing...`);
        await prisma.pushSubscription.delete({
          where: { id: sub.id },
        });
      } else {
        console.error(`[PUSH] WebPush Error (Status ${error.statusCode}):`, error.body || error.message);
      }
    }
  }

  return notification;
}

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

      const data = await prisma.notification.findMany({
        where,
        include: {
          ticket: {
            select: { id: true, title: true, status: true },
          },
        },
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      });
      const total = await prisma.notification.count({ where });

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
    }
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
    { isAuth: true }
  )

  // Get public VAPID key for push subscription
  .get("/vapid-public-key", () => {
    return { publicKey: process.env.VAPID_PUBLIC_KEY };
  })

  // Send a test push notification
  .post(
    "/test-push",
    async ({ user, status }) => {
      console.log(`[PUSH] Triggering test push for user ${user}`);
      await createAndPushNotification(
        user,
        null,
        "escalated",
        "This is a test push notification! 🚀"
      );
      return status(200, { message: "Test push sent" });
    },
    { isAuth: true }
  )

  // Subscribe to push notifications
  .post(
    "/push-subscribe",
    async ({ body, user, status }) => {
      const { endpoint, keys } = body;

      await prisma.pushSubscription.upsert({
        where: { endpoint },
        update: {
          user_id: user,
          p256dh: keys.p256dh,
          auth: keys.auth,
        },
        create: {
          user_id: user,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
        },
      });

      return status(201, { message: "Subscribed successfully" });
    },
    {
      body: t.Object({
        endpoint: t.String(),
        keys: t.Object({
          p256dh: t.String(),
          auth: t.String(),
        }),
      }),
      isAuth: true,
    }
  )

  // Mark notification as read
  .put(
    "/:id/read",
    async ({ params, user, status }) => {
      const notification = await prisma.notification.findFirst({
        where: { id: params.id, user_id: user },
      });
      if (!notification)
        return status(404, { message: "Notification not found" });

      await prisma.notification.update({
        where: { id: params.id },
        data: { is_read: true, read_at: new Date() },
      });

      return status(204);
    },
    {
      params: t.Object({ id: t.Numeric() }),
      isAuth: true,
    }
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
    { isAuth: true }
  )

  // Delete a notification
  .delete(
    "/:id",
    async ({ params, user, status }) => {
      const notification = await prisma.notification.findFirst({
        where: { id: params.id, user_id: user },
      });
      if (!notification)
        return status(404, { message: "Notification not found" });

      await prisma.notification.delete({ where: { id: params.id } });
      return status(204);
    },
    {
      params: t.Object({ id: t.Numeric() }),
      isAuth: true,
    }
  );
