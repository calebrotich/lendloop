import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Never advertise the framework in responses.
  poweredByHeader: false,
};

export default nextConfig;
