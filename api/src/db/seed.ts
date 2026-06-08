import { db } from "./index"
import { clients, type ClientStatus } from "./schema"

const AREA_CODE = "47"
const PHONE_NUMBER = "92714680"

const CITIES = [
  "Blumenau",
  "Joinville",
  "Florianópolis",
  "Itajaí",
  "Balneário Camboriú",
  "Chapecó",
  "Criciúma",
  "São José",
  "Palhoça",
  "Lages",
]

const STATUSES: ClientStatus[] = [
  "NOT_STARTED",
  "MESSAGE_SENT",
  "NEGOTIATING",
  "HAS_SYSTEM",
  "NO_RESPONSE",
  "REJECTED",
  "DISLIKED",
  "TRIAL",
  "CUSTOM_TRIAL",
  "INVALID_CONTACT",
]

const TOTAL = 50

const rows = Array.from({ length: TOTAL }, (_, i) => {
  const n = i + 1
  return {
    name: `CL${String(n).padStart(3, "0")}`,
    phoneAreaCode: AREA_CODE,
    phoneNumber: PHONE_NUMBER,
    city: CITIES[i % CITIES.length],
    status: STATUSES[i % STATUSES.length],
  }
})

console.log(`Inserindo ${TOTAL} clientes de teste...`)

await db.insert(clients).values(rows)

console.log("Seed concluída.")

process.exit(0)
