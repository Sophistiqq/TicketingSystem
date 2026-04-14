import { Elysia } from "elysia";
import swagger from "@elysiajs/swagger";
import { auth } from "./auth";
import { validator } from "./plugins/authValidator";
import cors from "@elysiajs/cors";
import {
  reference,
  users,
  tickets,
  attachments,
  approvals,
  notifications,
  audit,
  csat,
  comments,
} from "./routes";

const PORT = process.env.PORT || 3000;

const app = new Elysia()
  .use(cors())
  .use(swagger())
  .use(auth)
  .use(validator)
  .use(reference)
  .use(users)
  .use(tickets)
  .use(attachments)
  .use(approvals)
  .use(notifications)
  .use(audit)
  .use(csat)
  .use(comments)
  .get("/health", ({ status }) => {
    console.log('health hit: ', Date.now())
    return status(200)
  })
  .get("/", () => "Hello Elysia")


  .listen(PORT);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
