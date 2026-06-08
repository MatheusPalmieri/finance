// Remove o 9 inicial de números celulares brasileiros (formato pós-2012)
// Exemplo: "987654321" → "87654321"
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 9 && digits[0] === "9") return digits.slice(1)
  return digits.slice(0, 8)
}

// Formata para exibição: "(11) 9999-9999"
export function formatPhone(areaCode: string, number: string): string {
  return `(${areaCode}) ${number.slice(0, 4)}-${number.slice(4)}`
}
