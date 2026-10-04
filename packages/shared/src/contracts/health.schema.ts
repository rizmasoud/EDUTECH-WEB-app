import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  version: z.string(),
  environment: z.string(),
  timestamp: z.string(),
  database: z.enum(['connected', 'disconnected']),
  details: z
    .object({
      databaseLatencyMs: z.number().optional(),
      uptimeSeconds: z.number().optional(),
      message: z.string().optional(),
    })
    .optional(),
});

export type HealthResponseDto = z.infer<typeof healthResponseSchema>;
