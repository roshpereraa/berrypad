/** @type {import('next').NextConfig} */
export default {
  async rewrites() {
    return [
      /*
       * The chain RPC, served from this origin. Upstream intermittently
       * answers with a duplicated `Access-Control-Allow-Origin: *,*`, which
       * browsers reject; same-origin requests sidestep CORS entirely.
       */
      { source: '/rpc', destination: 'https://rpc.mainnet.chain.robinhood.com' },
    ]
  },
  images: {
    // Token logos are creator-supplied URIs from arbitrary hosts.
    unoptimized: true,
  },
  webpack: (config) => {
    // The chain adapter uses ESM-correct './x.js' specifiers pointing at TS sources.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    }
    return config
  },
}
