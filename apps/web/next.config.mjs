/** @type {import('next').NextConfig} */
const nextConfig = {
  // packages/core is shipped as TypeScript source; let Next transpile it.
  transpilePackages: ["@dailyscribe/core"],
  // Dev is browsed from the LAN (see SETUP.md); silence Next's cross-origin dev warning.
  allowedDevOrigins: ["192.168.68.123"],
};

export default nextConfig;
