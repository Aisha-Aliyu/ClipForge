import type { NextConfig } from 'next';

const nextConfig: NextConfig = {

  webpack: (config) => {
    // This ensures ffmpeg-core.worker.js is treated as a static asset
    config.module?.rules?.push({
      test: /ffmpeg-core\.worker\.js$/,
      type: 'asset/resource',
    });

    return config;
  },
};

export default nextConfig;