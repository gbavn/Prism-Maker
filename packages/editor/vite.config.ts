import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // O Electron carrega o HTML do disco, entao os caminhos precisam ser
  // relativos e nao comecar com barra.
  base: "./",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
    target: "chrome130",
  },
});
