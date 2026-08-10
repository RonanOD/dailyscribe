/** @type {import('next').NextConfig} */
const nextConfig = {
  // packages/core is shipped as TypeScript source; let Next transpile it.
  transpilePackages: ["@dailyscribe/core"],
  // Dev is browsed from the LAN (see SETUP.md); silence Next's cross-origin dev warning.
  allowedDevOrigins: ["192.168.68.123"],
  // The Kanji plugin loads its Japanese font from local .ttf files via
  // fs/path.join(__dirname, ...) at runtime; Next's file tracer doesn't
  // pick those up on its own, so every route that can invoke the plugin
  // (directly, or via runner.ts's dispatch) needs them listed explicitly
  // or the serverless bundle 404s on them (ENOENT) in production.
  outputFileTracingIncludes: {
    "/api/deliver-now": ["./lib/plugins/fonts/*.ttf"],
    "/api/cron/dispatch": ["./lib/plugins/fonts/*.ttf"],
  },
};

export default nextConfig;
