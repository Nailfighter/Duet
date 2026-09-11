import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Lint is a separate check (`pnpm lint`), not a production build gate.
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
