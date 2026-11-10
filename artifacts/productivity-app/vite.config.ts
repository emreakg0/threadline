import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { developmentHosts, developmentFileDeny } from '../../scripts/vite-security';
import { resolve } from 'node:path';

const port = Number(process.env.PORT ?? 5173);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist/public",
  },
  server: {
    host: "0.0.0.0",
    port,
    strictPort: true,
    proxy: { "/api": {
      target: "http://127.0.0.1:8080",
      configure(proxy) {
        proxy.on("error", (_error, _request, response) => {
          if ("writeHead" in response && !response.headersSent) {
            response.writeHead(503, { "Content-Type": "application/json" });
            response.end(JSON.stringify({ error: "API Server is unavailable on port 8080. Start or restart the API Server workflow." }));
          }
        });
      },
    } },
    allowedHosts: developmentHosts(),
    fs: { strict: true, allow: [import.meta.dirname, resolve(import.meta.dirname, '../../node_modules')], deny: developmentFileDeny },
  },
  preview: {
    proxy: { "/api": {
      target: "http://127.0.0.1:8080",
      configure(proxy) {
        proxy.on("error", (_error, _request, response) => {
          if ("writeHead" in response && !response.headersSent) {
            response.writeHead(503, { "Content-Type": "application/json" });
            response.end(JSON.stringify({ error: "API Server is unavailable on port 8080. Start or restart the API Server workflow." }));
          }
        });
      },
    } },
    host: "0.0.0.0",
    port,
    allowedHosts: developmentHosts(),
  },
});
