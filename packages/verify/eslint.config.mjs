import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  // A package has no pages directory for this rule to read.
  { rules: { "@next/next/no-html-link-for-pages": "off" } },
  // No React here: a function named `use` is not a hook.
  { rules: { "react-hooks/rules-of-hooks": "off" } },
];

export default config;
