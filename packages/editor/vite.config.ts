import { defineConfig } from "vite";

export default defineConfig({
  // O Electron carrega o HTML do disco, entao os caminhos precisam ser
  // relativos e nao comecar com barra.
  base: "./",
  build: {
    outDir: "dist/renderer",
    emptyOutDir: true,
    target: "chrome130",
  },
});
