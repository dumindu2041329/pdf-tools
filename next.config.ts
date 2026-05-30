import path from "path"
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve("."),
  },
  experimental: {
    // Raise the proxy body-buffer limit (default 10MB) for large PDF uploads
    proxyClientMaxBodySize: "4gb",
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.clerk.com",
      },
    ],
  },
};

export default nextConfig;
