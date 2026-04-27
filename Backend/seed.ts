import { prisma } from "./lib/prisma";

async function main() {
  console.log("🌱 Seeding database...");

  // ── Departments ──
  const departments = await Promise.all([
    prisma.department.upsert({
      where: { name: "MIS" },
      update: {},
      create: { name: "MIS", description: "Management Information System" },
    }),
    prisma.department.upsert({
      where: { name: "HR" },
      update: {},
      create: { name: "HR", description: "Human Resources" },
    }),
    prisma.department.upsert({
      where: { name: "Finance" },
      update: {},
      create: { name: "Finance", description: "Finance" }
    }),
    prisma.department.upsert({
      where: { name: "Accounting" },
      update: {},
      create: { name: "Accounting", description: "Accounting" },
    }),
  ]);
  console.log(`  ✓ ${departments.length} departments`);

  // ── Affected Systems ──
  const systems = await Promise.all([
    prisma.affectedSystem.upsert({
      where: { name: "Payroll System" },
      update: { department_id: departments[3].id }, // Accounting
      create: { name: "Payroll System", description: "Employee payroll processing", department_id: departments[3].id },
    }),
    prisma.affectedSystem.upsert({
      where: { name: "AR-NonTrade" },
      update: { department_id: departments[1].id }, // HR
      create: { name: "AR-NonTrade", description: "AR NonTrade System", department_id: departments[1].id },
    }),
    prisma.affectedSystem.upsert({
      where: { name: "FAST" },
      update: { department_id: departments[0].id }, // MIS
      create: { name: "FAST", description: "Finance and Accounting System", department_id: departments[0].id },
    }),
    prisma.affectedSystem.upsert({
      where: { name: "OTC" },
      update: { department_id: departments[3].id }, // Accounting
      create: { name: "OTC", description: "OTC System", department_id: departments[3].id },
    }),
    prisma.affectedSystem.upsert({
      where: { name: "IBS" },
      update: { department_id: departments[0].id }, // MIS
      create: { name: "IBS", description: "Integrated Business Systems", department_id: departments[0].id },
    }),
    prisma.affectedSystem.upsert({
      where: { name: "Others" },
      update: {},
      create: { name: "Others", description: "Uncategorized system" },
    }),
  ]);
  console.log(`  ✓ ${systems.length} affected systems`);

  // ── Request Types ──
  const requestTypes = await Promise.all([
    prisma.requestType.upsert({
      where: { name: "Bug Report" },
      update: { department_id: departments[0].id }, // MIS
      create: { name: "Bug Report", description: "Report a system bug", requires_approval_by_default: false, department_id: departments[0].id },
    }),
    prisma.requestType.upsert({
      where: { name: "Feature Request" },
      update: { department_id: departments[0].id }, // MIS
      create: { name: "Feature Request", description: "Request a new feature", requires_approval_by_default: true, department_id: departments[0].id },
    }),
    prisma.requestType.upsert({
      where: { name: "Access Request" },
      update: { department_id: departments[0].id }, // MIS
      create: { name: "Access Request", description: "Request system access", requires_approval_by_default: true, department_id: departments[0].id },
    }),
    prisma.requestType.upsert({
      where: { name: "Hardware Issue" },
      update: { department_id: departments[0].id }, // MIS
      create: { name: "Hardware Issue", description: "Hardware malfunction", requires_approval_by_default: false, department_id: departments[0].id },
    }),
    prisma.requestType.upsert({
      where: { name: "Software Installation" },
      update: { department_id: departments[0].id }, // MIS
      create: { name: "Software Installation", description: "Request software install", requires_approval_by_default: false, department_id: departments[0].id },
    }),
    prisma.requestType.upsert({
      where: { name: "Others" },
      update: {},
      create: { name: "Others", description: "Other types of requests", requires_approval_by_default: false },
    }),
  ]);
  console.log(`  ✓ ${requestTypes.length} request types`);

  // ── Users ──
  const hashedPassword = await Bun.password.hash("password123");

  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      password: hashedPassword,
      email: "admin@company.com",
      first_name: "Admin",
      last_name: "User",
      department_id: departments[0].id,
    },
  });
  await prisma.userRole.upsert({
    where: { user_id_role: { user_id: admin.id, role: "admin" } },
    update: {},
    create: { user_id: admin.id, role: "admin" },
  });

  const misStaffs = await Promise.all([
    "mis", "mis1", "mis2", "mis3", "mis4"
  ].map(async (u) => {
    const user = await prisma.user.upsert({
      where: { username: u },
      update: {},
      create: {
        username: u,
        password: hashedPassword,
        email: `${u}@company.com`,
        first_name: `MIS ${u.toUpperCase()}`,
        last_name: "Staff",
        department_id: departments[0].id,
      },
    });
    await prisma.userRole.upsert({
      where: { user_id_role: { user_id: user.id, role: "mis" } },
      update: {},
      create: { user_id: user.id, role: "mis" },
    });
    return user;
  }));

  const approvers = await Promise.all([
    "approver", "manager1", "manager2"
  ].map(async (u) => {
    const user = await prisma.user.upsert({
      where: { username: u },
      update: {},
      create: {
        username: u,
        password: hashedPassword,
        email: `${u}@company.com`,
        first_name: `Approver ${u.toUpperCase()}`,
        last_name: "Manager",
        department_id: departments[1].id,
      },
    });
    await prisma.userRole.upsert({
      where: { user_id_role: { user_id: user.id, role: "approver" } },
      update: {},
      create: { user_id: user.id, role: "approver" },
    });
    return user;
  }));

  const regularUsers = await Promise.all([
    "user", "user1", "user2", "user3", "user4", "user5"
  ].map(async (u) => {
    const user = await prisma.user.upsert({
      where: { username: u },
      update: {},
      create: {
        username: u,
        password: hashedPassword,
        email: `${u}@company.com`,
        first_name: `User ${u.toUpperCase()}`,
        last_name: "Employee",
        department_id: departments[1].id,
      },
    });
    await prisma.userRole.upsert({
      where: { user_id_role: { user_id: user.id, role: "user" } },
      update: {},
      create: { user_id: user.id, role: "user" },
    });
    return user;
  }));

  console.log(`  ✓ ${1 + misStaffs.length + approvers.length + regularUsers.length} users created/updated`);

  // ── Diverse Tickets ──
  // console.log("  ⚙ Generating 100 diverse tickets...");
  // const priorities = ["low", "medium", "high", "critical"];
  // const statuses = ["open", "in_progress", "pending_approval", "pending_hard_copy", "resolved", "closed", "rejected"];
  //
  // for (let i = 1; i <= 100; i++) {
  //   const requester = regularUsers[Math.floor(Math.random() * regularUsers.length)];
  //   const priority = priorities[Math.floor(Math.random() * priorities.length)];
  //
  //   // Favor resolved/closed for more CSAT data (60% chance for completed)
  //   let status;
  //   const statusRoll = Math.random();
  //   if (statusRoll < 0.4) status = "closed";
  //   else if (statusRoll < 0.6) status = "resolved";
  //   else status = statuses[Math.floor(Math.random() * statuses.length)];
  //
  //   const system = systems[Math.floor(Math.random() * systems.length)];
  //   const reqType = requestTypes[Math.floor(Math.random() * requestTypes.length)];
  //   const misStaff = misStaffs[Math.floor(Math.random() * misStaffs.length)];
  //
  //   // Dates for trend reports (last 30 days)
  //   const createdAt = new Date();
  //   createdAt.setDate(createdAt.getDate() - Math.floor(Math.random() * 30));
  //
  //   let startedAt = null;
  //   let completedAt = null;
  //
  //   if (["in_progress", "resolved", "closed"].includes(status)) {
  //     startedAt = new Date(createdAt);
  //     startedAt.setHours(startedAt.getHours() + 2);
  //   }
  //
  //   if (["resolved", "closed"].includes(status)) {
  //     completedAt = new Date(startedAt || createdAt);
  //     completedAt.setHours(completedAt.getHours() + Math.floor(Math.random() * 48) + 1);
  //   }
  //
  //   const ticket = await prisma.ticket.create({
  //     data: {
  //       title: `Seeded Ticket #${i}: ${reqType.name} in ${system.name}`,
  //       description: `This is a generated description for seeded ticket #${i}. It needs to be at least 20 characters long to pass validation.`,
  //       priority,
  //       status,
  //       requester_id: requester.id,
  //       assignee_id: (status !== "open" && status !== "pending_approval") ? misStaff.id : null,
  //       affected_system_id: system.id,
  //       request_type_id: reqType.id,
  //       department_id: system.department_id || departments[0].id,
  //       created_at: createdAt,
  //       updated_at: completedAt || startedAt || createdAt,
  //       started_at: startedAt,
  //       completed_at: completedAt,
  //       due_date: new Date(createdAt.getTime() + 72 * 60 * 60 * 1000), // 3 days SLA
  //       sla_breached: completedAt ? (completedAt.getTime() > (createdAt.getTime() + 72 * 60 * 60 * 1000)) : false,
  //     }
  //   });
  //
  //   // Create CSAT for resolved/closed tickets (80% chance)
  //   if (["resolved", "closed"].includes(status) && Math.random() > 0.2) {
  //     const rating = Math.floor(Math.random() * 5) + 1;
  //     await prisma.cSAT.create({
  //       data: {
  //         ticket_id: ticket.id,
  //         rating,
  //         comment: rating <= 3 ? "Could be better, took too long." : "Great job!",
  //         agent_id: ticket.assignee_id,
  //         submitted_at: completedAt || new Date(),
  //       }
  //     });
  //   }
  //
  //   // Create Audit Logs
  //   await prisma.auditLog.create({
  //     data: {
  //       ticket_id: ticket.id,
  //       performed_by_id: requester.id,
  //       action: "ticket_created",
  //       new_value: "open",
  //       created_at: createdAt,
  //     }
  //   });
  //
  //   if (status !== "open") {
  //      await prisma.auditLog.create({
  //       data: {
  //         ticket_id: ticket.id,
  //         performed_by_id: admin.id,
  //         action: "status_change",
  //         old_value: "open",
  //         new_value: status,
  //         created_at: startedAt || createdAt,
  //       }
  //     });
  //   }
  // }

  console.log("✅ Seed complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
