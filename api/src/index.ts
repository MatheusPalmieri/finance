import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { clientsRoute } from "./routes/clients";

const app = new Elysia()
  .use(cors({ origin: "http://localhost:5173" }))
  .use(clientsRoute)
  .listen(3001);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);
