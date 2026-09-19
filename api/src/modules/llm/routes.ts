import { Elysia, t } from "elysia"
import * as service from "./service"

export const llmRoute = new Elysia({ prefix: "/llm" })
  // A UI usa para mostrar "IA indisponível" sem quebrar nada
  .get("/health", () => service.aiAvailable())
  .get("/usage", ({ query }) => service.usage({ from: query.from, to: query.to }), {
    query: t.Object({
      from: t.Optional(t.String()),
      to: t.Optional(t.String()),
    }),
  })
