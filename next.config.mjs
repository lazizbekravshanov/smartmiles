// Next.js 14 (App Router) config for SmartMiles. Minimal — webhook + API routes only.

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "grammy"],
  },
};

export default nextConfig;
