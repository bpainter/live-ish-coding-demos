import nextConfig from "eslint-config-next";
import local from "../packages/engine/tools/eslint-plugin-local/index.js";

const config = [
  ...nextConfig,
  {
    files: ["app/**/*.tsx", "lib/**/*.tsx"],
    plugins: { local },
    rules: { "local/no-utility-classes": "error", "react/no-danger": "error" },
  },
  // Generated from the starter and the engine's shell by `pnpm generate`.
  { ignores: [".gen/**", ".live-ish/**", ".next/**", "public/**", "slides/**", "demos/**", "deck.config.ts", "app/(deck)/**", "app/demos/**", "app/live-ish-address/**", "app/%5Fhealth/**"] },
];

export default config;
