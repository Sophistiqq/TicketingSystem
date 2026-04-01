import { PrismaClient } from "../generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

// create a .env file in the root directory with DATABASE_URL
// e.g DATABASE_URL=file:./database.db

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const adapter = new PrismaLibSql({
  url: databaseUrl,
});
export const prisma = new PrismaClient({ adapter });
