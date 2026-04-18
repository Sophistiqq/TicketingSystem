import { Elysia, t } from "elysia";
import { prisma } from "../../lib/prisma";
import { validator } from "../plugins/authValidator";

export const messages = new Elysia({ prefix: "/messages" })
  .use(validator)

  // Get users who were active in the last 15 minutes
  .get(
    "/active",
    async ({ status }) => {
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
      const activeUsers = await prisma.user.findMany({
        where: {
          last_active: { gte: fifteenMinutesAgo },
          is_active: true,
        },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          username: true,
          position: true,
          last_active: true,
        },
        orderBy: { last_active: "desc" },
      });
      return status(200, activeUsers);
    },
    { isAuth: true }
  )

  // Search users to message
  .get(
    "/search-contacts",
    async ({ query, status }) => {
      const { q } = query;
      if (!q || q.length < 2) return status(200, []);

      const users = await prisma.user.findMany({
        where: {
          AND: [
            { is_active: true },
            {
              OR: [
                { first_name: { contains: q, mode: 'insensitive' } },
                { last_name: { contains: q, mode: 'insensitive' } },
                { username: { contains: q, mode: 'insensitive' } },
              ]
            }
          ]
        },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          username: true,
          position: true,
          last_active: true,
        },
        take: 10,
      });
      return status(200, users);
    },
    {
      query: t.Object({ q: t.String() }),
      isAuth: true
    }
  )

  // Get total unread messages count
  .get(
    "/unread-count",
    async ({ user }) => {
      const count = await prisma.message.count({
        where: {
          receiver_id: user,
          is_read: false,
        },
      });
      return { count };
    },
    { isAuth: true }
  )

  // Get info for a specific contact (allowed for all authenticated users)
  .get(
    "/contact/:id",
    async ({ params, status }) => {
      const contact = await prisma.user.findUnique({
        where: { id: params.id, is_active: true },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          username: true,
          position: true,
          last_active: true,
        },
      });
      if (!contact) return status(404, { message: "Contact not found" });
      return status(200, contact);
    },
    {
      params: t.Object({ id: t.Numeric() }),
      isAuth: true
    }
  )

  // Get recent conversations (contacts)
  .get(
    "/conversations",
    async ({ user, status }) => {
      // Find all unique user IDs we've exchanged messages with
      const messages = await prisma.message.findMany({
        where: {
          OR: [
            { sender_id: user },
            { receiver_id: user },
          ]
        },
        select: {
          sender_id: true,
          receiver_id: true,
        },
      });

      const contactIds = Array.from(new Set(
        messages.flatMap(m => [m.sender_id, m.receiver_id])
          .filter(id => id !== user)
      ));

      if (contactIds.length === 0) return status(200, []);

      const contacts = await prisma.user.findMany({
        where: { id: { in: contactIds } },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          username: true,
          last_active: true,
          roles: { select: { role: true } },
        },
      });

      // For each contact, get the last message
      const results = await Promise.all(contacts.map(async (contact) => {
        const lastMsg = await prisma.message.findFirst({
          where: {
            OR: [
              { sender_id: user, receiver_id: contact.id },
              { sender_id: contact.id, receiver_id: user },
            ]
          },
          orderBy: { created_at: 'desc' },
          include: { ticket: { select: { title: true } } }
        });
        return {
          ...contact,
          last_message: lastMsg
        };
      }));

      // Sort by last message date
      results.sort((a, b) => {
        const dateA = a.last_message?.created_at.getTime() ?? 0;
        const dateB = b.last_message?.created_at.getTime() ?? 0;
        return dateB - dateA;
      });

      return status(200, results);
    },
    { isAuth: true }
  )

  // Get messages with a specific user
  .get(
    "/:contactId",
    async ({ params, user, status }) => {
      const messages = await prisma.message.findMany({
        where: {
          OR: [
            { sender_id: user, receiver_id: params.contactId },
            { sender_id: params.contactId, receiver_id: user },
          ]
        },
        orderBy: { created_at: "asc" },
        include: {
          sender: { select: { id: true, first_name: true, last_name: true } },
          ticket: { select: { id: true, title: true, status: true } }
        }
      });

      // Mark unread messages as read
      await prisma.message.updateMany({
        where: {
          sender_id: params.contactId,
          receiver_id: user,
          is_read: false,
        },
        data: { is_read: true }
      });

      return status(200, messages);
    },
    {
      params: t.Object({ contactId: t.Numeric() }),
      isAuth: true
    }
  )

  // Send a message
  .post(
    "/",
    async ({ body, user, status }) => {
      const message = await prisma.message.create({
        data: {
          content: body.content,
          receiver_id: body.receiver_id,
          sender_id: user,
          ticket_id: body.ticket_id,
        },
        include: {
          sender: { select: { id: true, first_name: true, last_name: true } },
          ticket: { select: { id: true, title: true } }
        }
      });
      return status(201, message);
    },
    {
      body: t.Object({
        content: t.String(),
        receiver_id: t.Integer(),
        ticket_id: t.Optional(t.Integer()),
      }),
      isAuth: true
    }
  );
