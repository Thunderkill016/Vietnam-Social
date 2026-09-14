"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Activity,
  Compass,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Plus,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { HCMC_CITY, type Bounds, type CityConfig } from "@/lib/domain";
import { LOCAL_POST_TYPES, type LocalPost } from "@/lib/social";
import { type Community } from "@/lib/community";
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
import styles from "./social-explore.module.css";

const DEFAULT_BOUNDS: Bounds = {
  west: 106.62,
  south: 10.77,
  east: 106.73,
  north: 10.86,
  city_id: HCMC_CITY.id,
};

const FILTER_LABELS: Record<SocialMapFilter, string> = {
  all: "Tất cả",
  local_post: "Bài địa phương",
  community: "Cộng đồng",
  activity: "Hoạt động",
  place: "Địa điểm",
};

type ApiError = { error?: string };

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

export function UnifiedSocialExplore() {
  const [city, setCity] = useState<CityConfig>(HCMC_CITY);
  const [bounds, setBounds] = useState<Bounds>(DEFAULT_BOUNDS);
  const [filter, setFilter] = useState<SocialMapFilter>("all");
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
    const id = new URLSearchParams(window.location.search).get("post");
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
          {
            signal,
          },
        );
        if (current !== requestVersion.current) return;
        const parsed = unifiedSocialMapResponseSchema.safeParse(result);
        if (!parsed.success)
          throw new Error("Dữ liệu bản đồ xã hội chưa đúng định dạng.");
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

  const visibleEntities = useMemo(
    () =>
      filter === "all"
        ? data.entities
        : data.entities.filter((entity) => entity.kind === filter),
    [data.entities, filter],
  );

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

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <div className={styles.brand}>Vietnam Social</div>
          <div className={styles.tagline}>
            Bản đồ sống về con người và cộng đồng Việt Nam
          </div>
        </div>
        <nav className={styles.nav} aria-label="Điều hướng chính">
          <Link href="/" className={`${styles.navLink} ${styles.navActive}`}>
            Xã hội
          </Link>
          <Link href="/activities" className={styles.navLink}>
            <Activity size={16} /> Hoạt động
          </Link>
          <Link href="/following" className={styles.navLink}>
            Đang theo dõi
          </Link>
          <Link href="/contribute" className={styles.ghostButton}>
            <Plus size={16} /> Đóng góp
          </Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>
            <Sparkles size={15} /> UNIFIED SOCIAL MAP
          </span>
          <h1>Ở đây đang có chuyện gì?</h1>
          <p>
            Một bản đồ cho bài đăng địa phương, cộng đồng, hoạt động và những
            nơi đang có đời sống xã hội quanh TP. Hồ Chí Minh.
          </p>
        </div>
        <div className={styles.legend}>
          <span>
            <b>•</b> Bài
          </span>
          <span>
            <b>C</b> Cộng đồng
          </span>
          <span>
            <b>A</b> Hoạt động
          </span>
          <span>
            <b>P</b> Địa điểm
          </span>
        </div>
      </section>

      {data.mode === "demo" && (
        <div className={styles.demoBanner}>
          Bản demo không bịa hoạt động xã hội để lấp bản đồ.
        </div>
      )}
      {error && <div className={styles.errorBanner}>{error}</div>}

      <div
        className={styles.scopeSwitch}
        role="group"
        aria-label="Lọc lớp xã hội"
      >
        {SOCIAL_MAP_FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={filter === item}
            className={filter === item ? styles.scopeActive : ""}
            onClick={() => selectFilter(item)}
          >
            {FILTER_LABELS[item]}
            {item !== "all" && ` (${data.counts[item]})`}
          </button>
        ))}
      </div>

      <section className={styles.workspace}>
        <div className={styles.mapColumn}>
          <UnifiedSocialMap
            entities={visibleEntities}
            selectedKey={selected ? entityKey(selected) : undefined}
            onSelect={selectEntity}
            onBounds={setBounds}
            city={city}
            initialBounds={bounds}
          />
        </div>

        <aside
          className={styles.feed}
          aria-label="Đời sống xã hội trong vùng bản đồ"
        >
          <div className={styles.feedHeader}>
            <div>
              <strong>Đời sống quanh đây</strong>
              <span>
                {data.counts.local_post} bài · {data.counts.community} cộng đồng
                · {data.counts.activity} hoạt động · {data.counts.place} địa
                điểm
              </span>
            </div>
            {loading && <LoaderCircle className={styles.spin} size={18} />}
          </div>

          {selected && (
            <section
              className={styles.postCard}
              aria-label="Đối tượng đang chọn"
            >
              <div className={styles.postMeta}>
                <span className={styles.typeChip}>
                  {FILTER_LABELS[selected.kind]}
                </span>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label="Bỏ chọn"
                >
                  <X size={15} />
                </button>
              </div>
              <strong>{selected.title}</strong>
              <p>{selected.subtitle}</p>
              <div className={styles.postFooter}>
                <span>
                  <MapPin size={14} /> {selected.area}
                </span>
              </div>

              {selectedPost && (
                <>
                  <p>{selectedPost.body}</p>
                  <Link
                    className={styles.navLink}
                    href={`/u/${selectedPost.author.id}`}
                  >
                    {selectedPost.author.display_name}
                  </Link>
                  <Link
                    className={styles.primaryButton}
                    href={`/contribute?post=${selectedPost.id}`}
                  >
                    <MessageCircle size={16} /> Mở thảo luận
                  </Link>
                </>
              )}
              {selectedCommunity && (
                <>
                  <p>
                    {selectedCommunity.description || "Cộng đồng địa phương"}
                  </p>
                  <Link
                    className={styles.primaryButton}
                    href={`/c/${selectedCommunity.id}`}
                  >
                    <Users size={16} /> Vào cộng đồng
                  </Link>
                </>
              )}
              {selectedActivity && (
                <>
                  <p>{selectedActivity.description}</p>
                  <Link
                    className={styles.primaryButton}
                    href={`/s/${selectedActivity.id}`}
                  >
                    <Activity size={16} /> Xem & tham gia
                  </Link>
                </>
              )}
              {selectedPlace && (
                <Link
                  className={styles.primaryButton}
                  href={`/p/${selectedPlace.id}`}
                >
                  <MapPin size={16} /> Mở Social Place
                </Link>
              )}
            </section>
          )}

          {!loading && visibleEntities.length === 0 ? (
            <div className={styles.emptyState}>
              <Compass size={30} />
              <strong>
                Chưa có dữ liệu thật cho lớp này trong vùng bản đồ.
              </strong>
              <p>
                Vietnam Social giữ trạng thái trống trung thực thay vì tạo hoạt
                động giả.
              </p>
              <Link className={styles.primaryButton} href="/contribute">
                Đóng góp đầu tiên
              </Link>
            </div>
          ) : (
            visibleEntities.map((entity) => (
              <button
                type="button"
                key={entityKey(entity)}
                className={styles.postCard}
                onClick={() => selectEntity(entity)}
              >
                <div className={styles.postMeta}>
                  <span className={styles.typeChip}>
                    {FILTER_LABELS[entity.kind]}
                  </span>
                  <span>{entity.trust_state || entity.area}</span>
                </div>
                <strong>{entity.title}</strong>
                <p>{entity.subtitle}</p>
                <div className={styles.postFooter}>
                  <span>
                    <MapPin size={14} /> {entity.area}
                  </span>
                </div>
              </button>
            ))
          )}
        </aside>
      </section>

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
          <Dialog.Content className={`${styles.modal} ${styles.detailModal}`}>
            <Dialog.Close className={styles.close} aria-label="Đóng">
              <X />
            </Dialog.Close>
            {deepLinkedPost && (
              <>
                <Dialog.Title className={styles.modalTitle}>
                  {LOCAL_POST_TYPES[deepLinkedPost.post_type]}
                </Dialog.Title>
                <Dialog.Description className={styles.postMeta}>
                  {deepLinkedPost.author.display_name} · {deepLinkedPost.area}
                </Dialog.Description>
                <p>{deepLinkedPost.body}</p>
                {deepLinkedPost.place_id && (
                  <Link
                    className={styles.navLink}
                    href={`/p/${deepLinkedPost.place_id}`}
                  >
                    <MapPin size={15} /> Xem địa điểm{" "}
                    {deepLinkedPost.place_name}
                  </Link>
                )}
                <Link
                  className={styles.primaryButton}
                  href={`/contribute?post=${deepLinkedPost.id}`}
                >
                  <MessageCircle size={16} /> Mở thảo luận
                </Link>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}
