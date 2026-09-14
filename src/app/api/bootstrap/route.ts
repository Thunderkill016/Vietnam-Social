import { ok, failure } from "@/lib/api";
import { demoSignals } from "@/lib/demo";
import { HCMC_CITY, type CityConfig } from "@/lib/domain";
import { publicConfig } from "@/lib/env";
import { requestSupabase } from "@/lib/supabase";

export async function GET() {
  const config = publicConfig();
  if (config.mode === "demo") {
    return ok({
      mode: "demo",
      city: HCMC_CITY,
      places: demoSignals().map((s) => ({
        id: s.place_id,
        city_id: HCMC_CITY.id,
        name: s.place_name,
        area: s.area,
        longitude: s.longitude,
        latitude: s.latitude,
        h3_parent: s.h3_parent,
        data_origin: "fixture" as const,
      })),
    });
  }

  const db = requestSupabase();
  if (!db) {
    return failure("Cấu hình Supabase không sẵn sàng.", 503);
  }

  let placesQuery = db
    .from("places")
    .select("id,city_id,name,area,longitude,latitude,h3_parent,data_origin")
    .eq("enabled", true)
    .limit(100);

  // Local/CI keeps deterministic fixture Places. Production/staging never presents
  // them as genuine supply.
  if (config.env === "production" || config.env === "staging") {
    placesQuery = placesQuery.eq("data_origin", "real");
  }

  const [placesRes, cityRes] = await Promise.all([
    placesQuery,
    db
      .from("cities")
      .select(
        "id,slug,name,country_code,timezone,default_longitude,default_latitude,default_zoom,active,launch_state",
      )
      .eq("id", "hcm")
      .maybeSingle(),
  ]);

  if (placesRes.error) {
    return failure("Chưa tải được địa điểm. Kiểm tra kết nối Supabase.", 503, {
      error: placesRes.error,
    });
  }

  const city: CityConfig = cityRes.data
    ? {
        id: cityRes.data.id,
        slug: cityRes.data.slug ?? HCMC_CITY.slug,
        name: cityRes.data.name,
        country_code: cityRes.data.country_code ?? "VN",
        timezone: cityRes.data.timezone ?? "Asia/Ho_Chi_Minh",
        default_center: [
          cityRes.data.default_longitude ?? HCMC_CITY.default_center[0],
          cityRes.data.default_latitude ?? HCMC_CITY.default_center[1],
        ],
        default_zoom: cityRes.data.default_zoom ?? 13,
        active: cityRes.data.active ?? true,
        launch_state:
          (cityRes.data.launch_state as CityConfig["launch_state"]) ?? "live",
        operational_bounds: HCMC_CITY.operational_bounds,
      }
    : HCMC_CITY;

  return ok({ mode: "live", city, places: placesRes.data });
}
