import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PORT: z
    .string()
    .default('4000')
    .transform((val) => parseInt(val, 10)),
  API_PREFIX: z.string().optional().default(''),
  // No default on purpose: a silent default URL used to hide misconfiguration
  // (the provider fell back to PGlite when it could not connect). The driver is
  // chosen explicitly; see infrastructure/database/driver-selection.ts.
  DATABASE_DRIVER: z.enum(['postgres', 'pglite']).optional(),
  DATABASE_URL: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const formatted = result.error.format();
    throw new Error(`Environment validation failed: ${JSON.stringify(formatted)}`);
  }
  return result.data;
}
