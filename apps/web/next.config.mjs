/** @type {import('next').NextConfig} */
const nextConfig = {
  // packages/core and packages/theme are shipped as TypeScript source; let Next transpile them.
  transpilePackages: ["@dailyscribe/core", "@dailyscribe/theme"],
  // Dev is browsed from the LAN (see SETUP.md); silence Next's cross-origin dev warning.
  allowedDevOrigins: ["192.168.68.123"],
};

export default nextConfig;
