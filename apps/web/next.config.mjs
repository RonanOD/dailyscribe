/** @type {import('next').NextConfig} */
const nextConfig = {
  // packages/core is shipped as TypeScript source; let Next transpile it.
  transpilePackages: ["@dailyscribe/core"],
  // pdfjs-dist loads internal resources (cmaps, standard fonts) at runtime;
  // letting Next bundle/trace it (like it tried to with the Kanji PDF's font
  // file, see apps/web/lib/plugins/kanji.tsx) risks leaving some of that out
  // of the serverless function. Keep it external so it resolves normally
  // from node_modules at runtime instead.
  serverExternalPackages: ["pdfjs-dist"],
  // Dev is browsed from the LAN (see SETUP.md); silence Next's cross-origin dev warning.
  allowedDevOrigins: ["192.168.68.123"],
};

export default nextConfig;
