let _app: any = null
export const registerApp = (app: any) => { _app = app }

const publish = (topic: string, type: string, payload: any) =>
  _app?.server?.publish(topic, JSON.stringify({ type, payload }))

export const broadcaster = {
  notifyUser: (userId: number, notification: any) => publish(`user:${userId}`, 'notification', notification),
  ticketUpdated: (ticketId: number, data: any) => publish(`ticket:${ticketId}`, 'ticket_updated', { ticket_id: ticketId, ...data }),
  commentAdded: (ticketId: number, comment: any) => publish(`ticket:${ticketId}`, 'comment_added', { ticket_id: ticketId, comment }),
  internalNoteAdded: (ticketId: number, comment: any) => publish(`ticket:${ticketId}:internal`, 'comment_added', { ticket_id: ticketId, comment }),
  messageSent: (receiverId: number, message: any) => publish(`user:${receiverId}`, 'message_received', message),
  messagesRead: (senderId: number, readerId: number, ticketId?: number | null) => publish(`user:${senderId}`, 'messages_read', { reader_id: readerId, ticket_id: ticketId }),
  notifyMIS: (type: string, payload: any) => publish('role:mis', type, payload),
  notifyAdmins: (type: string, payload: any) => publish('role:admin', type, payload)
}
