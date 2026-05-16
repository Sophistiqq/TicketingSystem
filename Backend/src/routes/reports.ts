import { Elysia, t } from "elysia";
import { prisma } from "../../lib/prisma";
import { validator } from "../plugins/authValidator";

export const reports = new Elysia({ prefix: "/reports" })
  .use(validator)
  .get("/tickets", async ({ query, roles }) => {
    // Only Admin and MIS can access reports
    if (!roles?.includes("admin") && !roles?.includes("mis")) {
      return { status: 403, message: "Forbidden: Unauthorized access to reports" };
    }

    const {
      date_from,
      date_to,
      status,
      priority,
      department_id,
      request_type_id,
      assignee_id,
      requester_id,
    } = query;

    const where: any = {};

    // Date range filter
    if (date_from || date_to) {
      where.created_at = {};
      if (date_from) where.created_at.gte = new Date(date_from);
      if (date_to) where.created_at.lte = new Date(date_to);
    }

    // Direct match filters
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (department_id) where.department_id = Number(department_id);
    if (request_type_id) where.request_type_id = Number(request_type_id);
    if (assignee_id) where.assignee_id = Number(assignee_id);
    if (requester_id) where.requester_id = Number(requester_id);

    // Fetch tickets with all related data
    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        requester: { select: { id: true, first_name: true, last_name: true, username: true, department: true } },
        assignee: { select: { id: true, first_name: true, last_name: true, username: true } },
        department: true,
        request_type: true,
        affected_system: true,
        csat: true,
      },
      orderBy: { created_at: "desc" },
    });

    // Calculate aggregate stats for the report
    const total = tickets.length;
    const resolvedTickets = tickets.filter(t => t.status === "resolved" || t.status === "closed");
    const slaBreached = tickets.filter(t => t.sla_breached).length;

    let totalResolutionTime = 0;
    resolvedTickets.forEach(t => {
      if (t.started_at && t.completed_at) {
        totalResolutionTime += (t.completed_at.getTime() - t.started_at.getTime());
      }
    });

    const avgResolutionTime = resolvedTickets.length > 0 
      ? Math.round(totalResolutionTime / resolvedTickets.length) 
      : 0;

    const avgCsatRating = resolvedTickets.length > 0
      ? tickets.filter(t => t.csat).reduce((sum, t) => sum + (t.csat?.rating || 0), 0) / (tickets.filter(t => t.csat).length || 1)
      : 0;

    return {
      tickets,
      summary: {
        total,
        resolved: resolvedTickets.length,
        sla_breached: slaBreached,
        sla_compliance_rate: total > 0 ? Math.round(((total - slaBreached) / total) * 100) : 100,
        avg_resolution_time_ms: avgResolutionTime,
        avg_csat_rating: Math.round(avgCsatRating * 100) / 100,
      }
    };
  }, {
    query: t.Object({
      date_from: t.Optional(t.String()),
      date_to: t.Optional(t.String()),
      status: t.Optional(t.String()),
      priority: t.Optional(t.String()),
      department_id: t.Optional(t.String()),
      request_type_id: t.Optional(t.String()),
      assignee_id: t.Optional(t.String()),
      requester_id: t.Optional(t.String()),
    }),
    isAuth: true,
  });
