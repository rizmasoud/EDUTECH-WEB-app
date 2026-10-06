export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // In production, NestJS runs as an independently deployed/managed process.
    // Never spawn child processes or invoke tsx in production.
    if (process.env.NODE_ENV === 'production') {
      return;
    }

    const net = await import('node:net');
    const port = Number(process.env.API_PORT || 4000);

    // Development convenience: Check if API server is already running on target port
    const isPortOpen = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(500);
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.on('error', () => {
        resolve(false);
      });
      socket.connect(port, '127.0.0.1');
    });

    if (!isPortOpen) {
      console.log(`[Instrumentation] Starting EduTech NestJS API on port ${port} (development mode)...`);
      const { spawn } = await import('node:child_process');
      const apiProcess = spawn('npx', ['tsx', '--tsconfig', 'apps/api/tsconfig.json', 'apps/api/src/main.ts'], {
        stdio: 'inherit',
        env: { ...process.env, API_PORT: String(port) },
        detached: false,
      });

      apiProcess.on('error', (err) => {
        console.error('[Instrumentation] Failed to spawn NestJS API process in development:', err);
      });
    } else {
      console.log(`[Instrumentation] EduTech NestJS API is already running on port ${port}.`);
    }
  }
}
