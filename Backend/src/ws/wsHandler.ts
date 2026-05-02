import { Elysia, t } from 'elysia'
import { validator } from '../plugins/authValidator'
import { prisma } from '../../lib/prisma'

export const wsHandler = new Elysia()
  .use(validator)
  .ws('/ws', {
    query: t.Object({
      token: t.String()
    }),

    async open(ws) {
      const token = await (ws.data as any).jwt_token.verify(ws.data.query.token)

      if (!token) return ws.close()

      const userId = Number(token.sub)
      const roles = token.roles as string[]

        // Attach metadata for lifecycle hooks
        ; (ws.data as any).userId = userId
        ; (ws.data as any).userRoles = roles

      // Standard subscriptions
      ws.subscribe(`user:${userId}`)
      roles.forEach(role => ws.subscribe(`role:${role}`))

      // Update presence/activity
      prisma.user.update({
        where: { id: userId },
        data: { last_active: new Date() }
      }).catch(() => { })

      ws.send({ type: 'connected', payload: { userId } })
    },

    async message(ws, message: any) {
      const { userId, userRoles } = ws.data as any
      if (!userId) return

      const { type, payload } = message as { type: string; payload: any }

      switch (type) {
        case 'subscribe_ticket': {
          const ticketId = Number(payload?.ticket_id)
          if (!ticketId) break

          const ticket = await prisma.ticket.findUnique({
            where: { id: ticketId },
            select: { requester_id: true, assignee_id: true, approvers: { select: { approver_id: true } } }
          })
          if (!ticket) break

          const canAccess = userRoles.includes('admin') || userRoles.includes('mis') ||
            ticket.requester_id === userId ||
            ticket.assignee_id === userId ||
            ticket.approvers.some(a => a.approver_id === userId)

          if (canAccess) {
            ws.subscribe(`ticket:${ticketId}`)

            // Subscribe staff to internal channel
            if (userRoles.includes('admin') || userRoles.includes('mis') || userRoles.includes('approver')) {
              ws.subscribe(`ticket:${ticketId}:internal`)
            }
          }
          break
        }

        case 'unsubscribe_ticket':
          if (payload?.ticket_id) ws.unsubscribe(`ticket:${payload.ticket_id}`)
          break

        case 'ping':
          ws.send({ type: 'pong', payload: Date.now() })
          break
      }
    }
  })
