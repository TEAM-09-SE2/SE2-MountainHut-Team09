/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./tests/setup.js",
    include: ["tests/**/*.test.{js,jsx}"],
    // Used by "npm run test:coverage": a table in the terminal, an HTML page
    // in coverage/index.html and the lcov.info file read by SonarCloud.
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text", "html", "lcov"],
      reportOnFailure: true,
    },
  },
});
