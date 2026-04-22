import { Elysia, t } from "elysia";
import { prisma } from "../../lib/prisma";
import {
  UserPlainInputCreate,
  UserPlainInputUpdate,
  Role,
} from "../../generated/prismabox/barrel";
import { validator } from "../plugins/authValidator";

// Omit password from all responses
const USER_OMIT = { password: true } as const;
export const users = new Elysia({ prefix: "/users" })
  .use(validator)

  // List all users (admin only)
  .get(
    "/",
    async ({ query, status }) => {
      const { search, role, department_id, is_active, page = 1, limit = 20 } =
        query;

      const where: any = {};
      if (search) {
        where.OR = [
          { first_name: { contains: search } },
          { last_name: { contains: search } },
          { email: { contains: search } },
          { username: { contains: search } },
        ];
      }
      if (role) {
        where.roles = { some: { role } };
      }
      if (department_id) {
        where.department_id = department_id;
      }
      if (is_active !== undefined) {
        where.is_active = is_active === "true";
      }

      const skip = (page - 1) * limit;

      const data = await prisma.user.findMany({
        where,
        omit: USER_OMIT,
        include: {
          department: true,
          roles: true,
        },
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      });
      const total = await prisma.user.count({ where });

      return status(200, {
        data,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    },
    {
      query: t.Object({
        search: t.Optional(t.String()),
        role: t.Optional(Role),
        department_id: t.Optional(t.Numeric()),
        is_active: t.Optional(t.String()),
        page: t.Optional(t.Numeric({ minimum: 1 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100 })),
      }),
      hasRole: ["admin"],
    },
  )

  // Get directory of active users (for all authenticated users)
  .get(
    "/directory",
    async ({ status }) => {
      const users = await prisma.user.findMany({
        where: { is_active: true },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          username: true,
          position: true,
          last_active: true,
        },
        orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
      });
      return status(200, users);
    },
    { isAuth: true }
  )

  // Get available approvers (for ticket assignment)
  .get(
    "/approvers",
    async ({ status }) => {
      const approvers = await prisma.user.findMany({
        where: {
          is_active: true,
          roles: { some: { role: "approver" } },
        },
        omit: USER_OMIT,
        include: { roles: true },
        orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
      });
      return status(200, approvers);
    },
    { isAuth: true },
  )

  // Get available assignees (MIS users)
  .get(
    "/assignees",
    async ({ query, status }) => {
      const { department_id } = query;
      const where: any = {
        is_active: true,
        roles: { some: { role: "mis" } },
      };

      if (department_id) {
        where.department_id = department_id;
      }

      let assignees = await prisma.user.findMany({
        where,
        omit: USER_OMIT,
        include: { roles: true },
        orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
      });

      // Fallback: if department filtered returns nothing, get all MIS users
      if (department_id && assignees.length === 0) {
        delete where.department_id;
        assignees = await prisma.user.findMany({
          where,
          omit: USER_OMIT,
          include: { roles: true },
          orderBy: [{ last_name: "asc" }, { first_name: "asc" }],
        });
      }

      return status(200, assignees);
    },
    { 
      query: t.Object({ department_id: t.Optional(t.Numeric()) }),
      isAuth: true 
    },
  )

  // Get single user
  .get(
    "/:id",
    async ({ params, status }) => {
      const user = await prisma.user.findUnique({
        where: { id: params.id },
        omit: USER_OMIT,
        include: {
          department: true,
          roles: true,
        },
      });
      if (!user) return status(404, { message: "User not found" });
      return status(200, user);
    },
    {
      params: t.Object({ id: t.Numeric() }),
      hasRole: ["admin"],
    },
  )

  // Create user (admin only)
  .post(
    "/",
    async ({ body, status }) => {
      const existing = await prisma.user.findFirst({
        where: {
          OR: [{ username: body.username }, { email: body.email }],
        },
      });
      if (existing) {
        return status(409, { message: "User with this username or email already exists" });
      }

      const hashedPassword = await Bun.password.hash(body.password);
      const user = await prisma.user.create({
        data: { ...body, password: hashedPassword },
        omit: USER_OMIT,
      });
      return status(201, user);
    },
    {
      body: t.Composite([
        UserPlainInputCreate,
        t.Object({
          department_id: t.Optional(t.Nullable(t.Integer())),
        }),
      ]),
      hasRole: ["admin"],
    },
  )

  // Update user
  .put(
    "/:id",
    async ({ params, body, status }) => {
      const existing = await prisma.user.findUnique({
        where: { id: params.id },
      });
      if (!existing) return status(404, { message: "User not found" });

      // If updating username/email, check for conflicts
      if (body.username || body.email) {
        const conflict = await prisma.user.findFirst({
          where: {
            id: { not: params.id },
            OR: [
              body.username ? { username: body.username } : {},
              body.email ? { email: body.email } : {},
            ].filter((w) => Object.keys(w).length > 0),
          },
        });
        if (conflict) {
          return status(409, { message: "Username or email already taken" });
        }
      }

      const data: any = { ...body };
      // Hash password if updating
      if (body.password) {
        data.password = await Bun.password.hash(body.password);
      }

      const user = await prisma.user.update({
        where: { id: params.id },
        data,
        omit: USER_OMIT,
      });
      return status(200, user);
    },
    {
      params: t.Object({ id: t.Numeric() }),
      body: t.Composite([
        UserPlainInputUpdate,
        t.Object({
          department_id: t.Optional(t.Nullable(t.Integer())),
        }),
      ]),
      hasRole: ["admin"],
    },
  )

  // Delete (deactivate) user
  .delete(
    "/:id",
    async ({ params, status }) => {
      const existing = await prisma.user.findUnique({
        where: { id: params.id },
      });
      if (!existing) return status(404, { message: "User not found" });

      await prisma.user.update({
        where: { id: params.id },
        data: { is_active: false },
      });
      return status(204);
    },
    {
      params: t.Object({ id: t.Numeric() }),
      hasRole: ["admin"],
    },
  )

  // Assign role to user
  .post(
    "/:id/roles",
    async ({ params, body, status }) => {
      const user = await prisma.user.findUnique({
        where: { id: params.id },
        include: { roles: true },
      });
      if (!user) return status(404, { message: "User not found" });

      const existingRole = user.roles.find((r) => r.role === body.role);
      if (existingRole) {
        return status(409, { message: "Role already assigned" });
      }

      const role = await prisma.userRole.create({
        data: { user_id: params.id, role: body.role },
      });
      return status(201, role);
    },
    {
      params: t.Object({ id: t.Numeric() }),
      body: t.Object({ role: Role }),
      hasRole: ["admin"],
    },
  )

  // Remove role from user
  .delete(
    "/:id/roles/:role",
    async ({ params, status }) => {
      const deleted = await prisma.userRole.deleteMany({
        where: {
          user_id: params.id,
          role: params.role as any,
        },
      });
      if (deleted.count === 0) {
        return status(404, { message: "Role not found for this user" });
      }
      return status(204);
    },
    {
      params: t.Object({
        id: t.Numeric(),
        role: Role,
      }),
      hasRole: ["admin", "mis"]
    },
  );
