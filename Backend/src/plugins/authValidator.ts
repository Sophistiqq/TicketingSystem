import { Elysia, t } from "elysia"
import jwt from "@elysiajs/jwt";
import { prisma } from "../../lib/prisma";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required")
}

// Cache to throttle last_active updates (User ID -> Last Update Timestamp)
const lastActiveCache = new Map<number, number>();
const THROTTLE_MS = 60 * 1000; // 1 minute

export const validator = new Elysia()
  .use(jwt({
    name: "jwt_token",
    secret: process.env.JWT_SECRET,
    exp: 60 * 60 * 24 * 30,
  }))
  .macro("isAuth", {
    cookie: t.Object({
      auth_cookie: t.Optional(t.String())
    }),
    async resolve({ cookie: { auth_cookie }, status, jwt_token }) {
      const token = await jwt_token.verify(auth_cookie.value as string)
      if (!token) return status(401)
      const userId = Number(token.sub)
      if (!Number.isInteger(userId)) return status(400)

      // Throttle background update of last_active
      const now = Date.now();
      const lastUpdate = lastActiveCache.get(userId) || 0;

      if (now - lastUpdate > THROTTLE_MS) {
        lastActiveCache.set(userId, now);
        prisma.user.update({
          where: { id: userId },
          data: { last_active: new Date() }
        }).catch(console.error);
      }

      return {
        user: userId,
        roles: token.roles as string[]
      }
    }
  })
  .macro("hasRole", (role: string | string[]) => ({
    cookie: t.Object({
      auth_cookie: t.Optional(t.String())
    }),
    async resolve({ cookie: { auth_cookie }, status, jwt_token }) {
      const token = await jwt_token.verify(auth_cookie.value as string)
      if (!token) return status(401)

      const userId = Number(token.sub)
      if (!Number.isInteger(userId)) return status(400)

      const userRoles = token.roles as string[]
      const required = Array.isArray(role) ? role : [role]
      const hasAccess = required.some(r => userRoles?.includes(r))

      if (!hasAccess) return status(403)

      return {
        user: userId,
        roles: userRoles
      }
    }
  }))
