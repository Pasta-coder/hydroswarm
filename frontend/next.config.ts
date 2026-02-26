import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Leaflet CSS to be imported in client components
  transpilePackages: ["leaflet", "react-leaflet"],
};

export default nextConfig;
