import "dotenv/config";
import path from "path";
import { defineConfig, env } from "prisma/config";
import { PrismaLibSql } from "@prisma/adapter-libsql";

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL") || "file:./database.db",
    adapter: async (env) => {
      return new PrismaLibSql({
        url: env.DATABASE_URL || "file:./database.db",
        authToken: env.AUTH_TOKEN,
      });
    },
  },
});
