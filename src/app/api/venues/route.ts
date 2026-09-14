import { failure, ok } from "@/lib/api";
import { requestSupabase } from "@/lib/supabase";

export async function GET(request: Request) {
  const db = requestSupabase(request);
  if (!db) {
    return ok({
      places: [
        {
          id: "10000000-0000-4000-8000-000000000001",
          city_id: "hcm",
          name: "Sân thử nghiệm Phú Nhuận",
          area: "Phú Nhuận",
          longitude: 106.676,
          latitude: 10.803,
          h3_parent: "8665b5647ffffff",
          enabled: true,
        },
      ],
      authorized_venue_ids: ["10000000-0000-4000-8000-000000000001"],
    });
  }

  // Get all enabled places
  const { data: places, error } = await db
    .from("places")
    .select("id, city_id, name, area, longitude, latitude, h3_parent, enabled")
    .order("name");
  if (error) return failure(error.message, 500);

  // If authenticated, check viewer's role and authorized venues
  const authHeader = request.headers.get("authorization");
  let authorizedIds: string[] = [];

  if (authHeader) {
    const { data: profile } = await db.rpc("viewer_profile");
    if (profile?.role === "moderator") {
      // Moderator has access to all venues
      authorizedIds = (places || []).map((p) => p.id);
    } else if (profile?.role === "host") {
      // Host has access to their memberships
      const { data: memberships } = await db
        .from("host_venue_memberships")
        .select("place_id")
        .eq("host_id", profile.id)
        .eq("status", "active");
      authorizedIds = (memberships || []).map((m) => m.place_id);
    }
  }

  return ok({
    places: places || [],
    authorized_venue_ids: authorizedIds,
  });
}

export async function POST(request: Request) {
  const db = requestSupabase(request);
  if (!db || !request.headers.get("authorization")) {
    return failure("Yêu cầu quyền host hoặc moderator.", 401);
  }
  try {
    const body = await request.json();
    const { action = "suggest", ...data } = body;

    if (action === "create") {
      // Moderator creating approved venue directly
      const { data: venueId, error } = await db.rpc("manage_venue", {
        p_input: { action: "create", ...data },
      });
      if (error) return failure(error.message, 400);
      return ok({ venue_id: venueId });
    }

    // Host suggesting a new venue for review
    const { data: suggestionId, error } = await db.rpc("suggest_venue", {
      p_input: data,
    });
    if (error) return failure(error.message, 400);
    return ok({ suggestion_id: suggestionId, status: "pending" });
  } catch {
    return failure("Dữ liệu địa điểm không hợp lệ.", 400);
  }
}

export async function PATCH(request: Request) {
  const db = requestSupabase(request);
  if (!db || !request.headers.get("authorization")) {
    return failure("Yêu cầu quyền moderator.", 401);
  }
  try {
    const body = await request.json();
    const { action, place_id, host_id, suggestion_id, reason } = body;

    if (action === "toggle_status") {
      const { data, error } = await db.rpc("manage_venue", {
        p_input: { action: "toggle", id: place_id },
      });
      if (error) return failure(error.message, 400);
      return ok({ place_id: data });
    }

    if (action === "grant_host") {
      const { error } = await db.rpc("grant_host_venue", {
        p_host_id: host_id,
        p_place_id: place_id,
      });
      if (error) return failure(error.message, 400);
      return ok({ granted: true });
    }

    if (action === "revoke_host") {
      const { error } = await db.rpc("revoke_host_venue", {
        p_host_id: host_id,
        p_place_id: place_id,
      });
      if (error) return failure(error.message, 400);
      return ok({ revoked: true });
    }

    if (action === "review_suggestion") {
      const reviewAction = body.review_action; // 'approve' or 'reject'
      const { data, error } = await db.rpc("review_venue_suggestion", {
        p_id: suggestion_id,
        p_action: reviewAction,
        p_reason: reason || "",
      });
      if (error) return failure(error.message, 400);
      return ok({ result_id: data, action: reviewAction });
    }

    return failure("Hành động quản lý không hợp lệ.", 400);
  } catch {
    return failure("Yêu cầu không hợp lệ.", 400);
  }
}
