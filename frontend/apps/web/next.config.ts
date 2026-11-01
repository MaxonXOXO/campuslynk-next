import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: [
    '@academic-suite/api-client',
    '@academic-suite/core',
    '@academic-suite/ui',
    '@academic-suite/config'
  ]
};

export default nextConfig;

