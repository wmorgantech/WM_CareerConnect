import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const deploymentRoot = process.env.WM_CAREERCONNECT_DIST
  ? resolve(import.meta.dirname, process.env.WM_CAREERCONNECT_DIST)
  : resolve(import.meta.dirname, "../frontend/dist");

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/admin-root/" : "/",
  plugins: [react()],
  build: {
    outDir: resolve(deploymentRoot, "admin-root"),
    emptyOutDir: true,
  },
  server: {
    port: 5180,
    strictPort: true,
  },
  preview: {
    port: 5180,
    strictPort: true,
  },
}));