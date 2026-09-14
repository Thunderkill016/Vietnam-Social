"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Activity,
  Compass,
  Heart,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Plus,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import {
  CATEGORIES,
  CONFIDENCE_LABELS,
  HCMC_CITY,
  timeLabel,
  type Bounds,
  type CityConfig,
} from "@/lib/domain";
import { LOCAL_POST_TYPES, localPostAge, type LocalPost } from "@/lib/social";
import { COMMUNITY_CATEGORIES, type Community } from "@/lib/community";
import { trackEvent } from "@/lib/analytics";
import {
  SOCIAL_MAP_FILTERS,
  unifiedSocialMapResponseSchema,
  type SocialMapEntity,
  type SocialMapFilter,
  type UnifiedSocialMapResponse,
} from "@/lib/social-map";
import { browserSupabase } from "@/lib/supabase";
import { UnifiedSocialMap } from "./unified-social-map";
import styles from "./vietnam-social-v1.module.css";

const DEFAULT_BOUNDS: Bounds = {
  west: 106.62,
  south: 10.77,
  east: 106.73,
  north: 10.86,
  city_id: HCMC_CITY.id,
};

const FILTER_LABELS: Record<SocialMapFilter, string> = {
  all: "Quanh đây",
  local_post: "Bài viết",
  community: "Cộng đồng",
  activity: "Hoạt động",
  place: "Địa điểm",
};

const FILTER_ICONS = {
  all: Compass,
  local_post: MessageCircle,
  community: Users,
  activity: Activity,
  place: MapPin,
} satisfies Record<SocialMapFilter, typeof Compass>;

type ApiError = { error?: string };

type UnifiedSocialExploreProps = {
  initialFilter?: SocialMapFilter;
};

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const db = browserSupabase();
  const session = db ? (await db.auth.getSession()).data.session : null;
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...init.headers,
    },
  });
  const body = (await response.json()) as ApiError & T;
  if (!response.ok) {
    throw new Error(body.error || "Có lỗi kết nối. Vui lòng thử lại.");
  }
  return body;
}

