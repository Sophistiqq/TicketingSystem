import { Elysia, t } from "elysia";
import { prisma } from "../../lib/prisma";
import {
  DepartmentPlainInputCreate,
  DepartmentPlainInputUpdate,
  AffectedSystemPlainInputCreate,
  AffectedSystemPlainInputUpdate,
  RequestTypePlainInputCreate,
  RequestTypePlainInputUpdate,
} from "../../generated/prismabox/barrel";
import { validator } from "../plugins/authValidator";

export const reference = new Elysia({ prefix: "/reference" })
  .use(validator)

  // ============================================================
  // DEPARTMENTS
  // ============================================================
  .get("/departments", async ({ status }) => {
    const departments = await prisma.department.findMany({
      where: { is_active: true },
      orderBy: { name: "asc" },
    });
    return status(200, departments);
  })

  .post("/departments", async ({ body, status }) => {
    const department = await prisma.department.create({ data: body });
    return status(201, department);
  }, {
    body: DepartmentPlainInputCreate,
    hasRole: ["admin"],
  })

  .put("/departments/:id", async ({ params, body, status }) => {
    const existing = await prisma.department.findUnique({
      where: { id: params.id },
    });
    if (!existing) return status(404, { message: "Department not found" });

    const department = await prisma.department.update({
      where: { id: params.id },
      data: body,
    });
    return status(200, department);
  }, {
    params: t.Object({ id: t.Numeric() }),
    body: DepartmentPlainInputUpdate,
    hasRole: ["admin"],
  })

  .delete("/departments/:id", async ({ params, status }) => {
    const existing = await prisma.department.findUnique({
      where: { id: params.id },
    });
    if (!existing) return status(404, { message: "Department not found" });

    await prisma.department.update({
      where: { id: params.id },
      data: { is_active: false },
    });
    return status(204);
  }, {
    params: t.Object({ id: t.Numeric() }),
    hasRole: ["admin"],
  })

  // ============================================================
  // AFFECTED SYSTEMS
  // ============================================================
  .get("/affected-systems", async ({ status }) => {
    const systems = await prisma.affectedSystem.findMany({
      where: { is_active: true },
      orderBy: { name: "asc" },
    });
    return status(200, systems);
  })

  .post("/affected-systems", async ({ body, status }) => {
    const system = await prisma.affectedSystem.create({ data: body });
    return status(201, system);
  }, {
    body: AffectedSystemPlainInputCreate,
    hasRole: ["admin"],
  })

  .put("/affected-systems/:id", async ({ params, body, status }) => {
    const existing = await prisma.affectedSystem.findUnique({
      where: { id: params.id },
    });
    if (!existing)
      return status(404, { message: "Affected system not found" });

    const system = await prisma.affectedSystem.update({
      where: { id: params.id },
      data: body,
    });
    return status(200, system);
  }, {
    params: t.Object({ id: t.Numeric() }),
    body: AffectedSystemPlainInputUpdate,
    hasRole: ["admin"],
  })

  .delete("/affected-systems/:id", async ({ params, status }) => {
    const existing = await prisma.affectedSystem.findUnique({
      where: { id: params.id },
    });
    if (!existing)
      return status(404, { message: "Affected system not found" });

    await prisma.affectedSystem.update({
      where: { id: params.id },
      data: { is_active: false },
    });
    return status(204);
  }, {
    params: t.Object({ id: t.Numeric() }),
    hasRole: ["admin"],
  })

  // ============================================================
  // REQUEST TYPES
  // ============================================================
  .get("/request-types", async ({ status }) => {
    const types = await prisma.requestType.findMany({
      where: { is_active: true },
      orderBy: { name: "asc" },
    });
    return status(200, types);
  })

  .post("/request-types", async ({ body, status }) => {
    const requestType = await prisma.requestType.create({ data: body });
    return status(201, requestType);
  }, {
    body: RequestTypePlainInputCreate,
    hasRole: ["admin"],
  })

  .put("/request-types/:id", async ({ params, body, status }) => {
    const existing = await prisma.requestType.findUnique({
      where: { id: params.id },
    });
    if (!existing) return status(404, { message: "Request type not found" });

    const requestType = await prisma.requestType.update({
      where: { id: params.id },
      data: body,
    });
    return status(200, requestType);
  }, {
    params: t.Object({ id: t.Numeric() }),
    body: RequestTypePlainInputUpdate,
    hasRole: ["admin"],
  })

  .delete("/request-types/:id", async ({ params, status }) => {
    const existing = await prisma.requestType.findUnique({
      where: { id: params.id },
    });
    if (!existing) return status(404, { message: "Request type not found" });

    await prisma.requestType.update({
      where: { id: params.id },
      data: { is_active: false },
    });
    return status(204);
  }, {
    params: t.Object({ id: t.Numeric() }),
    hasRole: ["admin"],
  });
