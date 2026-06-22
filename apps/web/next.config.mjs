/** @type {import('next').NextConfig} */
const nextConfig = {
  // packages/core is shipped as TypeScript source; let Next transpile it.
  transpilePackages: ["@dailyscribe/core"],
};

export default nextConfig;
