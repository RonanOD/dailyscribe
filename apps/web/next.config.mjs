/** @type {import('next').NextConfig} */
const nextConfig = {
  // packages/core and packages/theme are shipped as TypeScript source; let Next transpile them.
  transpilePackages: ["@dailyscribe/core", "@dailyscribe/theme"],
  // Dev is browsed from the LAN (see SETUP.md); silence Next's cross-origin dev warning.
  allowedDevOrigins: ["192.168.68.123"],
  // @napi-rs/canvas ships a native .node binary (per-platform) for the DnD
  // mail-back rasterizer (lib/dnd/rasterize.ts) — webpack can't parse a
  // binary as a module, so it must stay an external `require()` resolved by
  // Node at runtime instead of being bundled. Next's output file tracing
  // then picks up the actual .node file for the serverless function alongside it.
  serverExternalPackages: ["@napi-rs/canvas"],
};

export default nextConfig;
