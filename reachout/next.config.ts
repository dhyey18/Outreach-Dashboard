import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Prevent Turbopack from bundling these heavy server-only packages
  serverExternalPackages: ['whatsapp-web.js', 'puppeteer', 'puppeteer-core', 'qrcode'],
};

export default nextConfig;
