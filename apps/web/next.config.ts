import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  transpilePackages: ["@cedt-hub/db", "@cedt-hub/connectors"],
};

export default nextConfig;
