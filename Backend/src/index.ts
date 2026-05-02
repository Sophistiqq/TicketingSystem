import "dotenv/config";
import { Elysia } from "elysia";
import swagger from "@elysiajs/swagger";
import { auth } from "./auth";
import { validator } from "./plugins/authValidator";
import cors from "@elysiajs/cors";
import { wsHandler } from "./ws/wsHandler";
import { registerApp } from "./ws/broadcaster";
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
  messages,
} from "./routes";

const PORT = process.env.PORT || 3000;

let frontendUrl = process.env.FRONTEND_URL;
if (frontendUrl && !frontendUrl.startsWith('http')) frontendUrl = `https://${frontendUrl}`;

// Determine allowed origins
const allowedOrigins = [frontendUrl].filter(Boolean) as string[];
if (frontendUrl) {
  // Also allow with/without trailing slash just in case
  const alternative = frontendUrl.endsWith('/') ? frontendUrl.slice(0, -1) : `${frontendUrl}/`;
  allowedOrigins.push(alternative);
}

const app = new Elysia()
  .onError(({ code, error, set }) => {
    if (code === 'VALIDATION') {
      set.status = 422
      return {
        message: 'Validation failed',
        errors: error.all?.map((e) => ({
          field: e.path?.replace('/', '') || 'unknown',
          message: e.summary ?? e.message,
        })),
      }
    }

    if (code === 'NOT_FOUND') {
      set.status = 404
      return { message: 'The requested resource was not found' }
    }

    console.error(`[${code}]:`, error)
    set.status = 500
    return { message: error }
  })
  .use(cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
  }))
  .use(swagger())
  .use(auth)
  .use(validator)
  .use(wsHandler)
  .use(reference)
  .use(users)
  .use(tickets)
  .use(attachments)
  .use(approvals)
  .use(notifications)
  .use(audit)
  .use(csat)
  .use(comments)
  .use(messages)
  // Serve uploaded files statically
  .get("/uploads/:filename", async ({ params, set }) => {
    const file = Bun.file(`./uploads/${params.filename}`);

    if (!(await file.exists())) {
      set.status = 404;
      return "File not found";
    }

    // Bun resolves content-type from the file automatically
    return file;
  })
  .get("/health", ({ status }) => {
    // console.log('health hit: ', Date.now())
    return status(200)
  })
  .get("/", () => "Hello Elysia")


  .listen(PORT);

export type App = typeof app
registerApp(app);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
