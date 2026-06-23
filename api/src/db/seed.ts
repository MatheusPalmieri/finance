import { normalizePhone } from "../lib/phone";
import { db } from "./index";
import { clients, type ClientPhase, type CloseReason } from "./schema";

const TOTAL = 1249;

// ── Pools de dados para geração aleatória ───────────────────────────────────
const FIRST_NAMES = [
  "Ana",
  "Bruno",
  "Carla",
  "Daniel",
  "Eduarda",
  "Felipe",
  "Gabriela",
  "Henrique",
  "Isabela",
  "João",
  "Karina",
  "Lucas",
  "Mariana",
  "Nicolas",
  "Olivia",
  "Pedro",
  "Quezia",
  "Rafael",
  "Sofia",
  "Thiago",
  "Ursula",
  "Vinícius",
  "Wagner",
  "Yasmin",
  "Beatriz",
  "Caio",
  "Débora",
  "Enzo",
  "Fernanda",
  "Gustavo",
  "Helena",
  "Igor",
];

const LAST_NAMES = [
  "Silva",
  "Santos",
  "Oliveira",
  "Souza",
  "Lima",
  "Pereira",
  "Costa",
  "Almeida",
  "Ferreira",
  "Rodrigues",
  "Gomes",
  "Martins",
  "Araújo",
  "Barbosa",
  "Ribeiro",
  "Carvalho",
  "Rocha",
  "Dias",
  "Nascimento",
  "Moreira",
  "Cardoso",
  "Teixeira",
];

const BUSINESS_SUFFIX = [
  "Odontologia",
  "Clínica",
  "Consultório",
  "Estética",
  "Saúde",
  "Sorriso",
  "Dental",
  "Orto",
  "Implantes",
  "Center",
  "",
  "",
  "",
];

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
  "Brusque",
  "Tubarão",
  "Jaraguá do Sul",
  "Caçador",
  "Concórdia",
  "Navegantes",
  "Camboriú",
  "Gaspar",
];

const AREA_CODES = ["47"];

const WON_REASONS: CloseReason[] = ["CLIENT", "TRIAL", "CUSTOM_TRIAL"];
const LOST_REASONS: CloseReason[] = [
  "PRICE_OBJECTION",
  "NO_FIT",
  "GHOST",
  "UNREACHABLE",
];

// ── Helpers de aleatoriedade ────────────────────────────────────────────────
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

// Gera um telefone celular brasileiro com 9 inicial; normalizePhone tira o 9
function randomPhone(): string {
  const number = `992714680`;
  return normalizePhone(number);
}

function randomName(): string {
  const person = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
  const suffix = pick(BUSINESS_SUFFIX);
  return suffix ? `${person} — ${suffix}` : person;
}

// Subtrai N dias de uma data
const minusDays = (base: Date, days: number) =>
  new Date(base.getTime() - days * 86_400_000);
// Avança N dias, sem nunca ultrapassar "agora" (mantém a cadeia coerente)
const plusDays = (base: Date, days: number) => {
  const next = new Date(base.getTime() + days * 86_400_000);
  return next > now ? now : next;
};

const now = new Date();

// ── Geração das linhas ──────────────────────────────────────────────────────
const rows = Array.from({ length: TOTAL }, () => {
  // createdAt aleatório nos últimos 180 dias
  const createdAt = minusDays(now, randInt(0, 180));

  // Distribuição de fase (aleatória mas com peso de funil realista)
  const roll = Math.random();
  let phase: ClientPhase;
  if (roll < 0.4) phase = "PROSPECTING";
  else if (roll < 0.62) phase = "NEGOTIATING";
  else phase = "CLOSED";

  let messageSentAt: Date | null = null;
  let negotiatingStartedAt: Date | null = null;
  let closedAt: Date | null = null;
  let closeReason: CloseReason | null = null;

  // Cadeia de timestamps coerente: created → message → negotiating → closed
  if (phase === "PROSPECTING") {
    // Parte dos prospectados já recebeu mensagem
    if (Math.random() < 0.6) {
      messageSentAt = plusDays(createdAt, randInt(0, 5));
    }
  } else if (phase === "NEGOTIATING") {
    messageSentAt = plusDays(createdAt, randInt(0, 5));
    negotiatingStartedAt = plusDays(messageSentAt, randInt(1, 10));
  } else {
    // CLOSED
    messageSentAt = plusDays(createdAt, randInt(0, 5));
    // Nem todo fechado passou por negociação (ex.: GHOST/UNREACHABLE)
    const won = Math.random() < 0.45;
    closeReason = won ? pick(WON_REASONS) : pick(LOST_REASONS);

    if (closeReason === "GHOST" || closeReason === "UNREACHABLE") {
      // Perdas passivas: podem fechar sem negociação
      closedAt = plusDays(messageSentAt, randInt(3, 30));
    } else {
      negotiatingStartedAt = plusDays(messageSentAt, randInt(1, 10));
      closedAt = plusDays(negotiatingStartedAt, randInt(1, 20));
    }
    // Garante que nenhuma data ultrapasse "agora"
    if (closedAt > now) closedAt = now;
  }

  const hasResponsible = Math.random() < 0.3;

  return {
    name: randomName(),
    phoneAreaCode: pick(AREA_CODES),
    phoneNumber: randomPhone(),
    responsiblePhoneAreaCode: hasResponsible ? pick(AREA_CODES) : null,
    responsiblePhoneNumber: hasResponsible ? randomPhone() : null,
    city: pick(CITIES),
    phase,
    closeReason,
    messageSentAt,
    negotiatingStartedAt,
    closedAt,
    createdAt,
  };
});

console.log(`Inserindo ${TOTAL} clientes aleatórios...`);

// Insere em lotes para evitar estourar o limite de parâmetros do Postgres
const BATCH = 500;
for (let i = 0; i < rows.length; i += BATCH) {
  await db.insert(clients).values(rows.slice(i, i + BATCH));
  console.log(`  ${Math.min(i + BATCH, rows.length)}/${TOTAL}`);
}

console.log("Seed concluída.");

process.exit(0);
