import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: [
    '@academic-suite/api-client',
    '@academic-suite/core',
    '@academic-suite/ui',
    '@academic-suite/config'
  ],
  turbopack: {
    resolveAlias: {
      './client.js': '../../packages/api-client/src/client.ts',
      './types.js': '../../packages/api-client/src/types.ts',
      './generated/schema.js': '../../packages/api-client/src/generated/schema.ts',
    }
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  }
};

export default nextConfig;

