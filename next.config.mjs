/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [{ source: '/', destination: '/loja', permanent: false }];
  },
};

export default nextConfig;
