import { execFileSync } from "node:child_process";
import { writeFileSync, appendFileSync } from "node:fs";
// Reads only this checkout's local stack. Never prints keys into CI/tool logs.
const status = JSON.parse(
  execFileSync("npx", ["supabase", "status", "-o", "json"], {
    encoding: "utf8",
  }),
);
const apiUrl = status.API_URL ?? status.api_url;
const dbUrl = status.DB_URL ?? status.db_url;
const key = status.ANON_KEY ?? status.anon_key;
const serviceKey = status.SERVICE_ROLE_KEY ?? status.service_role_key;
if (
  !apiUrl ||
  !key ||
  !serviceKey ||
  !dbUrl ||
  !["127.0.0.1", "localhost"].includes(new URL(apiUrl).hostname) ||
  !["127.0.0.1", "localhost"].includes(new URL(dbUrl).hostname)
)
  throw new Error("A local Supabase stack is required.");
writeFileSync(
  ".env.local",
  `NEXT_PUBLIC_SUPABASE_URL=${apiUrl}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${key}\n`,
);
if (process.env.GITHUB_ENV)
  appendFileSync(
    process.env.GITHUB_ENV,
    `NEXT_PUBLIC_SUPABASE_URL=${apiUrl}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${key}\nLOCAL_SUPABASE_SERVICE_KEY=${serviceKey}\nLOCAL_DB_URL=${dbUrl}\n`,
  );
console.log("Local-only environment prepared; keys are not logged.");
