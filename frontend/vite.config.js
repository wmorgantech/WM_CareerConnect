import { resolve } from "node:path";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const deploymentRoot = process.env.WM_CAREERCONNECT_DIST
  ? resolve(import.meta.dirname, process.env.WM_CAREERCONNECT_DIST)
  : resolve(import.meta.dirname, "dist");

export default defineConfig({
  plugins: [react()],
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  build: {
    outDir: deploymentRoot,
    emptyOutDir: false,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        student: resolve(import.meta.dirname, "student.html"),
      },
    },
  },
});
