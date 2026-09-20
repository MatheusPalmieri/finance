import { createApp } from "./app"

const app = createApp().listen(3001)

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`)
