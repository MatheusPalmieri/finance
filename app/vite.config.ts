import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import babel from "@rolldown/plugin-babel"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // React Compiler: memoização automática de componentes e hooks.
    // Torna memos/useMemo/useCallback manuais em grande parte redundantes.
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Separa libs estáveis em chunks próprios para cache de longo prazo:
        // o código da app muda com frequência, mas estes vendors quase nunca,
        // então o navegador reaproveita o cache entre deploys.
        manualChunks(id) {
          if (!id.includes("node_modules")) return
          // recharts arrasta várias libs d3-* — mantém tudo num só chunk
          if (id.includes("recharts") || id.includes("/d3-")) return "recharts"
          if (id.includes("@tanstack")) return "query"
          if (
            id.includes("react-router") ||
            id.includes("react-dom") ||
            id.includes("/react/") ||
            id.includes("/scheduler/")
          )
            return "react-vendor"
        },
      },
    },
  },
})
