import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: [
      "src/components/social-explore.tsx",
      "src/components/public-profile.tsx",
    ],
    rules: {
      // These components intentionally hydrate external Supabase/API state from effects.
      // State updates occur after async boundaries; the rule currently flags the loader wrapper itself.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "artifacts/**",
    "public/maplibre/**",
  ]),
]);