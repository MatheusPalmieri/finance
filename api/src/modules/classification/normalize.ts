// Normalização determinística de descrições de extrato. Sem I/O e sem IA —
// é a base das três camadas de classificação e do detector de recorrências.
// Coberto por normalize.test.ts.

/** Remove acentos e baixa a caixa — igual ao `normalize()` do antigo depara.ts. */
function stripAccents(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
}

// Ruído recorrente dos extratos: o intermediário do Nubank, o sufixo de
// instituição de pagamento e documentos mascarados.
const STATEMENT_NOISE: RegExp[] = [
  /\bnu pagamentos\b/g,
  /\s-\s*ip\b/g,
  // CPF/CNPJ mascarados: •••.811.569-••, ***.123.456-**, 12.345.678/0001-90
  /[•*\d]{2,}[.\/-][•*\d.\/-]{6,}/g,
  // Parcelas (12/24) e datas curtas (03/11) — cobre ambos os formatos
  /\b\d{1,2}\/\d{1,4}\b/g,
]

/**
 * Pipeline determinístico: sem acento, sem caixa, sem ruído de extrato,
 * espaços colapsados. É o que as regras `contains`/`exact` comparam.
 */
export function normalizeDescription(raw: string): string {
  let text = stripAccents(raw)
  for (const pattern of STATEMENT_NOISE) text = text.replace(pattern, " ")
  return text.replace(/\s+/g, " ").trim()
}

// Sufixos societários e códigos de UF que aparecem coladas no nome do
// estabelecimento na maquininha ("UBER* TRIP SP"). Removê-los é o que faz
// "UBER *TRIP 8821" e "UBER* TRIP SP" caírem na mesma chave.
const MERCHANT_STOPWORDS = new Set([
  "ltda",
  "me",
  "sa",
  "s",
  "eireli",
  "mei",
  "epp",
  "cia",
  "ac",
  "al",
  "am",
  "ap",
  "ba",
  "ce",
  "df",
  "es",
  "go",
  "ma",
  "mg",
  "ms",
  "mt",
  "pa",
  "pb",
  "pe",
  "pi",
  "pr",
  "rj",
  "rn",
  "ro",
  "rr",
  "rs",
  "sc",
  "se",
  "sp",
  "to",
])

const MAX_MERCHANT_WORDS = 6

/**
 * Chave estável do estabelecimento: o normalizado, sem pontuação, sem números
 * e sem sufixo de loja, limitado a 6 palavras. Usada pelo kNN e pelo detector
 * de recorrências, então precisa ser estável entre variações da mesma loja.
 */
export function merchantKey(raw: string): string {
  const base = normalizeDescription(raw).replace(/[^a-z0-9\s]+/g, " ")
  const words = base
    .split(/\s+/)
    .filter(
      (word) =>
        word.length > 0 &&
        !/^\d+$/.test(word) && // números soltos (código de loja, parcela)
        !MERCHANT_STOPWORDS.has(word)
    )
  return words.slice(0, MAX_MERCHANT_WORDS).join(" ")
}

// Pix enviado: "Transferência enviada pelo Pix - NOME - •••.811.569-•• - NU PAGAMENTOS ..."
// O documento vem logo depois do nome, então o nome é tudo entre o primeiro
// " - " e o " - " seguido de dígitos/máscara.
const PIX_SENT_RE =
  /^transfer[eê]ncia enviada pelo pix - (.+?) - [•*\d.\/-]+ - /i

/**
 * Único renomeador dinâmico herdado do antigo `depara.ts`: o destinatário do
 * Pix vem dentro da própria descrição e não caberia num `renameTo` fixo.
 * Devolve `null` quando a descrição não é um Pix enviado.
 */
export function pixRecipientName(raw: string): string | null {
  const name = PIX_SENT_RE.exec(raw)?.[1]?.trim()
  return name ? `Pix para ${name}` : null
}

/** Conjunto de trigramas de uma string — base da similaridade do kNN. */
export function trigrams(text: string): Set<string> {
  const padded = ` ${text.trim()} `
  const set = new Set<string>()
  for (let i = 0; i + 3 <= padded.length; i++) set.add(padded.slice(i, i + 3))
  return set
}

/** Coeficiente de Dice entre dois conjuntos de trigramas. 0 quando algum é vazio. */
export function diceSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const gram of a) if (b.has(gram)) shared++
  return (2 * shared) / (a.size + b.size)
}
