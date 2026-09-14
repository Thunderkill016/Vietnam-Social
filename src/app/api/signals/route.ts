import {
  boundsSchema,
  createSignalSchema,
  HCMC_CITY,
  signalSchema,
} from "@/lib/domain";
import { databaseFailure, failure, ok, readBody } from "@/lib/api";
import { requestSupabase } from "@/lib/supabase";
import { demoSignals } from "@/lib/demo";
import { trackEvent } from "@/lib/analytics";

// Default initial bounded viewport around central HCMC
const DEFAULT_VIEWPORT = {
  west: 106.62,
  south: 10.77,
  east: 106.73,
  north: 10.86,
  city_id: HCMC_CITY.id,
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const bounds = boundsSchema.safeParse({
    west: url.searchParams.get("west") ?? DEFAULT_VIEWPORT.west,
    south: url.searchParams.get("south") ?? DEFAULT_VIEWPORT.south,
    east: url.searchParams.get("east") ?? DEFAULT_VIEWPORT.east,
    north: url.searchParams.get("north") ?? DEFAULT_VIEWPORT.north,
    city_id: url.searchParams.get("city_id") ?? DEFAULT_VIEWPORT.city_id,
  });

  if (!bounds.success) {
    return failure("Vùng xem không hợp lệ. Hãy phóng to bản đồ.");
  }

  const db = requestSupabase();
  if (!db) {
    const demo = demoSignals().filter(
      (s) =>
        s.longitude >= bounds.data.west &&
        s.longitude <= bounds.data.east &&
        s.latitude >= bounds.data.south &&
        s.latitude <= bounds.data.north,
    );
    return ok({
      mode: "demo",
      signals: demo,
      truncated: false,
    });
  }

  const { data, error } = await db.rpc("discover_signals", {
    p_bounds: bounds.data,
  });

  if (error) {
    return failure("Chưa tải được hoạt động. Bạn có thể thử tải lại.", 503, {
      dbError: error,
    });
  }

  const parsed = signalSchema.array().safeParse(data);
  if (!parsed.success) {
    return failure("Dữ liệu hoạt động chưa đúng định dạng.", 502, {
      parseErrors: parsed.error.issues,
    });
  }

  return ok({
    mode: "live",
    signals: parsed.data,
    truncated: parsed.data.length === 100,
  });
}

export async function POST(request: Request) {
  const db = requestSupabase(request);
  if (!db) {
    return failure(
      "Bản xem thử không lưu hoạt động. Cần kết nối Supabase.",
      503,
    );
  }

  if (!request.headers.get("authorization")) {
    return failure("Bạn cần đăng nhập.", 401);
  }

  let body: unknown;
  try {
    body = await readBody(request);
  } catch (e) {
    return failure((e as Error).message);
  }

  const parsed = createSignalSchema.safeParse(body);
  if (!parsed.success) return failure(parsed.error.issues[0].message);

  const { data, error } = await db.rpc("publish_signal", {
    p_input: parsed.data,
  });

  if (error) return databaseFailure(error);

  trackEvent({
    type: "signal_created",
    signal_id: data,
    city_id: HCMC_CITY.id,
    category: parsed.data.category,
  });

  return ok({ id: data });
}
