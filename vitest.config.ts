import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.toml" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations("./migrations"),
          TELEGRAM_BOT_TOKEN: "test-token",
          TELEGRAM_CHAT_ID: "123",
          APP_PASSWORD: "geheim",
          SESSION_SECRET: "test-session-secret",
          INTERNAL_TOKEN: "test-internal",
        },
      },
    })),
  ],
  test: { setupFiles: ["./test/setup.ts"] },
});
