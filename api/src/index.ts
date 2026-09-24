import { createApp } from "./app"

// Só na interface local: a API serve dados bancários e não tem autenticação,
// então não pode ficar acessível a outras máquinas da rede
const app = createApp().listen({ port: 3001, hostname: "127.0.0.1" })

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`)
