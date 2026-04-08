import { Elysia, t } from "elysia"
import { validator } from "./plugins/authValidator";
import { prisma } from "../lib/prisma";

export const auth = new Elysia({ prefix: "/auth" })
  // The auth middleware is required for all routes that require authentication, just apply isAuth: true
  .use(validator)
  .post('/register', async ({ body, status }) => {
    const { username, password, email, first_name, last_name } = body;
    try {
      // const user = await sqlite`SELECT id FROM users WHERE username = ${username}`;
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { username },
            { email }
          ]
        }
      });
      if (existingUser) return status(409, "User already exists");

      const hashedPassword = await Bun.password.hash(password);
      const newUser = {
        username,
        password: hashedPassword,
        first_name,
        last_name,
        email
      }
      await prisma.user.create({
        data: newUser
      })
      return status(201, { message: "Register Success" });
    } catch (err) {
      return status(500, { message: "Internal Server Error: " + err });
    }
  }, {
    body: t.Object({
      username: t.String({ minLength: 3, maxLength: 50 }),
      password: t.String({ minLength: 8 }),
      email: t.String({ format: "email" }),
      first_name: t.String({ minLength: 1, maxLength: 50 }),
      last_name: t.String({ minLength: 1, maxLength: 50 }),
      position: t.Optional(t.String({ maxLength: 100 })),
      department_id: t.Optional(t.Number())
    })
  })
  .post("/login", async ({ body, status, jwt_token, cookie: { auth_cookie } }) => {
    const { username, password } = body;
    try {
      const user = await prisma.user.findFirst({
        where: { username },
        include: { roles: true },
      });
      if (!user) {
        return status(404, { message: "User not found" })
      }

      const isValid = await Bun.password.verify(password, user.password);
      if (!isValid) {
        return status(401, { message: "Invalid credentials" });
      }

      // Delete password from user object
      delete (user as any).password;

      const token = await jwt_token.sign({
        sub: user.id.toString(),
        roles: user.roles.map(r => r.role),
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
      })

      const isProduction = process.env.NODE_ENV === 'production';

      auth_cookie.set({
        value: token,
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax',
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });


      return status(200, { message: "Login Success", user: user });
    } catch (err) {
      return status(500, { message: "Internal Server Error" + err });
    }
  }, {
    body: t.Object({
      username: t.String({ minLength: 1 }),
      password: t.String({ minLength: 1 })
    })
  })

  // user is from the auth middleware, it contains user's id - Check the middleware authValidator for more info
  .post('/me', async ({ status, user }) => {
    try {
      if (!user) return status(401, { message: "Unauthorized" });
      const users = await prisma.user.findFirst({
        where: { id: user },
        omit: {
          password: true
        }
      })
      return status(200, users)
    } catch (err) {
      return status(401, `Invalid token: ${err}`)
    }
  }, {
    isAuth: true
  })

  .post('/logout', async ({ cookie: { auth_cookie }, status }) => {
    const isProduction = process.env.NODE_ENV === 'production';

    // Set cookie with maxAge: 0 to expire it immediately
    auth_cookie.set({
      value: '',
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: "/",
      maxAge: 0, // This expires the cookie immediately
    });

    return status(200, { message: "Logout Success" })
  }, {
    isAuth: true
  })
