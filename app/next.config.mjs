/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Without this, Turbopack walks up past the project looking for a lockfile and
  // finds an unrelated one outside the git repository.
  turbopack: {
    root: import.meta.dirname,
  },

  // mysql2 must stay a real Node require rather than be bundled, and the agent
  // code shells out with child_process — neither survives bundling.
  serverExternalPackages: ['mysql2'],
}

export default nextConfig
