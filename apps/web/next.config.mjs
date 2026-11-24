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
  async headers() {
    // Nothing frames the dashboard, so refuse all framing (clickjacking on
    // "Stop all deliveries" / "Delete my account"). The CSP below sets only
    // frame-ancestors, not a script policy; a full CSP needs per-request nonces.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
