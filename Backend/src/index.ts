import { Elysia } from "elysia";
import swagger from "@elysiajs/swagger";
import { auth } from "./auth";
import { validator } from "./plugins/authValidator";
import cors from "@elysiajs/cors";

const PORT = process.env.PORT || 3000;

const app = new Elysia()
  .use(cors())
  .use(swagger())
  .use(auth)
  .use(validator)
  .get("/health", ({ status }) => {
    console.log('health hit: ', Date.now())
    return status(200)
  })
  .get("/", () => "Hello Elysia")


  .listen(PORT);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
