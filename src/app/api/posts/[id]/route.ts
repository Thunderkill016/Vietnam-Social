import { z } from "zod";
import { databaseFailure, failure, ok, readBody } from "@/lib/api";
import { requestSupabase } from "@/lib/supabase";
import { localCommentSchema, localPostActionSchema, localPostSchema } from "@/lib/social";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return failure("Không tìm thấy bài đăng.", 404);
  const db = requestSupabase(request);
  if (!db) return failure("Bài địa phương chưa có trong bản xem thử.", 404);

  const [postRes, commentsRes] = await Promise.all([
    db.rpc("get_local_post", { p_id: id }),
    db.rpc("get_local_post_comments", { p_id: id }),
  ]);
  if (postRes.error) return failure("Chưa tải được bài đăng.", 503, { dbError: postRes.error });
  if (!postRes.data) return failure("Bài đăng không còn hiển thị.", 404);
  const post = localPostSchema.safeParse(postRes.data);
  const comments = localCommentSchema.array().safeParse(commentsRes.data ?? []);
  if (!post.success || !comments.success) return failure("Dữ liệu bài đăng chưa đúng định dạng.", 502);
  return ok({ post: post.data, comments: comments.data });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return failure("Không tìm thấy bài đăng.", 404);
  const db = requestSupabase(request);
  if (!db) return failure("Bản xem thử không lưu tương tác.", 503);
  if (!request.headers.get("authorization")) return failure("Bạn cần đăng nhập.", 401);

  let body: unknown;
  try {
    body = await readBody(request);
  } catch (error) {
    return failure((error as Error).message);
  }
  const parsed = localPostActionSchema.safeParse(body);
  if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? "Thao tác không hợp lệ.");

  if (parsed.data.action === "react") {
    const { data, error } = await db.rpc("toggle_local_post_reaction", { p_id: id });
    if (error) return databaseFailure(error, { entity: "local_post", action: "react" });
    return ok(data);
  }
  if (parsed.data.action === "comment") {
    const { data, error } = await db.rpc("comment_local_post", { p_id: id, p_body: parsed.data.body });
    if (error) return databaseFailure(error, { entity: "local_post", action: "comment" });
    return ok({ id: data });
  }
  const { error } = await db.rpc("report_local_post", { p_id: id, p_reason: parsed.data.reason ?? "" });
  if (error) return databaseFailure(error, { entity: "local_post", action: "report" });
  return ok({ saved: true });
}
