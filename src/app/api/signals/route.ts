import {
  boundsSchema,
  createSignalSchema,
  PILOT,
  signalSchema,
} from "@/lib/domain";
import { databaseFailure, failure, ok, readBody } from "@/lib/api";
import { requestSupabase } from "@/lib/supabase";
import { demoSignals } from "@/lib/demo";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const bounds = boundsSchema.safeParse(
    Object.fromEntries(
      Object.entries(PILOT).map(([key, fallback]) => [
        key,
        url.searchParams.get(key) ?? fallback,
      ]),
    ),
  );
  if (!bounds.success)
    return failure("Vùng xem không hợp lệ. Hãy phóng to bản đồ.");
  const db = requestSupabase();
  if (!db)
    return ok({
      mode: "demo",
      signals: demoSignals().filter(
        (s) =>
          s.longitude >= bounds.data.west &&
          s.longitude <= bounds.data.east &&
          s.latitude >= bounds.data.south &&
          s.latitude <= bounds.data.north,
      ),
      truncated: false,
    });
  const { data, error } = await db.rpc("discover_signals", {
    p_bounds: bounds.data,
  });
  if (error)
    return failure("Chưa tải được hoạt động. Bạn có thể thử tải lại.", 503);
  const parsed = signalSchema.array().safeParse(data);
  if (!parsed.success)
    return failure("Dữ liệu hoạt động chưa đúng định dạng.", 502);
  return ok({
    mode: "live",
    signals: parsed.data,
    truncated: parsed.data.length === 100,
  });
}
export async function POST(request: Request) {
  const db = requestSupabase(request);
  if (!db)
    return failure(
      "Bản xem thử không lưu hoạt động. Cần kết nối Supabase local.",
      503,
    );
  if (!request.headers.get("authorization"))
    return failure("Bạn cần đăng nhập.", 401);
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
  return ok({ id: data });
}
