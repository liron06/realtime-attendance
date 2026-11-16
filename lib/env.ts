import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  APP_URL: z.url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(32),
  QR_SECRET: z.string().min(32),
  CONGRESSUS_API_BASE_URL: z.url().default("https://api.congressus.nl/v30"),
  CONGRESSUS_API_KEY: z.string().optional(),
  CONGRESSUS_BASE_URL: z.url().default("https://www.sv-realtime.nl"),
  CONGRESSUS_CLIENT_ID: z.string().optional(),
  CONGRESSUS_CLIENT_SECRET: z.string().optional(),
  CONGRESSUS_REDIRECT_URI: z.url().optional(),
  CONGRESSUS_BOARD_GROUP_SLUG: z.string().optional(),
  CONGRESSUS_BOARD_USER_IDS: z.string().default(""),
  DEMO_MODE: z.enum(["true", "false"]).default("false")
});

export type Env = z.infer<typeof schema>;
let cached: Env | undefined;
export function env(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}
export function isDemo() { return env().DEMO_MODE === "true"; }
