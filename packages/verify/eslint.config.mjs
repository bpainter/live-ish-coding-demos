import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  // A package has no pages directory for this rule to read.
  { rules: { "@next/next/no-html-link-for-pages": "off" } },
];

export default config;
