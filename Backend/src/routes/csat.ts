import { Elysia, t } from "elysia";
import { prisma } from "../../lib/prisma";
import { validator } from "../plugins/authValidator";
import { broadcaster } from "../ws/broadcaster";

export const csat = new Elysia({ prefix: "/csat" })
  .use(validator)

  // Submit CSAT for a ticket (requester only, after resolution)
  .post(
    "/",
    async ({ body, user, status }) => {
      const ticket = await prisma.ticket.findUnique({
        where: { id: body.ticket_id },
        include: { csat: true },
      });
      if (!ticket) return status(404, { message: "Ticket not found" });

      // Only the requester can submit CSAT
      if (ticket.requester_id !== user) {
        return status(403, { message: "Only the ticket requester can submit CSAT" });
      }

      // Ticket must be resolved or closed
      if (!["resolved", "closed"].includes(ticket.status)) {
        return status(400, {
          message: "CSAT can only be submitted for resolved or closed tickets",
        });
      }

      // CSAT already submitted
      if (ticket.csat) {
        return status(409, { message: "CSAT already submitted for this ticket" });
      }

      // Calculate resolution time if available
      let resolutionTimeMs: number | null = null;
      if (ticket.started_at && ticket.completed_at) {
        resolutionTimeMs = ticket.completed_at.getTime() - ticket.started_at.getTime();
      }

      const csat = await prisma.cSAT.create({
        data: {
          ticket_id: body.ticket_id,
          rating: body.rating,
          comment: body.comment ?? null,
          resolution_time_ms: resolutionTimeMs,
          agent_id: ticket.assignee_id,
        },
      });

      // Broadcast update
      broadcaster.ticketUpdated(body.ticket_id, {
        field: 'csat',
        new_value: `${body.rating}/5 stars`,
        updated_by: `Requester #${user}`
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          ticket_id: body.ticket_id,
          performed_by_id: user,
          action: "csat_submitted",
          new_value: `Rating: ${body.rating}/5`,
          notes: body.comment ?? null,
        },
      });

      return status(201, csat);
    },
    {
      body: t.Object({
        ticket_id: t.Numeric(),
        rating: t.Integer({ minimum: 1, maximum: 5 }),
        comment: t.Optional(t.String()),
      }),
      isAuth: true,
    },
  )

  // Get CSAT for a ticket
  .get(
    "/tickets/:ticketId",
    async ({ params, user, roles, status }) => {
      const ticket = await prisma.ticket.findUnique({
        where: { id: params.ticketId },
        include: {
          csat: true,
          approvers: true,
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
        roles?.includes("approver") ||
        isOwner ||
        isAssignee ||
        isApprover;

      if (!hasAccess) return status(403, { message: "Access denied" });

      if (!ticket.csat) {
        return status(404, { message: "CSAT not submitted for this ticket" });
      }

      return status(200, ticket.csat);
    },
    {
      params: t.Object({ ticketId: t.Numeric() }),
      isAuth: true,
    },
  )

  // Get CSAT stats (admin/MIS only)
  .get(
    "/stats",
    async ({ query, status }) => {
      const { agent_id, start_date, end_date, month } = query;

      const where: any = {};
      if (agent_id) where.agent_id = agent_id;
      
      if (month) {
        const [year, m] = month.split('-').map(Number);
        where.submitted_at = {
          gte: new Date(year, m - 1, 1),
          lt: new Date(year, m, 1)
        };
      } else if (start_date || end_date) {
        where.submitted_at = {};
        if (start_date) where.submitted_at.gte = new Date(start_date);
        if (end_date) where.submitted_at.lte = new Date(end_date);
      }

      const csats = await prisma.cSAT.findMany({
        where,
        include: {
          ticket: { select: { priority: true, sla_breached: true } },
          agent: { select: { first_name: true, last_name: true } },
        },
      });

      if (csats.length === 0) {
        return status(200, {
          average_rating: 0,
          total_responses: 0,
          distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          trend: [],
          agent_leaderboard: [],
          dimension_breakdown: { departments: {}, priorities: {} },
          sla_impact: { breached: 0, met: 0 },
        });
      }

      // Calculations
      const totalRating = csats.reduce((sum, c) => sum + c.rating, 0);
      const average_rating = Math.round((totalRating / csats.length) * 100) / 100;

      const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      const agentRatings: Record<number, { sum: number; count: number; name: string }> = {};
      const sla_impact = { breached: 0, met: 0 };
      const trendMap: Record<string, { sum: number; count: number }> = {};

      for (const c of csats) {
        distribution[c.rating]++;
        
        // SLA
        if (c.ticket.sla_breached) sla_impact.breached += c.rating;
        else sla_impact.met += c.rating;

        // Trend
        const dateKey = c.submitted_at.toISOString().split('T')[0];
        if (!trendMap[dateKey]) trendMap[dateKey] = { sum: 0, count: 0 };
        trendMap[dateKey].sum += c.rating;
        trendMap[dateKey].count++;

        // Leaderboard
        if (c.agent_id) {
          if (!agentRatings[c.agent_id]) agentRatings[c.agent_id] = { sum: 0, count: 0, name: `${c.agent?.first_name} ${c.agent?.last_name}` };
          agentRatings[c.agent_id].sum += c.rating;
          agentRatings[c.agent_id].count++;
        }
      }

      const trend = Object.entries(trendMap).map(([date, data]) => ({ date, average: data.sum / data.count }));
      const agent_leaderboard = Object.entries(agentRatings)
        .filter(([_, data]) => data.count >= 1)
        .map(([id, data]) => ({ agent_id: Number(id), name: data.name, average: data.sum / data.count, count: data.count }))
        .sort((a, b) => b.average - a.average)
        .slice(0, 50);

      return status(200, {
        average_rating,
        total_responses: csats.length,
        distribution,
        trend,
        agent_leaderboard,
        dimension_breakdown: { departments: {}, priorities: {} }, // Can be expanded later
        sla_impact: { 
            breached: sla_impact.breached / (csats.filter(c => c.ticket.sla_breached).length || 1), 
            met: sla_impact.met / (csats.filter(c => !c.ticket.sla_breached).length || 1) 
        },
      });
    },
    {
      query: t.Object({
        agent_id: t.Optional(t.Numeric()),
        start_date: t.Optional(t.String()),
        end_date: t.Optional(t.String()),
        month: t.Optional(t.String()),
      }),
      hasRole: ["admin", "mis"],
    },
  )

  // Get detailed agent report (admin/MIS only)
  .get(
    "/reports/:agentId",
    async ({ params, query, status }) => {
      const agentId = params.agentId;
      const { month } = query;

      const agent = await prisma.user.findUnique({
        where: { id: agentId },
        omit: { password: true },
        include: { department: true, roles: true },
      });

      if (!agent) return status(404, { message: "Agent not found" });

      const where: any = { agent_id: agentId };
      let dateFilter: any = null;

      if (month) {
        const [year, m] = month.split('-').map(Number);
        dateFilter = {
          gte: new Date(year, m - 1, 1),
          lt: new Date(year, m, 1)
        };
        where.submitted_at = dateFilter;
      }

      // Fetch all CSATs for this agent
      const csats = await prisma.cSAT.findMany({
        where,
        include: {
          ticket: {
            select: {
              id: true,
              title: true,
              priority: true,
              status: true,
              created_at: true,
              started_at: true,
              completed_at: true,
              due_date: true,
              sla_breached: true,
            },
          },
        },
        orderBy: { submitted_at: "desc" },
      });

      // Fetch all tickets assigned to this agent (for overall volume stats)
      const totalAssigned = await prisma.ticket.count({
        where: { 
          assignee_id: agentId,
          ...(dateFilter ? {
            created_at: dateFilter
          } : {})
        },
      });

      const totalResolved = await prisma.ticket.count({
        where: {
          assignee_id: agentId,
          status: { in: ["resolved", "closed"] },
          ...(dateFilter ? {
            completed_at: dateFilter
          } : {})
        },
      });

      const totalSlaMet = await prisma.ticket.count({
        where: {
          assignee_id: agentId,
          status: { in: ["resolved", "closed"] },
          sla_breached: false,
          ...(dateFilter ? {
            completed_at: dateFilter
          } : {})
        }
      });

      // Stats calculations
      const totalResponses = csats.length;
      const avgRating = totalResponses > 0
        ? Math.round((csats.reduce((sum, c) => sum + c.rating, 0) / totalResponses) * 100) / 100
        : 0;

      const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      const priorityBreakdown: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
      let totalResolutionTimeMs = 0;
      let resolvedWithTimeCount = 0;

      for (const c of csats) {
        distribution[c.rating]++;
        const p = c.ticket.priority as string;
        priorityBreakdown[p] = (priorityBreakdown[p] || 0) + 1;
        
        if (c.resolution_time_ms) {
          totalResolutionTimeMs += Number(c.resolution_time_ms);
          resolvedWithTimeCount++;
        }
      }

      const avgResolutionTimeMs = resolvedWithTimeCount > 0 
        ? Math.round(totalResolutionTimeMs / resolvedWithTimeCount) 
        : 0;
      
      const slaComplianceRate = totalResolved > 0 
        ? Math.round((totalSlaMet / totalResolved) * 100) 
        : 0;

      return status(200, {
        agent,
        summary: {
          average_rating: avgRating,
          total_responses: totalResponses,
          total_assigned_tickets: totalAssigned,
          total_resolved_tickets: totalResolved,
          sla_compliance_rate: slaComplianceRate,
          avg_resolution_time_ms: avgResolutionTimeMs,
        },
        distribution,
        priority_breakdown: priorityBreakdown,
        recent_feedback: csats.slice(0, 50).map(c => ({
          id: c.id,
          rating: c.rating,
          comment: c.comment,
          submitted_at: c.submitted_at,
          ticket: {
            id: c.ticket.id,
            title: c.ticket.title,
            priority: c.ticket.priority,
            sla_breached: c.ticket.sla_breached
          }
        })),
      });
    },
    {
      params: t.Object({ agentId: t.Numeric() }),
      query: t.Object({
        month: t.Optional(t.String())
      }),
      hasRole: ["admin", "mis"],
    },
  )

  // Get my CSAT (as agent)
  .get(
    "/my/agent",
    async ({ user, query, status }) => {
      const { page = 1, limit = 20 } = query;
      const skip = (page - 1) * limit;

      const data = await prisma.cSAT.findMany({
        where: { agent_id: user },
        include: {
          ticket: {
            select: { id: true, title: true, status: true },
          },
        },
        orderBy: { submitted_at: "desc" },
        skip,
        take: limit,
      });
      const total = await prisma.cSAT.count({ where: { agent_id: user } });

      return status(200, {
        data,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    },
    {
      query: t.Object({
        page: t.Optional(t.Numeric({ minimum: 1 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
      }),
      isAuth: true,
    },
  );
