import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@edutech/shared', 'motion'],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
    ],
  },
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
};

export default nextConfig;