function entityKey(entity: SocialMapEntity) {
  return `${entity.kind}:${entity.id}`;
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function initials(value: string) {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return "VS";
  return tokens
    .slice(-2)
    .map((token) => token[0]?.toUpperCase())
    .join("");
}

function specificOpenEvent(entity: SocialMapEntity) {
  const common = {
    city_id: HCMC_CITY.id,
    subject_type: entity.kind,
    subject_id: entity.id,
  } as const;
  switch (entity.kind) {
    case "local_post":
      return {
        ...common,
        type: "local_post_opened" as const,
        subject_type: "local_post" as const,
      };
    case "community":
      return {
        ...common,
        type: "community_opened" as const,
        subject_type: "community" as const,
      };
    case "place":
      return {
        ...common,
        type: "place_opened" as const,
        subject_type: "place" as const,
      };
    case "activity":
      return null;
  }
}

export function UnifiedSocialExplore({
  initialFilter = "all",
}: UnifiedSocialExploreProps = {}) {
  const [city, setCity] = useState<CityConfig>(HCMC_CITY);
  const [bounds, setBounds] = useState<Bounds>(DEFAULT_BOUNDS);
  const [filter, setFilter] = useState<SocialMapFilter>(initialFilter);
  const [query, setQuery] = useState("");
  const [data, setData] = useState<UnifiedSocialMapResponse>({
    mode: "demo",
    posts: [],
    communities: [],
    activities: [],
    places: [],
    entities: [],
    counts: { local_post: 0, community: 0, activity: 0, place: 0 },
  });
  const [selected, setSelected] = useState<SocialMapEntity | null>(null);
  const [deepLinkedPost, setDeepLinkedPost] = useState<LocalPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestVersion = useRef(0);
  const impressions = useRef(new Set<string>());
  const opened = useRef(false);

  useEffect(() => {
    void api<{ city?: CityConfig }>("/api/bootstrap")
      .then((result) => result.city && setCity(result.city))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedLayer = params.get("layer") as SocialMapFilter | null;
    if (
      requestedLayer &&
      SOCIAL_MAP_FILTERS.includes(requestedLayer as SocialMapFilter)
    ) {
      setFilter(requestedLayer);
    }

    const id = params.get("post");
    if (!id) return;
    let active = true;
    void api<{ post: LocalPost }>(`/api/posts/${id}`)
      .then((result) => {
        if (active) setDeepLinkedPost(result.post);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const loadMap = useCallback(
    async (signal?: AbortSignal) => {
      const current = ++requestVersion.current;
      const params = new URLSearchParams(
        Object.entries(bounds).map(([key, value]) => [key, String(value)]),
      );
      try {
        setLoading(true);
        const result = await api<UnifiedSocialMapResponse>(
          `/api/map?${params}`,
          { signal },
        );
        if (current !== requestVersion.current) return;
        const parsed = unifiedSocialMapResponseSchema.safeParse(result);
        if (!parsed.success) {
          throw new Error("Dữ liệu quanh khu vực này chưa đúng định dạng.");
        }
        setData(parsed.data);
        setError("");
      } catch (reason) {
        if (signal?.aborted || current !== requestVersion.current) return;
        setError((reason as Error).message);
      } finally {
        if (current === requestVersion.current) setLoading(false);
      }
    },
    [bounds],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadMap(controller.signal), 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadMap]);

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    trackEvent({ type: "map_opened", city_id: city.id });
  }, [city.id]);

  useEffect(() => {
    trackEvent({ type: "map_viewport_changed", city_id: city.id });
  }, [bounds, city.id]);

  const visibleEntities = useMemo(() => {
    const search = normalizeText(query.trim());
    return data.entities
      .filter((entity) => filter === "all" || entity.kind === filter)
      .filter(
        (entity) =>
          !search ||
          normalizeText(
            `${entity.title} ${entity.subtitle} ${entity.area}`,
          ).includes(search),
      )
      .slice()
      .sort((a, b) => {
        const aTime = a.freshness ? Date.parse(a.freshness) : 0;
        const bTime = b.freshness ? Date.parse(b.freshness) : 0;
        return bTime - aTime;
      });
  }, [data.entities, filter, query]);

  useEffect(() => {
    for (const entity of visibleEntities.slice(0, 40)) {
      const key = entityKey(entity);
      if (impressions.current.has(key)) continue;
      impressions.current.add(key);
      trackEvent({
        type: "map_entity_impression",
        city_id: city.id,
        subject_type: entity.kind,
        subject_id: entity.id,
      });
    }
  }, [visibleEntities, city.id]);

  const selectFilter = (next: SocialMapFilter) => {
    setFilter(next);
    setSelected(null);
    trackEvent({ type: "map_filter_changed", city_id: city.id, filter: next });

    const url = new URL(window.location.href);
    if (window.location.pathname === "/activities" && next !== "activity") {
      url.pathname = "/";
    }
    if (next === "all") url.searchParams.delete("layer");
    else url.searchParams.set("layer", next);
    window.history.replaceState({}, "", url);
  };

  const selectEntity = (entity: SocialMapEntity) => {
    setSelected(entity);
    trackEvent({
      type: "map_entity_opened",
      city_id: city.id,
      subject_type: entity.kind,
      subject_id: entity.id,
    });
    const specific = specificOpenEvent(entity);
    if (specific) trackEvent(specific);
  };

  const selectedPost: LocalPost | undefined =
    selected?.kind === "local_post"
      ? data.posts.find((post) => post.id === selected.id)
      : undefined;
  const selectedCommunity: Community | undefined =
    selected?.kind === "community"
      ? data.communities.find((community) => community.id === selected.id)
      : undefined;
  const selectedActivity =
    selected?.kind === "activity"
      ? data.activities.find((activity) => activity.id === selected.id)
      : undefined;
  const selectedPlace =
    selected?.kind === "place"
      ? data.places.find((place) => place.id === selected.id)
      : undefined;

  const renderCard = (entity: SocialMapEntity) => {
    if (entity.kind === "local_post") {
      const post = data.posts.find((item) => item.id === entity.id);
      if (!post) return null;
      return (
        <article className={styles.socialCard} key={entityKey(entity)}>
          <button
            type="button"
            className={styles.cardButton}
            onClick={() => selectEntity(entity)}
          >
            <div className={styles.cardBody}>
              <div className={styles.identityRow}>
                <span className={styles.avatar} aria-hidden="true">
                  {initials(post.author.display_name)}
                </span>
                <span className={styles.identityText}>
                  <strong>{post.author.display_name}</strong>
                  <span>
                    {localPostAge(post.created_at)} · {post.area}
                  </span>
                </span>
              </div>
              <span className={styles.kindBadge}>
                <MessageCircle size={12} /> {LOCAL_POST_TYPES[post.post_type]}
              </span>
              <p className={styles.cardText}>{post.body}</p>
              <div className={styles.cardMeta}>
                <span className={styles.metaItem}>
                  <Heart size={13} /> {post.reaction_count}
                </span>
                <span className={styles.metaItem}>
                  <MessageCircle size={13} /> {post.comment_count} trả lời
                </span>
                {post.community && (
                  <span className={styles.metaItem}>
                    <Users size={13} /> {post.community.name}
                  </span>
                )}
              </div>
            </div>
          </button>
        </article>
      );
    }

    if (entity.kind === "community") {
      const community = data.communities.find((item) => item.id === entity.id);
      if (!community) return null;
      return (
        <article className={styles.socialCard} key={entityKey(entity)}>
          <button
            type="button"
            className={styles.cardButton}
            onClick={() => selectEntity(entity)}
          >
            <div className={styles.cardBody}>
              <div className={styles.identityRow}>
                <span className={styles.avatar} aria-hidden="true">
                  {initials(community.creator.display_name)}
                </span>
                <span className={styles.identityText}>
                  <strong>{community.creator.display_name}</strong>
                  <span>đang xây cộng đồng · {community.area}</span>
                </span>
              </div>
              <span className={styles.kindBadge}>
                <Users size={12} /> {COMMUNITY_CATEGORIES[community.category]}
              </span>
              <h3 className={styles.cardTitle}>{community.name}</h3>
              <p className={styles.cardText}>
                {community.description ||
                  "Một cộng đồng địa phương đang kết nối những người có cùng mối quan tâm."}
              </p>
              <div className={styles.cardMeta}>
                <span className={styles.metaItem}>
                  <Users size={13} /> {community.member_count} thành viên
                </span>
                <span className={styles.metaItem}>
                  <MapPin size={13} /> {community.place_name || community.area}
                </span>
              </div>
            </div>
          </button>
        </article>
      );
    }

    if (entity.kind === "activity") {
      const activity = data.activities.find((item) => item.id === entity.id);
      if (!activity) return null;
      return (
        <article className={styles.socialCard} key={entityKey(entity)}>
          <button
            type="button"
            className={styles.cardButton}
            onClick={() => selectEntity(entity)}
          >
            <div className={styles.cardBody}>
              <div className={styles.identityRow}>
                <span
                  className={styles.entityAvatar}
                  data-kind="activity"
                  aria-hidden="true"
                >
                  <Activity size={18} />
                </span>
                <span className={styles.identityText}>
                  <strong>{activity.source_label}</strong>
                  <span>
                    {timeLabel(activity.starts_at)} · {activity.area}
                  </span>
                </span>
              </div>
              <span className={styles.kindBadge}>
                <Activity size={12} /> {CATEGORIES[activity.category].label}
              </span>
              <h3 className={styles.cardTitle}>{activity.title}</h3>
              {activity.description && (
                <p className={styles.cardText}>{activity.description}</p>
              )}
              <div className={styles.cardMeta}>
                <span className={styles.metaItem}>
                  <MapPin size={13} /> {activity.place_name}
                </span>
                <span className={styles.metaItem}>
                  {CONFIDENCE_LABELS[activity.confidence]}
                </span>
              </div>
            </div>
          </button>
        </article>
      );
    }

    const place = data.places.find((item) => item.id === entity.id);
    if (!place) return null;
    return (
      <article className={styles.socialCard} key={entityKey(entity)}>
        <button
          type="button"
          className={styles.cardButton}
          onClick={() => selectEntity(entity)}
        >
          <div className={styles.cardBody}>
            <div className={styles.identityRow}>
              <span
                className={styles.entityAvatar}
                data-kind="place"
                aria-hidden="true"
              >
                <MapPin size={18} />
              </span>
              <span className={styles.identityText}>
                <strong>{place.name}</strong>
                <span>{place.area}</span>
              </span>
            </div>
            <h3 className={styles.cardTitle}>{place.name}</h3>
            <p className={styles.cardText}>
              Mở địa điểm để xem bài viết, cộng đồng và hoạt động gắn với nơi
              này.
            </p>
          </div>
        </button>
      </article>
    );
  };

  return (
    <div className={styles.app}>
      <header className={styles.appHeader}>
        <Link href="/" className={styles.brandLink}>
          <span className={styles.brandMark}>V</span>
          <span className={styles.brandText}>
            <strong>Vietnam Social</strong>
            <span>Bản đồ sống của cộng đồng Việt Nam</span>
          </span>
        </Link>

        <label className={styles.searchBox}>
          <Search size={17} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm bài viết, cộng đồng, hoạt động, khu vực..."
            aria-label="Tìm trong vùng bản đồ"
          />
        </label>

        <nav className={styles.topNav} aria-label="Điều hướng chính">
          <Link href="/" className={styles.navLink}>
            Khám phá
          </Link>
          <Link href="/activities/manage" className={styles.navLink}>
            <Activity size={15} /> Tổ chức hoạt động
          </Link>
          <Link href="/following" className={styles.secondaryAction}>
            Đang theo dõi
          </Link>
          <Link href="/contribute" className={styles.primaryAction}>
            <Plus size={16} /> <span>Chia sẻ</span>
          </Link>
        </nav>
      </header>

      {data.mode === "demo" && (
        <div className={styles.demoBanner}>
          Bản xem trước không tạo người, bài viết hay hoạt động giả để lấp bản
          đồ.
        </div>
      )}
      {error && <div className={styles.errorBanner}>{error}</div>}

      <main className={styles.shell}>
        <aside className={styles.leftRail} aria-label="Khám phá theo loại">
          <section className={styles.railIntro}>
            <span className={styles.railEyebrow}>
              <MapPin size={13} /> {city.name}
            </span>
            <h1>Khám phá quanh đây</h1>
            <p>
              Câu chuyện, cộng đồng và những cuộc gặp đang tạo nên đời sống của
              từng khu vực.
            </p>
          </section>

          <nav className={styles.layerNav} aria-label="Nội dung quanh đây">
            {SOCIAL_MAP_FILTERS.map((item) => {
              const Icon = FILTER_ICONS[item];
              const count =
                item === "all" ? data.entities.length : data.counts[item];
              return (
                <button
                  key={item}
                  type="button"
                  aria-pressed={filter === item}
                  className={`${styles.layerButton} ${filter === item ? styles.layerButtonActive : ""}`}
                  onClick={() => selectFilter(item)}
                >
                  <span className={styles.layerIcon}>
                    <Icon size={16} />
                  </span>
                  <span>{FILTER_LABELS[item]}</span>
                  <span className={styles.layerCount}>{count}</span>
                </button>
              );
            })}
          </nav>

          <section className={styles.railCard}>
            <strong>Đây là mạng xã hội địa phương.</strong>
            <p>
              Chia sẻ một câu hỏi, câu chuyện hoặc hoạt động thật để người quanh
              khu vực có thể tìm thấy và tham gia.
            </p>
            <Link href="/contribute" className={styles.primaryAction}>
              <Plus size={15} /> <span>Chia sẻ với khu vực này</span>
            </Link>
          </section>

          <p className={styles.privacyNote}>
            <ShieldCheck size={14} />
            Vietnam Social không hiển thị vị trí trực tiếp của người dùng trên
            bản đồ công khai.
          </p>
        </aside>

        <section className={styles.mapStage} aria-label="Bản đồ xã hội">
          <UnifiedSocialMap
            entities={visibleEntities}
            selectedKey={selected ? entityKey(selected) : undefined}
            onSelect={selectEntity}
            onBounds={setBounds}
            city={city}
            initialBounds={bounds}
          />
        </section>

        <aside className={styles.streamPanel} aria-label="Đời sống quanh đây">
          <header className={styles.streamHeader}>
            <span className={styles.streamHeaderText}>
              <strong>
                {query ? `Kết quả cho “${query}”` : FILTER_LABELS[filter]}
              </strong>
              <span>
                {visibleEntities.length
                  ? `${visibleEntities.length} nội dung trong vùng bản đồ`
                  : "Di chuyển bản đồ để khám phá khu vực khác"}
              </span>
            </span>
            {loading && (
              <LoaderCircle className={styles.loadingIcon} size={18} />
            )}
          </header>

          <div className={styles.stream}>
            {selected && (
              <section
                className={styles.selectedCard}
                aria-label="Nội dung đang chọn"
              >
                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={() => setSelected(null)}
                  aria-label="Đóng nội dung đang chọn"
                >
                  <X size={15} />
                </button>
                <span className={styles.kindBadge}>
                  {FILTER_LABELS[selected.kind]}
                </span>
                <h2>{selected.title}</h2>
                <div className={styles.cardMeta}>
                  <span className={styles.metaItem}>
                    <MapPin size={13} /> {selected.area}
                  </span>
                </div>

                {selectedPost && (
                  <>
                    <p>{selectedPost.body}</p>
                    <div className={styles.detailActions}>
                      <Link
                        className={styles.secondaryAction}
                        href={`/u/${selectedPost.author.id}`}
                      >
                        {selectedPost.author.display_name}
                      </Link>
                      <Link
                        className={styles.primaryAction}
                        href={`/contribute?post=${selectedPost.id}`}
                      >
                        <MessageCircle size={15} /> Thảo luận
                      </Link>
                    </div>
                  </>
                )}

                {selectedCommunity && (
                  <>
                    <p>
                      {selectedCommunity.description ||
                        "Cộng đồng địa phương đang kết nối những người có cùng mối quan tâm."}
                    </p>
                    <div className={styles.detailActions}>
                      <Link
                        className={styles.primaryAction}
                        href={`/c/${selectedCommunity.id}`}
                      >
                        <Users size={15} /> Vào cộng đồng
                      </Link>
                    </div>
                  </>
                )}

                {selectedActivity && (
                  <>
                    <p>{selectedActivity.description}</p>
                    <div className={styles.detailActions}>
                      <Link
                        className={styles.primaryAction}
                        href={`/s/${selectedActivity.id}`}
                      >
                        <Activity size={15} /> Xem & tham gia
                      </Link>
                    </div>
                  </>
                )}

                {selectedPlace && (
                  <>
                    <p>
                      Xem những câu chuyện, cộng đồng và hoạt động gắn với địa
                      điểm này.
                    </p>
                    <div className={styles.detailActions}>
                      <Link
                        className={styles.primaryAction}
                        href={`/p/${selectedPlace.id}`}
                      >
                        <MapPin size={15} /> Mở địa điểm
                      </Link>
                    </div>
                  </>
                )}
              </section>
            )}

            {!loading && visibleEntities.length === 0 ? (
              <div className={styles.emptyState}>
                <Compass size={28} />
                <strong>Chưa có câu chuyện nào ở vùng này.</strong>
                <p>
                  Một mạng xã hội địa phương chỉ có ý nghĩa khi nội dung đến từ
                  người thật. Hãy là người mở đầu cho khu vực này.
                </p>
                <Link className={styles.primaryAction} href="/contribute">
                  <Plus size={15} /> Chia sẻ đầu tiên
                </Link>
              </div>
            ) : (
              visibleEntities.map(renderCard)
            )}
          </div>
        </aside>
      </main>

      <Dialog.Root
        open={Boolean(deepLinkedPost)}
        onOpenChange={(open) => {
          if (open) return;
          setDeepLinkedPost(null);
          const url = new URL(window.location.href);
          url.searchParams.delete("post");
          window.history.replaceState({}, "", url);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content className={styles.modal}>
            <Dialog.Close className={styles.closeButton} aria-label="Đóng">
              <X size={16} />
            </Dialog.Close>
            {deepLinkedPost && (
              <>
                <Dialog.Title className={styles.modalTitle}>
                  {LOCAL_POST_TYPES[deepLinkedPost.post_type]}
                </Dialog.Title>
                <Dialog.Description className={styles.modalMeta}>
                  {deepLinkedPost.author.display_name} · {deepLinkedPost.area} ·{" "}
                  {localPostAge(deepLinkedPost.created_at)}
                </Dialog.Description>
                <p className={styles.modalBody}>{deepLinkedPost.body}</p>
                <div className={styles.detailActions}>
                  {deepLinkedPost.place_id && (
                    <Link
                      className={styles.secondaryAction}
                      href={`/p/${deepLinkedPost.place_id}`}
                    >
                      <MapPin size={15} /> {deepLinkedPost.place_name}
                    </Link>
                  )}
                  <Link
                    className={styles.primaryAction}
                    href={`/contribute?post=${deepLinkedPost.id}`}
                  >
                    <MessageCircle size={15} /> Mở thảo luận
                  </Link>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
