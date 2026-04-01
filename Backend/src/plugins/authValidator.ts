import { Elysia, t } from "elysia"
import jwt from "@elysiajs/jwt";

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required")
}

// This is a macro that can be used to validate the auth cookie.
// Just simply add the `isAuth` property to your route and it will be validated.
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

      // Parse the token.sub into a number
      const userId = Number(token.sub)
      if (!Number.isInteger(userId)) {
        return status(400)
      }
      return {
        user: userId
      }
    }
  })
  .macro("isAdmin", {
    async resolve({ cookie: { auth_cookie }, status, jwt_token }) {
      const token = await jwt_token.verify(auth_cookie.value as string)
      if (!token) return status(401)

      if (token.role !== "admin") return status(401)
      // Parse the token.sub into a number
      const userId = Number(token.sub)
      if (!Number.isInteger(userId)) {
        return status(400)
      }
      return {
        user: userId
      }
    }
  })
