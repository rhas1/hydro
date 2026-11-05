import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Reachable from other devices (e.g. your phone over Tailscale) during development.
    host: true,
    proxy: {
      "/api": process.env.VITE_PROXY_TARGET ?? "http://localhost:8000",
    },
  },
});
