import { z } from "zod";
import { actionSchema } from "@/lib/domain";
import { databaseFailure, failure, ok, readBody } from "@/lib/api";
import { requestSupabase } from "@/lib/supabase";
import { demoSignals } from "@/lib/demo";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return failure("Không tìm thấy hoạt động.", 404);
  const db = requestSupabase(_request);
  if (!db) {
    const signal = demoSignals().find((s) => s.id === id);
    return signal ? ok({ signal }) : failure("Không tìm thấy hoạt động.", 404);
  }
  const { data, error } = await db.rpc("get_signal", { p_id: id });
  if (error) return failure("Chưa tải được hoạt động.", 503);
  const state =
    data && _request.headers.get("authorization")
      ? (await db.rpc("my_signal_state", { p_id: id })).data
      : null;
  return data
    ? ok({ signal: data, state })
    : failure("Hoạt động đã kết thúc hoặc không còn hiển thị.", 404);
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return failure("Không tìm thấy hoạt động.", 404);
  const db = requestSupabase(request);
  if (!db)
    return failure("Bản xem thử không ghi nhận tham gia hay xác nhận.", 503);
  if (!request.headers.get("authorization"))
    return failure("Bạn cần đăng nhập.", 401);
  let body: unknown;
  try {
    body = await readBody(request);
  } catch (e) {
    return failure((e as Error).message);
  }
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) return failure("Thao tác không hợp lệ.");
  const { error } = await db.rpc("act_on_signal", {
    p_id: id,
    p_action: parsed.data.action,
    p_reason: parsed.data.reason || "",
  });
  if (error) return databaseFailure(error);
  return ok({ saved: true });
}
