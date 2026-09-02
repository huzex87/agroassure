/** @type {import('next').NextConfig} */
export default {
  // The console reads projections through the API and holds no state of its
  // own, so nothing here is cached across users.
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: true },
};
