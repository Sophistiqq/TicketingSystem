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
    
    // Base filter for general stats (respects department filter if provided)
    const baseWhere: any = { ...deptParam };
    
    // For regular users, they only see their own tickets in general stats? 
    // Looking at the original Dashboard.svelte, it seems 'totalOpen' etc was global or filtered by department.
    // However, the 'tickets' list (Recent Tickets) in the original code used `/tickets/` which 
    // is filtered by requester_id for regular users in Backend/src/routes/tickets.ts.
    // Let's replicate that logic here for consistency.

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
      // Assigned to me
      extraStatsQueries.push(prisma.ticket.count({ where: { assignee_id: user } }));
      
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

    // Execute everything in parallel
    const [
      recentTickets,
      unratedTickets,
      activeUsers,
      totalOpen,
      totalInProgress,
      totalOverdue,
      totalResolved,
      pendingApprovals,
      extraStats
    ] = await Promise.all([
      recentTicketsQuery,
      unratedTicketsQuery,
      activeUsersQuery,
      ...statsQueries,
      pendingApprovalsQuery,
      Promise.all(extraStatsQueries)
    ]);

    // Format active users (same as messages/active)
    const formattedActiveUsers = (activeUsers as any[]).filter(u => u.id !== user);

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
        totalAssignedToMe: extraStats[0] || 0,
        totalDepartmentUnassigned: extraStats[1] || 0,
        totalUnrated: unratedTickets.length,
        totalPendingApprovals: pendingApprovals.length,
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
