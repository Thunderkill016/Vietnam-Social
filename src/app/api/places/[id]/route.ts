import { z } from "zod";
import { databaseFailure, failure, ok, readBody } from "@/lib/api";
import { isKnownFixturePlace } from "@/lib/domain";
import { publicConfig } from "@/lib/env";
import { requestSupabase } from "@/lib/supabase";
import { placeFollowActionSchema, placeSocialPageSchema } from "@/lib/place";

function fixtureHiddenInThisEnvironment(id: string) {
  const env = publicConfig().env;
  return isKnownFixturePlace(id) && (env === "production" || env === "staging");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success || fixtureHiddenInThisEnvironment(id))
    return failure("Không tìm thấy địa điểm.", 404);

  const db = requestSupabase(request);
  if (!db) return failure("Trang địa điểm chưa có trong bản xem thử.", 404);

  const { data, error } = await db.rpc("get_place_social_page", { p_id: id });
  if (error) return failure("Chưa tải được địa điểm.", 503, { dbError: error });
  if (!data) return failure("Không tìm thấy địa điểm.", 404);

  const parsed = placeSocialPageSchema.safeParse(data);
  if (!parsed.success)
    return failure("Dữ liệu địa điểm chưa đúng định dạng.", 502, {
      parseErrors: parsed.error.issues,
    });

  return ok(parsed.data);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success || fixtureHiddenInThisEnvironment(id))
    return failure("Không tìm thấy địa điểm.", 404);

  const db = requestSupabase(request);
  if (!db) return failure("Bản xem thử không lưu theo dõi địa phương.", 503);
  if (!request.headers.get("authorization"))
    return failure("Bạn cần đăng nhập.", 401);

  let body: unknown;
  try {
    body = await readBody(request);
  } catch (error) {
    return failure((error as Error).message);
  }

  const parsed = placeFollowActionSchema.safeParse(body);
  if (!parsed.success) return failure("Thao tác theo dõi không hợp lệ.");

  if (parsed.data.target === "place") {
    const { data, error } = await db.rpc("set_place_follow", {
      p_place_id: id,
      p_follow: parsed.data.follow,
    });
    if (error)
      return databaseFailure(error, {
        entity: "place",
        action: parsed.data.follow ? "follow" : "unfollow",
      });
    return ok(data);
  }

  const placeResult = await db
    .from("places")
    .select("city_id,area")
    .eq("id", id)
    .eq("enabled", true)
    .maybeSingle();
  if (placeResult.error)
    return failure("Chưa xác định được khu vực của địa điểm.", 503, {
      dbError: placeResult.error,
    });
  if (!placeResult.data) return failure("Không tìm thấy địa điểm.", 404);

  const { data, error } = await db.rpc("set_area_follow", {
    p_city_id: placeResult.data.city_id,
    p_area: placeResult.data.area,
    p_follow: parsed.data.follow,
  });
  if (error)
    return databaseFailure(error, {
      entity: "area",
      action: parsed.data.follow ? "follow" : "unfollow",
    });
  return ok(data);
}
