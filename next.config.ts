import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['mongodb', 'sharp'],
  // Server modules retain Node-compatible .js specifiers for tsx scripts/workers.
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default config;
