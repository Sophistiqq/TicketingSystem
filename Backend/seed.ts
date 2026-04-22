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
      where: { name: "HR Portal" },
      update: { department_id: departments[1].id }, // HR
      create: { name: "HR Portal", description: "Employee self-service portal", department_id: departments[1].id },
    }),
    prisma.affectedSystem.upsert({
      where: { name: "Inventory System" },
      update: { department_id: departments[0].id }, // MIS
      create: { name: "Inventory System", description: "Stock & inventory management", department_id: departments[0].id },
    }),
    prisma.affectedSystem.upsert({
      where: { name: "Voucher System" },
      update: { department_id: departments[3].id }, // Accounting
      create: { name: "Voucher System", description: "Expense voucher processing", department_id: departments[3].id },
    }),
    prisma.affectedSystem.upsert({
      where: { name: "Email System" },
      update: { department_id: departments[0].id }, // MIS
      create: { name: "Email System", description: "Corporate email infrastructure", department_id: departments[0].id },
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

  // Admin user
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
  console.log("  ✓ Admin user (admin / password123)");

  // MIS user
  const mis = await prisma.user.upsert({
    where: { username: "mis" },
    update: {},
    create: {
      username: "mis",
      password: hashedPassword,
      email: "mis@company.com",
      first_name: "MIS",
      last_name: "Staff",
      department_id: departments[0].id,
    },
  });
  await prisma.userRole.upsert({
    where: { user_id_role: { user_id: mis.id, role: "mis" } },
    update: {},
    create: { user_id: mis.id, role: "mis" },
  });
  console.log("  ✓ MIS user (mis / password123)");

  // Approver user
  const approver = await prisma.user.upsert({
    where: { username: "approver" },
    update: {},
    create: {
      username: "approver",
      password: hashedPassword,
      email: "approver@company.com",
      first_name: "Approver",
      last_name: "Manager",
      department_id: departments[1].id,
    },
  });
  await prisma.userRole.upsert({
    where: { user_id_role: { user_id: approver.id, role: "approver" } },
    update: {},
    create: { user_id: approver.id, role: "approver" },
  });
  console.log("  ✓ Approver user (approver / password123)");

  // Regular user
  const regular = await prisma.user.upsert({
    where: { username: "user" },
    update: {},
    create: {
      username: "user",
      password: hashedPassword,
      email: "user@company.com",
      first_name: "Regular",
      last_name: "User",
      department_id: departments[1].id,
    },
  });
  await prisma.userRole.upsert({
    where: { user_id_role: { user_id: regular.id, role: "user" } },
    update: {},
    create: { user_id: regular.id, role: "user" },
  });
  console.log("  ✓ Regular user (user / password123)");

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
