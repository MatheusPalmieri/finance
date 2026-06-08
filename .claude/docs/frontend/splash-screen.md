---
title: Splash Screen e Favicon
area: frontend
updated: 2026-06-08
---

## Visão geral

O `app/index.html` possui uma tela de carregamento inicial (splash screen) que é exibida enquanto o bundle React não termina de montar. Ao ser removida, a splash desaparece com uma transição suave. O projeto também tem um favicon SVG personalizado com o logotipo Jumpad CRM.

## Favicon

- Arquivo: `app/public/favicon.svg`
- Formato: SVG inline, viewBox 64×64
- Design: retângulo escuro (`#09090b`) com `rx="16"`, letra "J" estilizada em branco e um círculo cinza decorativo
- Referenciado no `<head>` como `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`
- Também declarado como `apple-touch-icon` para iOS

## Splash Screen

### Estrutura

```html
<div id="splash">
  <!-- logo: ícone SVG + nome "Jumpad / CRM" -->
  <!-- dots: animação de 3 pontos pulsantes -->
</div>
```

### Comportamento

- Exibida imediatamente, antes de qualquer JS ser executado
- Removida automaticamente via `MutationObserver` no `#root`:
  - Assim que o React inserir o primeiro filho, a classe `.hidden` é adicionada
  - Após a transição CSS (`opacity + visibility`, 350 ms), o nó é removido do DOM
  - O observer é desconectado após disparar uma vez

### Tema (prefers-color-scheme)

| Variável    | Light       | Dark        |
|-------------|-------------|-------------|
| `--bg`      | `#ffffff`   | `#09090b`   |
| `--fg`      | `#09090b`   | `#fafafa`   |
| `--muted`   | `#71717a`   | `#a1a1aa`   |
| `--ring`    | `#e4e4e7`   | `#27272a`   |

A splash respeita a preferência do sistema operacional via `@media (prefers-color-scheme: dark)` — sem JavaScript, sem flash de cor errada.

### Animação dos dots

Três `<span>` com `animation: dot-pulse 1.4s ease-in-out infinite`, defasados em 0, 0.2 e 0.4 s. O keyframe oscila `opacity` e `scale`, produzindo um efeito de onda suave.

## Meta tags adicionadas

| Tag | Valor |
|-----|-------|
| `lang` | `pt-BR` |
| `description` | `Jumpad CRM — gestão de clientes simplificada` |
| `theme-color` (light) | `#ffffff` |
| `theme-color` (dark) | `#09090b` |
| `title` | `Jumpad CRM` |
