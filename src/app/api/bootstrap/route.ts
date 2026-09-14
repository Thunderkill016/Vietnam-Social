import { ok, failure } from "@/lib/api";
import { demoSignals } from "@/lib/demo";
import { publicConfig } from "@/lib/env";
import { requestSupabase } from "@/lib/supabase";
export async function GET() {
  const config = publicConfig();
  if (config.mode === "demo")
    return ok({
      mode: "demo",
      places: demoSignals().map((s) => ({
        id: s.place_id,
        name: s.place_name,
        area: s.area,
        longitude: s.longitude,
        latitude: s.latitude,
        h3_parent: s.h3_parent,
      })),
    });
  const { data, error } = await requestSupabase()!
    .from("places")
    .select("id,name,area,longitude,latitude,h3_parent")
    .eq("enabled", true)
    .limit(100);
  if (error)
    return failure(
      "Chưa tải được địa điểm. Kiểm tra kết nối Supabase local.",
      503,
    );
  return ok({ mode: "live", places: data });
}
