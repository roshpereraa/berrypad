/** @type {import('next').NextConfig} */
export default {
  /*
   * Every figure is read from Solana in the browser. The server routes under
   * /api exist only where an upstream refuses cross-origin requests: /api/rpc
   * fails over across Solana endpoints, /api/ipfs forwards coin metadata to
   * pump.fun's IPFS endpoint, and /api/swap proxies Jupiter.
   */
  images: {
    // Coin art comes from arbitrary IPFS gateways, so it is rendered as a
    // plain <img> rather than through next/image optimisation.
    unoptimized: true,
  },
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // Several Solana libraries reach for a global Buffer, which browsers
      // do not have.
      config.plugins.push(new webpack.ProvidePlugin({ Buffer: ['buffer', 'Buffer'] }))
      // The Solana and Anchor libraries reference Node built-ins they never
      // reach in a browser; tell webpack not to look for them.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        os: false,
        path: false,
        crypto: false,
      }
    }
    return config
  },
}
