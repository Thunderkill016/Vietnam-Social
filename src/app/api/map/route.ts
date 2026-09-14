import { failure, ok } from "@/lib/api";
import { communitySchema } from "@/lib/community";
import {
  boundsSchema,
  HCMC_CITY,
  isKnownFixturePlace,
  signalSchema,
} from "@/lib/domain";
import { publicConfig } from "@/lib/env";
import { localPostSchema } from "@/lib/social";
import {
  SOCIAL_MAP_FILTERS,
  socialMapPlaceSchema,
  type SocialMapEntity,
  type SocialMapFilter,
} from "@/lib/social-map";
import { requestSupabase } from "@/lib/supabase";

const DEFAULT_VIEWPORT = {
  west: 106.62,
  south: 10.77,
  east: 106.73,
  north: 10.86,
  city_id: HCMC_CITY.id,
};

function selectedKinds(url: URL): Set<SocialMapFilter> {
  const raw = url.searchParams.get("kinds");
  if (!raw) return new Set(SOCIAL_MAP_FILTERS);
  const requested = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is SocialMapFilter =>
      SOCIAL_MAP_FILTERS.includes(value as SocialMapFilter),
    );
  return new Set(requested.length ? requested : ["all"]);
}

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

  const db = requestSupabase(request);
  if (!db) {
    return ok({
      mode: "demo",
      posts: [],
      communities: [],
      activities: [],
      places: [],
      entities: [],
      counts: { local_post: 0, community: 0, activity: 0, place: 0 },
    });
  }

  const kinds = selectedKinds(url);
  const all = kinds.has("all");
  const wants = (kind: SocialMapFilter) => all || kinds.has(kind);
  const config = publicConfig();
  const hosted = config.env === "production" || config.env === "staging";

  // Keep direct Place reads compatible with production schema 008 until migration
  // 009 is applied. Stable fixture UUIDs provide a safe rollout fallback.
  const placesQuery = db
    .from("places")
    .select("id,city_id,name,area,longitude,latitude,h3_parent")
    .eq("enabled", true)
    .eq("city_id", bounds.data.city_id ?? HCMC_CITY.id)
    .gte("longitude", bounds.data.west)
    .lte("longitude", bounds.data.east)
    .gte("latitude", bounds.data.south)
    .lte("latitude", bounds.data.north)
    .order("name", { ascending: true })
    .limit(12);

  const [postsRes, communitiesRes, activitiesRes, placesRes] =
    await Promise.all([
      wants("local_post")
        ? db.rpc("discover_local_posts", { p_bounds: bounds.data })
        : Promise.resolve({ data: [], error: null }),
      wants("community")
        ? db.rpc("discover_communities", { p_bounds: bounds.data })
        : Promise.resolve({ data: [], error: null }),
      wants("activity")
        ? db.rpc("discover_signals", { p_bounds: bounds.data })
        : Promise.resolve({ data: [], error: null }),
      wants("place") ? placesQuery : Promise.resolve({ data: [], error: null }),
    ]);

  const firstError =
    postsRes.error ??
    communitiesRes.error ??
    activitiesRes.error ??
    placesRes.error;
  if (firstError) {
    return failure("Chưa tải được lớp xã hội của vùng bản đồ.", 503, {
      dbErrorCode: firstError.code,
      dbErrorMessage: firstError.message,
    });
  }

  const parsedPosts = localPostSchema.array().safeParse(postsRes.data ?? []);
  const parsedCommunities = communitySchema
    .array()
    .safeParse(communitiesRes.data ?? []);
  const parsedActivities = signalSchema
    .array()
    .safeParse(activitiesRes.data ?? []);
  const rawPlaces = (placesRes.data ?? [])
    .filter((place) => !hosted || !isKnownFixturePlace(place.id))
    .map((place) => ({
      ...place,
      data_origin: isKnownFixturePlace(place.id)
        ? ("fixture" as const)
        : ("real" as const),
    }));
  const parsedPlaces = socialMapPlaceSchema.array().safeParse(rawPlaces);

  if (
    !parsedPosts.success ||
    !parsedCommunities.success ||
    !parsedActivities.success ||
    !parsedPlaces.success
  ) {
    return failure("Dữ liệu bản đồ xã hội chưa đúng định dạng.", 502);
  }

  // Legacy discovery RPCs intentionally remain fixture-friendly for local/CI.
  // Hosted product boundaries remove direct fixture-backed social inventory.
  const posts = parsedPosts.data.filter(
    (post) => !hosted || !post.place_id || !isKnownFixturePlace(post.place_id),
  );
  const communities = parsedCommunities.data.filter(
    (community) =>
      !hosted ||
      !community.place_id ||
      !isKnownFixturePlace(community.place_id),
  );
  const activities = parsedActivities.data.filter(
    (activity) => !hosted || !isKnownFixturePlace(activity.place_id),
  );
  const places = parsedPlaces.data;

  const entities: SocialMapEntity[] = [
    ...posts.map((post) => ({
      id: post.id,
      kind: "local_post" as const,
      title: post.body.length > 72 ? `${post.body.slice(0, 69)}…` : post.body,
      subtitle: `${post.author.display_name} · ${post.place_name || post.area}`,
      area: post.area,
      longitude: post.longitude,
      latitude: post.latitude,
      href: `/?post=${post.id}`,
      freshness: post.created_at,
      trust_state: null,
    })),
    ...communities.map((community) => ({
      id: community.id,
      kind: "community" as const,
      title: community.name,
      subtitle: `${community.member_count} thành viên · ${community.place_name || community.area}`,
      area: community.area,
      longitude: community.longitude,
      latitude: community.latitude,
      href: `/c/${community.id}`,
      freshness: community.created_at,
      trust_state: null,
    })),
    ...activities.map((activity) => ({
      id: activity.id,
      kind: "activity" as const,
      title: activity.title,
      subtitle: `${activity.place_name} · ${activity.source_label}`,
      area: activity.area,
      longitude: activity.longitude,
      latitude: activity.latitude,
      href: `/s/${activity.id}`,
      freshness: activity.starts_at,
      trust_state: activity.confidence,
    })),
    ...places.map((place) => ({
      id: place.id,
      kind: "place" as const,
      title: place.name,
      subtitle: place.area,
      area: place.area,
      longitude: place.longitude,
      latitude: place.latitude,
      href: `/p/${place.id}`,
      freshness: null,
      trust_state: null,
    })),
  ];

  return ok({
    mode: "live",
    posts,
    communities,
    activities,
    places,
    entities,
    counts: {
      local_post: posts.length,
      community: communities.length,
      activity: activities.length,
      place: places.length,
    },
  });
}
