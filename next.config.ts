import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow images from local generated folder
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "oaidalleapiprodscus.blob.core.windows.net",
        pathname: "/**",
      },
    ],
  },
  // Suppress hydration warnings for animation classes
  reactStrictMode: true,
};

export default nextConfig;
