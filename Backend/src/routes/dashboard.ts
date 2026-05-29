import { Elysia, t } from "elysia";
import { prisma } from "../../lib/prisma";
import { validator } from "../plugins/authValidator";
import { Prisma } from "../../generated/prisma/client";

export const dashboard = new Elysia({ prefix: "/dashboard" })
  .use(validator)
  .get("/summary", async ({ query, user, roles }) => {
    const {
      department_id,
      sort = "created_at",
      order = "desc",
    } = query;

    const isAdminOrMis = roles?.includes("admin") || roles?.includes("mis");
    const isApprover = roles?.includes("approver") || roles?.includes("admin");

    // Dynamic SQL conditions
    const conditions: Prisma.Sql[] = [];
    if (department_id) {
      conditions.push(Prisma.sql`department_id = ${department_id}`);
    }
    if (!isAdminOrMis && !isApprover) {
      conditions.push(Prisma.sql`requester_id = ${user}`);
    }
    const whereClause = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.empty;

    // 1. Analytics & Stats - HYPER-CONSOLIDATED RAW SQL (2 RTTs for all numbers)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();
    const nowStr = new Date().toISOString();

    // MEGA STATS: Everything numerical in ONE trip
    const megaStatsQuery = prisma.$queryRaw<any[]>`
      SELECT 'counts' as grp, 'all' as name, 
        COUNT(*) as val1,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as val2,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as val3,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as val4,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as val5,
        SUM(CASE WHEN due_date <= ${nowStr} AND status NOT IN ('resolved', 'closed') THEN 1 ELSE 0 END) as val6,
        (SELECT COUNT(*) FROM Ticket WHERE assignee_id = ${user} AND status NOT IN ('resolved', 'closed')) as val7,
        (SELECT COUNT(*) FROM Ticket WHERE department_id = (SELECT department_id FROM User WHERE id = ${user}) AND status = 'open' AND assignee_id IS NULL) as val8,
        (SELECT COUNT(*) FROM TicketApprover WHERE approver_id = ${user} AND status = 'pending') as val9,
        (SELECT COUNT(*) FROM Ticket WHERE requester_id = ${user} AND status IN ('resolved', 'closed') AND id NOT IN (SELECT ticket_id FROM CSAT)) as val10
      FROM Ticket
      ${whereClause}

      UNION ALL

      SELECT 'priority' as grp, priority as name, count(*) as val1, 0, 0, 0, 0, 0, 0, 0, 0, 0
      FROM Ticket
      ${whereClause}
      GROUP BY priority

      UNION ALL

      SELECT 'type' as grp, (SELECT name FROM RequestType WHERE id = request_type_id) as name, count(*) as val1, 0, 0, 0, 0, 0, 0, 0, 0, 0
      FROM Ticket
      ${whereClause}
      GROUP BY request_type_id
    `;

    // MEGA TRENDS: Created + Resolved in one scan
    const megaTrendsQuery = prisma.$queryRaw<any[]>`
      SELECT 'created' as grp, strftime('%Y-%m-%d', created_at) as name, count(*) as val1
      FROM Ticket
      ${whereClause}
      ${conditions.length > 0 ? Prisma.sql`AND` : Prisma.sql`WHERE`} created_at >= ${thirtyDaysAgoStr}
      GROUP BY name

      UNION ALL

      SELECT 'resolved' as grp, strftime('%Y-%m-%d', completed_at) as name, count(*) as val1
      FROM Ticket
      ${whereClause}
      ${conditions.length > 0 ? Prisma.sql`AND` : Prisma.sql`WHERE`} completed_at >= ${thirtyDaysAgoStr}
      AND status IN ('resolved', 'closed')
      GROUP BY name
    `;

    // 2. Specialized lists (Prisma handles these well)
    const listWhere: any = department_id ? { department_id } : {};
    if (!isAdminOrMis && !roles?.includes("approver")) {
        listWhere.requester_id = user;
    }

    const recentTicketsQuery = prisma.ticket.findMany({
      where: listWhere,
      include: {
        requester: { select: { id: true, first_name: true, last_name: true, username: true } },
        assignee: { select: { id: true, first_name: true, last_name: true, username: true } },
        request_type: { select: { id: true, name: true } },
        affected_system: { select: { id: true, name: true } },
        _count: { select: { attachments: true, resolution_attempts: true } },
      },
      orderBy: { [sort]: order },
      take: 8,
    });

    const unratedTicketsQuery = prisma.ticket.findMany({
      where: {
        requester_id: user,
        status: { in: ["resolved", "closed"] },
        csat: { is: null },
      },
      include: {
        assignee: { select: { id: true, first_name: true, last_name: true, username: true } },
        department: { select: { id: true, name: true } },
      },
      orderBy: { completed_at: "desc" },
      take: 3,
    });

    const activeUsersQuery = prisma.user.findMany({
      where: {
        last_active: { gte: new Date(Date.now() - 5 * 60 * 1000) },
        is_active: true,
      },
      select: { id: true, first_name: true, last_name: true, username: true, position: true, last_active: true },
      orderBy: { last_active: "desc" },
      take: 10,
    });

    // 3. Conditional lists
    let pendingApprovalsQuery = Promise.resolve([]);
    if (isApprover) {
      pendingApprovalsQuery = prisma.ticketApprover.findMany({
        where: { approver_id: user, status: "pending" },
        include: {
          ticket: {
            include: {
              requester: { select: { id: true, first_name: true, last_name: true, username: true } },
              request_type: { select: { id: true, name: true } },
              affected_system: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { created_at: "desc" },
        take: 5,
      }) as any;
    }

    // 4. Execute everything in parallel (Max parallelism, minimal RTTs)
    const [
      recentTickets,
      unratedTickets,
      activeUsers,
      pendingApprovals,
      megaStats,
      megaTrends,
    ] = await Promise.all([
      recentTicketsQuery,
      unratedTicketsQuery,
      activeUsersQuery,
      pendingApprovalsQuery,
      megaStatsQuery,
      megaTrendsQuery,
    ]);

    // 5. Post-processing (Fast, CPU-bound)
    const countsRow = megaStats.find(r => r.grp === 'counts') || {};
    const formattedActiveUsers = (activeUsers as any[]).filter(u => u.id !== user);

    // Process trends
    const trendsMap: Record<string, { new: number, resolved: number }> = {};
    for (let i = 0; i <= 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      trendsMap[d.toISOString().split('T')[0]] = { new: 0, resolved: 0 };
    }

    megaTrends.forEach(t => {
      if (t.grp === 'created' && trendsMap[t.name]) trendsMap[t.name].new = Number(t.val1 || 0);
      if (t.grp === 'resolved' && trendsMap[t.name]) trendsMap[t.name].resolved = Number(t.val1 || 0);
    });

    const trendsList = Object.entries(trendsMap)
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Process distribution
    const byTypeList = megaStats.filter(d => d.grp === 'type').map(d => ({
      name: d.name || "Uncategorized",
      count: Number(d.val1 || 0)
    }));

    const byPriorityList = megaStats.filter(d => d.grp === 'priority').map(d => ({
      name: d.name ? d.name.charAt(0).toUpperCase() + d.name.slice(1) : "Unknown",
      count: Number(d.val1 || 0)
    }));

    return {
      tickets: recentTickets,
      unratedTickets,
      activeUsers: formattedActiveUsers,
      pendingApprovals,
      stats: {
        totalAll: Number(countsRow.val1 || 0),
        totalOpen: Number(countsRow.val2 || 0),
        totalInProgress: Number(countsRow.val3 || 0),
        totalResolved: Number(countsRow.val4 || 0),
        totalClosed: Number(countsRow.val5 || 0),
        totalOverdue: Number(countsRow.val6 || 0),
        totalAssignedToMe: Number(countsRow.val7 || 0),
        totalDepartmentUnassigned: Number(countsRow.val8 || 0),
        totalPendingApprovals: Number(countsRow.val9 || 0),
        totalUnrated: Number(countsRow.val10 || 0),
      },
      analytics: {
        trends: trendsList,
        byType: byTypeList,
        byPriority: byPriorityList
      }
    };
  }, {
    query: t.Object({
      department_id: t.Optional(t.Numeric()),
      sort: t.Optional(t.String()),
      order: t.Optional(t.Union([t.Literal("asc"), t.Literal("desc")])),
    }),
    isAuth: true,
  });
