// true quando o foco está num campo editável — atalhos de tecla única
// (B, D, ",") não devem disparar enquanto o usuário digita
export function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return !!target.closest("input, textarea, select, [contenteditable='true']")
}
