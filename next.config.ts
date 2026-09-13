import path from "path"
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve("."),
  },
  experimental: {
    // Ceiling for the proxy body buffer. Files above 4 MB never travel
    // as a FormData body — the browser uploads them straight to Supabase
    // Storage (see lib/supabase-upload.ts) — so this only needs to hold
    // the small-file multipart path. Keep it well below the previous
    // "4gb": an unauthenticated request that advertises a multi-GB body
    // forces the proxy to buffer it, which is a cheap DoS vector.
    proxyClientMaxBodySize: "1gb",
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
