import { failure, ok } from "@/lib/api";
import { requestSupabase } from "@/lib/supabase";

export async function GET(request: Request) {
  const db = requestSupabase(request);
  if (!db || !request.headers.get("authorization")) {
    return ok({ templates: [] });
  }
  const { data, error } = await db.rpc("manage_template", {
    p_action: "list",
    p_input: {},
  });
  if (error) return failure(error.message, 400);
  return ok({ templates: data || [] });
}

export async function POST(request: Request) {
  const db = requestSupabase(request);
  if (!db || !request.headers.get("authorization")) {
    return failure("Yêu cầu quyền host.", 401);
  }
  try {
    const body = await request.json();
    const { data, error } = await db.rpc("manage_template", {
      p_action: "create",
      p_input: body,
    });
    if (error) return failure(error.message, 400);
    return ok({ template: data });
  } catch {
    return failure("Dữ liệu mẫu hoạt động không hợp lệ.", 400);
  }
}

export async function DELETE(request: Request) {
  const db = requestSupabase(request);
  if (!db || !request.headers.get("authorization")) {
    return failure("Yêu cầu quyền host.", 401);
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return failure("Thiếu mã mẫu hoạt động.", 400);

    const { data, error } = await db.rpc("manage_template", {
      p_action: "delete",
      p_input: { id },
    });
    if (error) return failure(error.message, 400);
    return ok({ result: data });
  } catch {
    return failure("Yêu cầu không hợp lệ.", 400);
  }
}
