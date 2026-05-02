/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep `ws` (and the neon driver that imports it) out of the webpack
  // server-components bundle. ws's optional native helpers (bufferutil /
  // utf-8-validate) don't resolve correctly when bundled, producing
  // "bufferUtil.mask is not a function" the moment a connection sends
  // its first frame. Loading from node_modules at runtime avoids it.
  experimental: {
    serverComponentsExternalPackages: ["ws", "@neondatabase/serverless"],
  },
};

export default nextConfig;
