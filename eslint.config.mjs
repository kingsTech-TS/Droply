import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Files are untrusted user content and must travel as binary.
      "no-restricted-properties": [
        "error",
        { property: "readAsDataURL", message: "Never Base64-encode transferred files." },
        { object: "window", property: "btoa", message: "Never Base64-encode transferred files." },
      ],
      "no-restricted-globals": [
        "error",
        { name: "btoa", message: "Never Base64-encode transferred files." },
      ],
      "react/no-danger": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
