// Typed access to process.env. Validates at module load and throws on missing required vars.

import { z } from "zod";

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  DATABASE_URL: z.string().optional().default(""),
  OSRM_BASE_URL: z.string().url().default("https://router.project-osrm.org"),
  VALHALLA_BASE_URL: z.string().url().default("https://valhalla1.openstreetmap.de"),
  OPENROUTE_API_KEY: z.string().optional().default(""),
  OPENROUTE_BASE_URL: z.string().url().default("https://api.openrouteservice.org"),
  NOMINATIM_BASE_URL: z.string().url().default("https://nominatim.openstreetmap.org"),
  NOMINATIM_USER_AGENT: z.string().default("SmartMiles/0.1"),
  OVERPASS_BASE_URL: z.string().url().default("https://overpass-api.de/api/interpreter"),
  REDIS_URL: z.string().optional().default(""),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  NEXT_PUBLIC_APP_URL: z.string().optional().default(""),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ");
    throw new Error(`Invalid environment configuration:\n  ${issues}`);
  }
  cached = parsed.data;
  return cached;
}
