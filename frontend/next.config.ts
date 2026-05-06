import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; " +
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
              "style-src 'self' 'unsafe-inline'; " +
              "connect-src 'self' http://localhost:8000 https://*.amazonaws.com https://sepolia.base.org https://*.base.org https://*.basescan.org wss://*.base.org; " +
              "img-src 'self' data: https:; " +
              "font-src 'self' data:; " +
              "frame-src 'self';",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
