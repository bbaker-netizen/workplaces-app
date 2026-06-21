/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep `ws` (and the neon driver that imports it) out of the webpack
  // server-components bundle. ws's optional native helpers (bufferutil /
  // utf-8-validate) don't resolve correctly when bundled, producing
  // "bufferUtil.mask is not a function" the moment a connection sends
  // its first frame. Loading from node_modules at runtime avoids it.
  experimental: {
    serverComponentsExternalPackages: ["ws", "@neondatabase/serverless"],
    // The portal scopes its content to the SELECTED engagement via a
    // cookie, not the URL. Next's client-side Router Cache keys on the URL,
    // so when a coach switches which client they're previewing, navigating
    // to a portal page (same URL) could serve another client's cached
    // content — the "preview A&M but see Impactica" cross-client leak.
    // Disabling the dynamic router-cache window forces every navigation to
    // re-fetch under the current cookie, so the page always matches the
    // engagement named in the preview banner.
    staleTimes: { dynamic: 0, static: 0 },
  },
};

export default nextConfig;
