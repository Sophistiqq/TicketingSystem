import { Elysia, t } from "elysia"
import jwt from "@elysiajs/jwt";
import { prisma } from "../../lib/prisma";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required")
}

// Cache to throttle last_active updates (User ID -> Last Update Timestamp)
const lastActiveCache = new Map<number, number>();
const THROTTLE_MS = 60 * 1000; // 1 minute

// Cache for user active status to avoid DB RTT on every request
const userStatusCache = new Map<number, { active: boolean, timestamp: number }>();
const STATUS_CACHE_MS = 5 * 60 * 1000; // 5 minutes

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

      // Verify user is still active (with caching)
      const now = Date.now();
      const cachedStatus = userStatusCache.get(userId);
      let isActive = true;

      if (cachedStatus && (now - cachedStatus.timestamp < STATUS_CACHE_MS)) {
        isActive = cachedStatus.active;
      } else {
        const userRecord = await prisma.user.findUnique({
          where: { id: userId },
          select: { is_active: true }
        });
        isActive = userRecord?.is_active ?? false;
        userStatusCache.set(userId, { active: isActive, timestamp: now });
      }

      if (!isActive) return status(403, { message: "Account is inactive" });

      // Throttle background update of last_active
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

      // Verify user is still active (with caching)
      const now = Date.now();
      const cachedStatus = userStatusCache.get(userId);
      let isActive = true;

      if (cachedStatus && (now - cachedStatus.timestamp < STATUS_CACHE_MS)) {
        isActive = cachedStatus.active;
      } else {
        const userRecord = await prisma.user.findUnique({
          where: { id: userId },
          select: { is_active: true }
        });
        isActive = userRecord?.is_active ?? false;
        userStatusCache.set(userId, { active: isActive, timestamp: now });
      }

      if (!isActive) return status(403, { message: "Account is inactive" });

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
