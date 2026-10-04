import { NextRequest, NextResponse } from 'next/server';

const API_PORT = process.env.API_PORT || '4000';
const BACKEND_URL = process.env.INTERNAL_API_URL?.replace(/\/health$/, '') || `http://127.0.0.1:${API_PORT}`;

async function proxy(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const targetUrl = new URL(`/api/v1/${path.join('/')}${request.nextUrl.search}`, BACKEND_URL);

  const headers = new Headers();
  request.headers.forEach((val, key) => {
    if (key !== 'host' && key !== 'content-length') {
      headers.set(key, val);
    }
  });

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: 'no-store',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.text();
  }

  try {
    const res = await fetch(targetUrl.toString(), init);
    const body = await res.text();
    const responseHeaders = new Headers();
    res.headers.forEach((val, key) => {
      responseHeaders.set(key, val);
    });

    return new NextResponse(body, {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: {
          code: 'BACKEND_UNAVAILABLE',
          message: `Backend API proxy error: ${err.message || 'Connection refused'}`,
        },
      },
      { status: 503 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const PUT = proxy;
