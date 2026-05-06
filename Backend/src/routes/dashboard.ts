import { Elysia, t } from "elysia";
import { prisma } from "../../lib/prisma";
import { validator } from "../plugins/authValidator";

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

    const deptParam = department_id ? { department_id } : {};
    
    // Base filter for general stats
    const baseWhere: any = { ...deptParam };
    if (!isAdminOrMis && !isApprover) {
      baseWhere.requester_id = user;
    }

    const listWhere: any = { ...deptParam };
    if (!isAdminOrMis && !roles?.includes("approver")) {
        listWhere.requester_id = user;
    }

    // Prepare queries
    const recentTicketsQuery = prisma.ticket.findMany({
      where: listWhere,
      include: {
        requester: { omit: { password: true } },
        assignee: { omit: { password: true } },
        request_type: true,
        affected_system: true,
        _count: { select: { attachments: true, resolution_attempts: true } },
      },
      orderBy: { [sort]: order },
      take: 10,
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
    });

    const activeUsersQuery = prisma.user.findMany({
      where: {
        last_active: { gte: new Date(Date.now() - 5 * 60 * 1000) },
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

    const statsQueries = [
      prisma.ticket.count({ where: { ...baseWhere, status: "open" } }),
      prisma.ticket.count({ where: { ...baseWhere, status: "in_progress" } }),
      prisma.ticket.count({ 
        where: { 
          ...baseWhere, 
          due_date: { lte: new Date() },
          status: { notIn: ["resolved", "closed"] }
        } 
      }),
      prisma.ticket.count({ where: { ...baseWhere, status: "resolved" } }),
      prisma.ticket.count({ where: { ...baseWhere, status: "closed" } }),
      prisma.ticket.count({ where: { ...baseWhere } }),
    ];

    let pendingApprovalsQuery = Promise.resolve([]);
    if (isApprover) {
      pendingApprovalsQuery = prisma.ticketApprover.findMany({
        where: {
          approver_id: user,
          status: "pending",
        },
        include: {
          ticket: {
            include: {
              requester: { omit: { password: true } },
              request_type: true,
              affected_system: true,
            },
          },
        },
        orderBy: { created_at: "desc" },
      }) as any;
    }

    let extraStatsQueries: Promise<number>[] = [];
    if (isAdminOrMis) {
      // Assigned to me (active only)
      extraStatsQueries.push(prisma.ticket.count({ where: { assignee_id: user, status: { notIn: ["resolved", "closed"] } } }));
      
      // Department unassigned
      const userRecord = await prisma.user.findUnique({
        where: { id: user },
        select: { department_id: true }
      });
      
      if (userRecord?.department_id) {
        extraStatsQueries.push(prisma.ticket.count({
          where: {
            department_id: userRecord.department_id,
            status: "open",
            assignee_id: null
          }
        }));
      } else {
        extraStatsQueries.push(Promise.resolve(0));
      }
    }

    // Analytics Data Queries
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const trendsQuery = prisma.ticket.findMany({
      where: {
        ...baseWhere,
        OR: [
          { created_at: { gte: thirtyDaysAgo } },
          { completed_at: { gte: thirtyDaysAgo } }
        ]
      },
      select: {
        created_at: true,
        completed_at: true,
        status: true
      }
    });

    const byTypeQuery = prisma.ticket.groupBy({
      by: ['request_type_id'],
      where: baseWhere,
      _count: { id: true }
    });

    const byPriorityQuery = prisma.ticket.groupBy({
      by: ['priority'],
      where: baseWhere,
      _count: { id: true }
    });

    const requestTypesQuery = prisma.requestType.findMany({
      select: { id: true, name: true }
    });

    // Execute everything in parallel
    const [
      recentTickets,
      unratedTickets,
      activeUsers,
      totalOpen,
      totalInProgress,
      totalOverdue,
      totalResolved,
      totalClosed,
      totalAll,
      pendingApprovals,
      extraStats,
      trends,
      byType,
      byPriority,
      requestTypes
    ] = await Promise.all([
      recentTicketsQuery,
      unratedTicketsQuery,
      activeUsersQuery,
      ...statsQueries,
      pendingApprovalsQuery,
      Promise.all(extraStatsQueries),
      trendsQuery,
      byTypeQuery,
      byPriorityQuery,
      requestTypesQuery
    ]);

    // Format active users (same as messages/active)
    const formattedActiveUsers = (activeUsers as any[]).filter(u => u.id !== user);

    // Process trends
    const trendsMap: Record<string, { new: number, resolved: number }> = {};
    for (let i = 0; i <= 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      trendsMap[d.toISOString().split('T')[0]] = { new: 0, resolved: 0 };
    }

    for (const t of trends) {
      const createdDate = t.created_at.toISOString().split('T')[0];
      if (trendsMap[createdDate]) trendsMap[createdDate].new++;
      
      if (t.completed_at) {
        const resolvedDate = t.completed_at.toISOString().split('T')[0];
        if (trendsMap[resolvedDate]) trendsMap[resolvedDate].resolved++;
      }
    }

    const trendsList = Object.entries(trendsMap)
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Process distribution
    const typeMap = Object.fromEntries(requestTypes.map(rt => [rt.id, rt.name]));
    const byTypeList = byType.map(bt => ({
      name: bt.request_type_id ? (typeMap[bt.request_type_id] || "Other") : "Uncategorized",
      count: bt._count.id
    }));

    const byPriorityList = byPriority.map(bp => ({
      name: bp.priority.charAt(0).toUpperCase() + bp.priority.slice(1),
      count: bp._count.id
    }));

    return {
      tickets: recentTickets,
      unratedTickets,
      activeUsers: formattedActiveUsers,
      pendingApprovals,
      stats: {
        totalOpen,
        totalInProgress,
        totalOverdue,
        totalResolved,
        totalClosed,
        totalAll,
        totalAssignedToMe: extraStats[0] || 0,
        totalDepartmentUnassigned: extraStats[1] || 0,
        totalUnrated: unratedTickets.length,
        totalPendingApprovals: pendingApprovals.length,
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
