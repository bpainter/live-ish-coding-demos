import nextConfig from "eslint-config-next";
import local from "./tools/eslint-plugin-local/index.js";

const config = [
  ...nextConfig,
  {
    files: ["src/components/**/*.tsx", "src/routes/**/*.tsx"],
    plugins: { local },
    rules: { "local/no-utility-classes": "error", "react/no-danger": "error" },
  },
  // A package has no pages directory for this rule to read.
  { rules: { "@next/next/no-html-link-for-pages": "off" } },
  { files: ["src/next/*.cjs", "scripts/**"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  { ignores: ["dist/**", "assets/**", "tools/**", "shell/**"] },
];

export default config;
