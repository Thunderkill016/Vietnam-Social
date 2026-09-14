import { boundsSchema, HCMC_CITY, isKnownFixturePlace } from "@/lib/domain";
import { databaseFailure, failure, ok, readBody } from "@/lib/api";
import { publicConfig } from "@/lib/env";
import { requestSupabase } from "@/lib/supabase";
import { createLocalPostSchema, localPostSchema } from "@/lib/social";

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
  if (!db) return ok({ mode: "demo", posts: [], truncated: false });

  const { data, error } = await db.rpc("discover_local_posts", {
    p_bounds: bounds.data,
  });
  if (error)
    return failure("Chưa tải được bài địa phương.", 503, { dbError: error });
  const parsed = localPostSchema.array().safeParse(data);
  if (!parsed.success)
    return failure("Dữ liệu bài địa phương chưa đúng định dạng.", 502, {
      parseErrors: parsed.error.issues,
    });

  const config = publicConfig();
  const posts = parsed.data.filter(
    (post) =>
      !post.place_id ||
      (config.env !== "production" && config.env !== "staging") ||
      !isKnownFixturePlace(post.place_id),
  );

  return ok({
    mode: "live",
    posts,
    truncated: parsed.data.length === 100,
  });
}

export async function POST(request: Request) {
  const db = requestSupabase(request);
  if (!db)
    return failure(
      "Bản xem thử không lưu bài đăng. Cần kết nối Supabase.",
      503,
    );
  if (!request.headers.get("authorization"))
    return failure("Bạn cần đăng nhập.", 401);

  let body: unknown;
  try {
    body = await readBody(request);
  } catch (error) {
    return failure((error as Error).message);
  }
  const parsed = createLocalPostSchema.safeParse(body);
  if (!parsed.success)
    return failure(parsed.error.issues[0]?.message ?? "Bài đăng không hợp lệ.");

  const config = publicConfig();
  if (
    parsed.data.place_id &&
    (config.env === "production" || config.env === "staging") &&
    isKnownFixturePlace(parsed.data.place_id)
  ) {
    return failure("Địa điểm không khả dụng.", 404);
  }

  const { data, error } = await db.rpc("create_local_post", {
    p_input: parsed.data,
  });
  if (error) return databaseFailure(error, { entity: "local_post" });
  return ok({ id: data });
}
