// Tradução de frase livre em `ScenarioEvent[]`. É o **único** ponto de IA desta
// spec, e é cosmético: o formulário manual existe sempre e é a via principal.
//
// A resposta NUNCA é aplicada direto — ela pré-preenche o formulário do cenário,
// que o usuário confirma. Isso elimina toda a classe de bug em que um erro de
// interpretação vira um número errado na tela.

import { z } from "zod"
import { runJson } from "../llm"
import type { ScenarioEvent } from "./types"

const monthPattern = /^\d{4}-\d{2}$/

const eventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("installment_purchase"),
    label: z.string().max(80),
    totalAmount: z.number(),
    installments: z.number().int(),
    monthlyInterestPct: z.number().nullable().optional(),
    startMonth: z.string().nullable().optional(),
    categoryId: z.string().nullable().optional(),
  }),
  z.object({
    kind: z.literal("recurring_change"),
    label: z.string().max(80),
    monthlyAmount: z.number(),
    startMonth: z.string().nullable().optional(),
    endMonth: z.string().nullable().optional(),
    categoryId: z.string().nullable().optional(),
  }),
  z.object({
    kind: z.literal("one_off"),
    label: z.string().max(80),
    amount: z.number(),
    month: z.string(),
  }),
  z.object({
    kind: z.literal("income_change"),
    label: z.string().max(80),
    monthlyAmount: z.number(),
    startMonth: z.string().nullable().optional(),
  }),
])

const responseSchema = z.object({
  events: z.array(eventSchema),
  interpretation: z.string().max(240),
})

const SYSTEM = `Você traduz frases em português do Brasil sobre finanças pessoais em eventos estruturados de simulação.

Regras:
- NUNCA invente um valor que não esteja na frase. Sem valor, devolva events: [].
- Se a frase não descreve um evento financeiro, devolva events: [] e explique em "interpretation".
- "installments": 1 quando a frase não mencionar parcelamento. "3x", "em 10 vezes" → o número dito.
- "monthlyInterestPct": 0 quando a frase não mencionar juros. "sem juros" também é 0.
- Meses no formato "YYYY-MM". Omita quando a frase não disser quando.
- "categoryId" deve ser um id EXATO da lista de categorias, ou null.
- Valores de gasto são positivos. Corte de gasto em "recurring_change" é negativo.
- "interpretation" é uma frase curta em pt-BR resumindo o que você entendeu.

Os nomes dos campos são EXATAMENTE estes — não use sinônimos como "type", "amount" ou "date" onde o campo tem outro nome:

installment_purchase (compra parcelada ou à vista):
{"kind":"installment_purchase","label":"Notebook","totalAmount":4000,"installments":10,"monthlyInterestPct":0,"startMonth":"2026-11","categoryId":null}

recurring_change (gasto recorrente novo, ou corte com valor negativo):
{"kind":"recurring_change","label":"Academia","monthlyAmount":120,"startMonth":"2026-11","endMonth":null,"categoryId":null}

one_off (gasto ou entrada única num mês):
{"kind":"one_off","label":"IPVA","amount":1800,"month":"2027-01"}

income_change (mudança na renda mensal):
{"kind":"income_change","label":"Aumento","monthlyAmount":800,"startMonth":"2026-12"}

Exemplo completo. Frase: "um notebook de 4 mil em 10x sem juros"
Resposta: {"events":[{"kind":"installment_purchase","label":"Notebook","totalAmount":4000,"installments":10,"monthlyInterestPct":0,"categoryId":null}],"interpretation":"Compra de notebook de R$ 4.000 em 10x sem juros."}

Responda APENAS o JSON no formato {"events":[...],"interpretation":"..."}`

export interface ParseContext {
  /** Data de hoje, YYYY-MM-DD. */
  today: string
  categories: { id: string; name: string }[]
}

export function buildParsePrompt(text: string, context: ParseContext): string {
  const categoryList =
    context.categories.length > 0
      ? context.categories.map((c) => `- ${c.id} = ${c.name}`).join("\n")
      : "(nenhuma categoria cadastrada — use null)"
  return `Hoje é ${context.today}.\n\nCategorias disponíveis:\n${categoryList}\n\nFrase:\n${text}`
}

/**
 * Pós-validação obrigatória — o zod garante a forma, não a sanidade:
 * - `categoryId` fora da lista vira `null`;
 * - mês em formato inválido é descartado (vira `undefined`, e o motor usa o default);
 * - `installments` fora de 1–360 e valores não finitos derrubam o evento;
 * - `one_off` sem mês válido é descartado (não há onde aplicá-lo).
 */
export function sanitizeEvents(
  events: z.infer<typeof responseSchema>["events"],
  allowedCategoryIds: Set<string>
): ScenarioEvent[] {
  const out: ScenarioEvent[] = []

  const month = (value: string | null | undefined) =>
    value && monthPattern.test(value) ? value : undefined

  const category = (value: string | null | undefined) =>
    value && allowedCategoryIds.has(value) ? value : null

  for (const event of events) {
    switch (event.kind) {
      case "installment_purchase": {
        if (!Number.isFinite(event.totalAmount) || event.totalAmount <= 0) break
        if (!Number.isInteger(event.installments)) break
        if (event.installments < 1 || event.installments > 360) break
        out.push({
          kind: "installment_purchase",
          label: event.label.trim() || "Compra",
          totalAmount: event.totalAmount,
          installments: event.installments,
          monthlyInterestPct: Math.max(0, event.monthlyInterestPct ?? 0),
          startMonth: month(event.startMonth),
          categoryId: category(event.categoryId),
        })
        break
      }
      case "recurring_change": {
        if (!Number.isFinite(event.monthlyAmount) || event.monthlyAmount === 0) break
        out.push({
          kind: "recurring_change",
          label: event.label.trim() || "Gasto recorrente",
          monthlyAmount: event.monthlyAmount,
          startMonth: month(event.startMonth),
          endMonth: month(event.endMonth),
          categoryId: category(event.categoryId),
        })
        break
      }
      case "one_off": {
        const when = month(event.month)
        if (!when) break
        if (!Number.isFinite(event.amount) || event.amount === 0) break
        out.push({
          kind: "one_off",
          label: event.label.trim() || "Lançamento",
          amount: event.amount,
          month: when,
        })
        break
      }
      case "income_change": {
        if (!Number.isFinite(event.monthlyAmount) || event.monthlyAmount === 0) break
        out.push({
          kind: "income_change",
          label: event.label.trim() || "Mudança na renda",
          monthlyAmount: event.monthlyAmount,
          startMonth: month(event.startMonth),
        })
        break
      }
    }
  }

  return out
}

export interface ParseResult {
  events: ScenarioEvent[]
  interpretation: string
  aiAvailable: boolean
}

/**
 * Nunca lança: falha do provedor vira `aiAvailable: false` com lista vazia, e a
 * UI simplesmente mantém o formulário manual.
 */
export async function parseScenario(
  text: string,
  context: ParseContext
): Promise<ParseResult> {
  const allowed = new Set(context.categories.map((c) => c.id))

  try {
    const result = await runJson("scenario_parse", {
      system: SYSTEM,
      messages: [{ role: "user", content: buildParsePrompt(text, context) }],
      schema: responseSchema,
      temperature: 0,
      retries: 1,
    })

    return {
      events: sanitizeEvents(result.data.events, allowed),
      interpretation: result.data.interpretation,
      aiAvailable: true,
    }
  } catch (err) {
    console.error(
      "[forecast] parser de cenário indisponível:",
      err instanceof Error ? err.message : err
    )
    return { events: [], interpretation: "", aiAvailable: false }
  }
}
