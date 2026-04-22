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

const app = new Elysia()
  .use(cors())
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
    const { filename } = params;
    const filePath = `./uploads/${filename}`;
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      set.status = 404;
      return "File not found";
    }

    // Set content type based on extension
    const ext = filename.split(".").pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      svg: "image/svg+xml",
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      txt: "text/plain",
      csv: "text/csv",
      zip: "application/zip",
    };
    if (ext && mimeTypes[ext]) {
      set.headers["content-type"] = mimeTypes[ext];
    }

    return file;
  })
  .get("/health", ({ status }) => {
    console.log('health hit: ', Date.now())
    return status(200)
  })
  .get("/", () => "Hello Elysia")


  .listen(PORT);

export type App = typeof app;

registerApp(app);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
