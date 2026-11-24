/** @type {import('next').NextConfig} */
const nextConfig = {
  // packages/theme is shipped as TypeScript source; let Next transpile it.
  transpilePackages: ["@dailyscribe/theme"],
  async rewrites() {
    // Next's static file serving doesn't resolve /admin -> /admin/index.html the
    // way Netlify/Apache would, so Decap CMS's admin UI needs an explicit rewrite.
    // (index.html itself points at config.yml via an absolute <link>, so the
    // missing trailing slash here doesn't break Decap's relative config lookup.)
    return [{ source: "/admin", destination: "/admin/index.html" }];
  },
  async headers() {
    // Only our own pages may frame the site (SAMEORIGIN, not DENY, in case
    // Decap CMS's preview pane frames it). Embedding others, e.g. the demo
    // video, is unaffected. frame-ancestors only; no script policy.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
