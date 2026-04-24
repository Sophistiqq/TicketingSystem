import { Elysia, t } from "elysia"
import { validator } from "./plugins/authValidator";
import { prisma } from "../lib/prisma";

/**
 * Create an audit log entry (no ticket required for auth events)
 */
async function createAuthAudit(
  performedById: number | null,
  action: string,
  oldValue: string | null,
  newValue: string | null,
  notes?: string,
) {
  await prisma.auditLog.create({
    data: {
      ticket_id: null,
      performed_by_id: performedById,
      action,
      old_value: oldValue,
      new_value: newValue,
      notes,
    },
  });
}

export const auth = new Elysia({ prefix: "/auth" })
  .use(validator)
  .post('/register', async ({ body, status }) => {
    const { username, password, email, first_name, last_name, position, department_id } = body;
    try {
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { username },
            { email }
          ]
        }
      });
      if (existingUser) return status(409, { message: "User already exists" });

      const hashedPassword = await Bun.password.hash(password);
      const newUser = await prisma.user.create({
        data: {
          username,
          password: hashedPassword,
          first_name,
          last_name,
          email,
          position: position ?? null,
          department_id: department_id ?? null,
        },
        omit: { password: true },
      });

      // Assign default "user" role
      await prisma.userRole.create({
        data: { user_id: newUser.id, role: "user" },
      });

      // Audit log
      await createAuthAudit(
        newUser.id,
        "user_registered",
        null,
        username,
        `Email: ${email}`,
      );

      return status(201, { message: "Register Success", user: newUser });
    } catch (err) {
      return status(500, { message: "Internal Server Error" });
    }
  }, {
    body: t.Object({
      username: t.String({ minLength: 3, maxLength: 50 }),
      password: t.String({ minLength: 8 }),
      email: t.String({ format: "email" }),
      first_name: t.String({ minLength: 1, maxLength: 50 }),
      last_name: t.String({ minLength: 1, maxLength: 50 }),
      position: t.Optional(t.String({ maxLength: 100 })),
      department_id: t.Optional(t.Numeric())
    })
  })
  .post("/login", async ({ body, status, jwt_token, cookie: { auth_cookie } }) => {
    const { username, password } = body;
    try {
      const user = await prisma.user.findFirst({
        where: { username },
        include: { roles: true },
        omit: { password: true },
      });

      if (!user) {
        // Log failed login attempt (no user ID available)
        await createAuthAudit(
          null,
          "user_login_failed",
          null,
          username,
          "User not found",
        );
        return status(404, { message: "User not found" });
      }

      // Fetch password separately since omit excludes it
      const userWithPassword = await prisma.user.findUnique({
        where: { id: user.id },
        select: { password: true },
      });

      const isValid = userWithPassword && await Bun.password.verify(password, userWithPassword.password);
      if (!isValid) {
        await createAuthAudit(
          user.id,
          "user_login_failed",
          null,
          username,
          "Invalid password",
        );
        return status(401, { message: "Invalid credentials" });
      }

      const token = await jwt_token.sign({
        sub: user.id.toString(),
        roles: user.roles.map(r => r.role),
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
      });

      const isProduction = process.env.NODE_ENV === 'production';

      auth_cookie.set({
        value: token,
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });

      // Audit successful login
      await createAuthAudit(
        user.id,
        "user_login",
        null,
        username,
        `Roles: ${user.roles.map(r => r.role).join(", ")}`,
      );

      return status(200, { message: "Login Success", user });
    } catch (err) {
      return status(500, { message: "Internal Server Error" });
    }
  }, {
    body: t.Object({
      username: t.String({ minLength: 1 }),
      password: t.String({ minLength: 1 })
    })
  })

  // Changed from POST to GET
  .get('/me', async ({ status, user }) => {
    try {
      if (!user) return status(401, { message: "Unauthorized" });
      const foundUser = await prisma.user.findFirst({
        where: { id: user },
        omit: { password: true },
        include: { roles: true, department: true },
      });
      if (!foundUser) return status(404, { message: "User not found" });
      return status(200, foundUser);
    } catch (err) {
      return status(500, { message: "Internal Server Error" });
    }
  }, {
    isAuth: true
  })


  .patch('/me', async ({ body, user, status }) => {
    try {
      if (!user) return status(401, { message: "Unauthorized" });

      const { first_name, last_name, email, password, username, message_notifications } = body;

      const existingUser = await prisma.user.findUnique({
        where: { id: user }
      });
      if (!existingUser) return status(404, { message: "User not found" });

      // Check conflicts if email or username changed
      if (email || username) {
        const conflict = await prisma.user.findFirst({
          where: {
            id: { not: user },
            OR: [
              email ? { email } : {},
              username ? { username } : {}
            ].filter(x => Object.keys(x).length > 0)
          }
        });
        if (conflict) return status(409, { message: "Username or Email already taken" });
      }

      const updateData: any = {};
      if (first_name) updateData.first_name = first_name;
      if (last_name) updateData.last_name = last_name;
      if (email) updateData.email = email;
      if (username) updateData.username = username;
      if (message_notifications !== undefined) updateData.message_notifications = message_notifications;
      if (password) {
        updateData.password = await Bun.password.hash(password);
      }

      const updatedUser = await prisma.user.update({
        where: { id: user },
        data: updateData,
        omit: { password: true },
        include: { roles: true, department: true }
      });

      await createAuthAudit(
        user,
        "user_profile_updated",
        null,
        null,
        `Updated: ${Object.keys(updateData).join(', ')}`
      );

      return status(200, updatedUser);
    } catch (err) {
      return status(500, { message: "Internal Server Error" });
    }
  }, {
    isAuth: true,
    body: t.Object({
      first_name: t.Optional(t.String({ minLength: 1, maxLength: 50 })),
      last_name: t.Optional(t.String({ minLength: 1, maxLength: 50 })),
      email: t.Optional(t.String({ format: "email" })),
      username: t.Optional(t.String({ minLength: 3, maxLength: 50 })),
      password: t.Optional(t.String({ minLength: 8 })),
      message_notifications: t.Optional(t.Boolean())
    })
  })

  .post('/logout', async ({ cookie: { auth_cookie }, status, user }) => {
    const isProduction = process.env.NODE_ENV === 'production';

    auth_cookie.set({
      value: '',
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: "/",
      maxAge: 0,
    });

    // Audit logout
    if (user) {
      await createAuthAudit(
        user,
        "user_logout",
        null,
        null,
      );
    }

    return status(200, { message: "Logout Success" });
  }, {
    isAuth: true
  })

  .get('/ws-token', async ({ user, roles, jwt_token, status }) => {
    if (!user) return status(401)
    const shortToken = await jwt_token.sign({
      sub: user.toString(),
      roles: roles,
      exp: Math.floor(Date.now() / 1000) + 60 // 60 seconds only
    })
    return status(200, { token: shortToken })
  }, { isAuth: true });
