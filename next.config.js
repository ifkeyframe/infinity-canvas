/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // sharp is a native dep used only in route handlers; keep it external to the bundle.
  experimental: {
    serverComponentsExternalPackages: ['sharp'],
  },
}

module.exports = nextConfig
