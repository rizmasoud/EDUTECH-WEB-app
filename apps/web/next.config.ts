import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  transpilePackages: ['@edutech/shared', 'motion'],
  output: 'standalone',
  async rewrites() {
    const apiPort = process.env.API_PORT || '4000';
    const apiUrl = process.env.INTERNAL_API_URL || `http://127.0.0.1:${apiPort}`;
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiUrl}/:path*`,
      },
      {
        source: '/api/health',
        destination: `${apiUrl}/health`,
      },
    ];
  },
  webpack: (config, { dev }) => {
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;
