import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/auth/sync": {
        target: "http://localhost:3001",
      },
      "/auth/magic-link": {
        target: "http://localhost:3001",
      },
      "/auth/exchange-code": {
        target: "http://localhost:3001",
      },
      "/uploads": {
        target: "http://localhost:3001",
      },
    },
  },
});
