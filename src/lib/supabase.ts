import { createClient } from "@supabase/supabase-js";
import { publicConfig } from "./env";
let browserClient: ReturnType<typeof createClient> | undefined;
export function browserSupabase() {
  try {
    const config = publicConfig();
    if (config.mode !== "live") return null;
    browserClient ??= createClient(config.url, config.key);
    return browserClient;
  } catch {
    return null;
  }
}
export function requestSupabase(request?: Request) {
  const config = publicConfig();
  if (config.mode !== "live") return null;
  const authorization = request?.headers.get("authorization");
  return createClient(config.url, config.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { headers: authorization ? { Authorization: authorization } : {} },
  });
}
