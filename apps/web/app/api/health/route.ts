import { NextResponse } from 'next/server';
import type { HealthResponse } from '@edutech/shared';

export async function GET() {
  const apiPort = process.env.API_PORT || '4000';
  const backendUrl = process.env.INTERNAL_API_URL || `http://127.0.0.1:${apiPort}/health`;

  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(backendUrl, {
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    });
    clearTimeout(timeoutId);

    const latencyMs = Date.now() - startTime;

    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json<HealthResponse>(
        {
          status: 'degraded',
          version: '0.1.0',
          environment: process.env.NODE_ENV || 'development',
          timestamp: new Date().toISOString(),
          database: 'disconnected',
          details: {
            databaseLatencyMs: latencyMs,
            message: `NestJS API returned HTTP ${res.status}: ${errorText}`,
          },
        },
        { status: res.status },
      );
    }

    const data = (await res.json()) as HealthResponse;
    return NextResponse.json(data);
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    return NextResponse.json<HealthResponse>(
      {
        status: 'degraded',
        version: '0.1.0',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        details: {
          databaseLatencyMs: latencyMs,
          message: `Backend connection pending or offline (${err?.message || 'Connection refused'})`,
        },
      },
      { status: 200 },
    );
  }
}
