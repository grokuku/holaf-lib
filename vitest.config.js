// Configuration vitest — environnement jsdom (DOM en Node pour les tests).
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "jsdom",
        include: ["tests/**/*.test.js"],
    },
});