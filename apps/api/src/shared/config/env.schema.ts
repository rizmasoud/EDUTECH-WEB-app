import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PORT: z
    .string()
    .default('4000')
    .transform((val) => parseInt(val, 10)),
  API_PREFIX: z.string().optional().default(''),
  DATABASE_URL: z
    .string()
    .default('postgresql://edutech_user:edutech_password@localhost:5432/edutech_db'),
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
