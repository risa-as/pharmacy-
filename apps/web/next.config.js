/** @type {import('next').NextConfig} */
const nextConfig = {
    transpilePackages: ["@faramace/ui"],
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "utfs.io",
            },
            {
                protocol: "https",
                hostname: "ufs.sh",
            },
        ],
    },
};

module.exports = nextConfig;
