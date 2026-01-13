/** @type {import('next').NextConfig} */
const allowedOrigins = process.env.NEXT_PUBLIC_ALLOWED_ORIGINS
  ? process.env.NEXT_PUBLIC_ALLOWED_ORIGINS.split(',')
      .map(origin => origin.trim())
      .filter(Boolean)
  : undefined

module.exports = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        port: '',
        pathname: '**'
      }
    ]
  },
  experimental: {
    serverActions: {
      allowedOrigins
    }
  }
}
