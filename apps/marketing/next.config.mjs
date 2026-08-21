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
};

export default nextConfig;
