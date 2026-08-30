// Parser CSV simples (RFC4180): lida com campos entre aspas contendo vírgulas.
// Suficiente para extratos bancários — evita puxar uma lib externa para isso.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ",") {
      row.push(field)
      field = ""
    } else if (char === "\r") {
      // ignora — o \n do CRLF fecha a linha logo em seguida
    } else if (char === "\n") {
      row.push(field)
      if (row.some((f) => f !== "")) rows.push(row)
      row = []
      field = ""
    } else {
      field += char
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field)
    if (row.some((f) => f !== "")) rows.push(row)
  }

  return rows
}

export interface ParsedStatementRow {
  date: string // ISO yyyy-mm-dd
  amount: number // sinal preservado: negativo = despesa, positivo = entrada
  name: string
  identifier: string
}

export class CsvImportError extends Error {}

// dd/mm/yyyy → yyyy-mm-dd
function toIsoDate(br: string): string | null {
  const m = br.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const [, day, month, year] = m
  return `${year}-${month}-${day}`
}

// Extrato no formato do Nubank: colunas Data, Valor, Identificador, Descrição
// (ordem exata não importa — procura pelo nome do cabeçalho).
export function parseStatementCsv(text: string): ParsedStatementRow[] {
  const rows = parseCsv(text.replace(/^﻿/, "")) // remove BOM se existir
  if (rows.length < 2) throw new CsvImportError("Arquivo vazio ou sem linhas de dados.")

  const header = rows[0].map((h) => h.trim().toLowerCase())
  const dateIdx = header.findIndex((h) => h === "data")
  const amountIdx = header.findIndex((h) => h === "valor")
  const idIdx = header.findIndex((h) => h.startsWith("identificador"))
  const descIdx = header.findIndex((h) => h.startsWith("descri")) // cobre encoding quebrado em "descrição"

  if (dateIdx === -1 || amountIdx === -1 || descIdx === -1) {
    throw new CsvImportError(
      'Cabeçalho não reconhecido. Esperado colunas "Data", "Valor" e "Descrição".'
    )
  }

  return rows.slice(1).map((cols, i) => {
    const line = i + 2
    const iso = toIsoDate(cols[dateIdx] ?? "")
    if (!iso) throw new CsvImportError(`Data inválida na linha ${line}: "${cols[dateIdx] ?? ""}"`)

    const amount = Number(cols[amountIdx])
    if (Number.isNaN(amount) || amount === 0) {
      throw new CsvImportError(`Valor inválido na linha ${line}: "${cols[amountIdx] ?? ""}"`)
    }

    return {
      date: iso,
      amount,
      name: (cols[descIdx] ?? "").trim() || "Sem descrição",
      identifier: idIdx !== -1 ? (cols[idIdx] ?? "").trim() : "",
    }
  })
}
