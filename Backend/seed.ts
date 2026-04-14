import { prisma } from "./lib/prisma";

async function main() {
  console.log("🌱 Seeding database...");

  // ── Departments ──
  const departments = await Promise.all([
    prisma.department.upsert({
      where: { name: "IT" },
      update: {},
      create: { name: "IT", description: "Information Technology" },
    }),
    prisma.department.upsert({
      where: { name: "HR" },
      update: {},
      create: { name: "HR", description: "Human Resources" },
    }),
    prisma.department.upsert({
      where: { name: "Finance" },
      update: {},
      create: { name: "Finance", description: "Finance & Accounting" },
    }),
  ]);
  console.log(`  ✓ ${departments.length} departments`);

  // ── Affected Systems ──
  const systems = await Promise.all([
    prisma.affectedSystem.upsert({
      where: { name: "Payroll System" },
      update: {},
      create: { name: "Payroll System", description: "Employee payroll processing" },
    }),
    prisma.affectedSystem.upsert({
      where: { name: "HR Portal" },
      update: {},
      create: { name: "HR Portal", description: "Employee self-service portal" },
    }),
    prisma.affectedSystem.upsert({
      where: { name: "Inventory System" },
      update: {},
      create: { name: "Inventory System", description: "Stock & inventory management" },
    }),
    prisma.affectedSystem.upsert({
      where: { name: "Voucher System" },
      update: {},
      create: { name: "Voucher System", description: "Expense voucher processing" },
    }),
    prisma.affectedSystem.upsert({
      where: { name: "Email System" },
      update: {},
      create: { name: "Email System", description: "Corporate email infrastructure" },
    }),
  ]);
  console.log(`  ✓ ${systems.length} affected systems`);

  // ── Request Types ──
  const requestTypes = await Promise.all([
    prisma.requestType.upsert({
      where: { name: "Bug Report" },
      update: {},
      create: { name: "Bug Report", description: "Report a system bug", requires_approval_by_default: false },
    }),
    prisma.requestType.upsert({
      where: { name: "Feature Request" },
      update: {},
      create: { name: "Feature Request", description: "Request a new feature", requires_approval_by_default: true },
    }),
    prisma.requestType.upsert({
      where: { name: "Access Request" },
      update: {},
      create: { name: "Access Request", description: "Request system access", requires_approval_by_default: true },
    }),
    prisma.requestType.upsert({
      where: { name: "Hardware Issue" },
      update: {},
      create: { name: "Hardware Issue", description: "Hardware malfunction", requires_approval_by_default: false },
    }),
    prisma.requestType.upsert({
      where: { name: "Software Installation" },
      update: {},
      create: { name: "Software Installation", description: "Request software install", requires_approval_by_default: false },
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
