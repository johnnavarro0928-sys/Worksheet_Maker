import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://sayuna-ai.com https://www.sayuna-ai.com",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
