import { z } from 'zod';
import { isValidTimeZone } from '../../sessions/domain/session-start';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PORT: z
    .string()
    .default('4000')
    .transform((val) => parseInt(val, 10)),
  API_PREFIX: z.string().optional().default(''),
  // PostgreSQL is the only supported runtime database. No defaults on purpose: a silent default
  // used to hide misconfiguration. Validation and actionable errors live in
  // infrastructure/database/driver-selection.ts (kept free-form here so the user sees that message).
  DATABASE_DRIVER: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  // Only variables listed here are copied from .env into process.env by ConfigModule.
  DATABASE_CONNECT_RETRY_SECONDS: z.string().optional(),
  // IANA time zone in which class session dates/times are expressed (default Asia/Tehran).
  BUSINESS_TIME_ZONE: z
    .string()
    .optional()
    .refine((value) => !value?.trim() || isValidTimeZone(value.trim()), {
      message: 'BUSINESS_TIME_ZONE must be a valid IANA time zone name (for example Asia/Tehran)',
    }),
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
