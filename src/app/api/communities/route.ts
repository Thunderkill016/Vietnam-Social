import { boundsSchema, HCMC_CITY } from "@/lib/domain";
import { databaseFailure, failure, ok, readBody } from "@/lib/api";
import { requestSupabase } from "@/lib/supabase";
import { communitySchema, createCommunitySchema } from "@/lib/community";

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
  if (!bounds.success)
    return failure("Vùng xem không hợp lệ. Hãy phóng to bản đồ.");

  const db = requestSupabase(request);
  if (!db) return ok({ mode: "demo", communities: [] });

  const { data, error } = await db.rpc("discover_communities", {
    p_bounds: bounds.data,
  });
  if (error)
    return failure("Chưa tải được cộng đồng.", 503, { dbError: error });
  const parsed = communitySchema.array().safeParse(data);
  if (!parsed.success) {
    return failure("Dữ liệu cộng đồng chưa đúng định dạng.", 502, {
      parseErrors: parsed.error.issues,
    });
  }
  return ok({ mode: "live", communities: parsed.data });
}

export async function POST(request: Request) {
  const db = requestSupabase(request);
  if (!db) return failure("Cần kết nối Supabase để tạo cộng đồng.", 503);
  if (!request.headers.get("authorization"))
    return failure("Bạn cần đăng nhập.", 401);

  let body: unknown;
  try {
    body = await readBody(request);
  } catch (error) {
    return failure((error as Error).message);
  }
  const parsed = createCommunitySchema.safeParse(body);
  if (!parsed.success)
    return failure(
      parsed.error.issues[0]?.message ?? "Cộng đồng không hợp lệ.",
    );

  const { data, error } = await db.rpc("create_community", {
    p_input: parsed.data,
  });
  if (error) return databaseFailure(error, { entity: "community" });
  return ok({ id: data });
}
