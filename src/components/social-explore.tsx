"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Activity,
  Flag,
  Heart,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Plus,
  Send,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import {
  HCMC_CITY,
  type Bounds,
  type CityConfig,
  type Place,
  type Viewer,
} from "@/lib/domain";
import {
  LOCAL_POST_TYPES,
  localPostAge,
  type LocalComment,
  type LocalPost,
  type LocalPostType,
} from "@/lib/social";
import { browserSupabase } from "@/lib/supabase";
import styles from "./social-explore.module.css";

const SocialMap = dynamic(
  () => import("./social-map").then((m) => m.SocialMap),
  {
    ssr: false,
    loading: () => (
      <div className={styles.mapStatus}>Đang mở bản đồ xã hội…</div>
    ),
  },
);

type ApiErrorBody = { error?: string };

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
  const body = (await response.json()) as ApiErrorBody & T;
  if (!response.ok)
    throw new Error(body.error || "Có lỗi kết nối. Vui lòng thử lại.");
  return body;
}

const DEFAULT_BOUNDS: Bounds = {
  west: 106.62,
  south: 10.77,
  east: 106.73,
  north: 10.86,
  city_id: HCMC_CITY.id,
};

export function SocialExplore() {
  const [city, setCity] = useState<CityConfig>(HCMC_CITY);
  const [places, setPlaces] = useState<Place[]>([]);
  const [posts, setPosts] = useState<LocalPost[]>([]);
  const [bounds, setBounds] = useState<Bounds>(DEFAULT_BOUNDS);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [mode, setMode] = useState<"demo" | "live">("demo");
  const [selected, setSelected] = useState<LocalPost | null>(null);
  const [comments, setComments] = useState<LocalComment[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [postType, setPostType] = useState<LocalPostType>("question");
  const [postBody, setPostBody] = useState("");
  const [scope, setScope] = useState<"place" | "area">("area");
  const [placeId, setPlaceId] = useState("");
  const [area, setArea] = useState("");

  const areas = useMemo(
    () =>
      Array.from(new Set(places.map((place) => place.area)))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "vi")),
    [places],
  );

  const loadBootstrap = useCallback(async () => {
    try {
      const result = await api<{
        mode: "demo" | "live";
        city: CityConfig;
        places: Place[];
      }>("/api/bootstrap");
      setMode(result.mode);
      setCity(result.city);
      setPlaces(result.places);
      if (!area && result.places[0]?.area) setArea(result.places[0].area);
      if (!placeId && result.places[0]?.id) setPlaceId(result.places[0].id);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [area, placeId]);

  const loadViewer = useCallback(async () => {
    const db = browserSupabase();
    if (!db) {
      setViewer(null);
      return;
    }
    const session = (await db.auth.getSession()).data.session;
    if (!session) {
      setViewer(null);
      return;
    }
    try {
      const result = await api<{ viewer: Viewer | null }>("/api/auth/me");
      setViewer(result.viewer);
    } catch {
      setViewer(null);
    }
  }, []);

  const loadPosts = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams(
        Object.entries(bounds).map(([key, value]) => [key, String(value)]),
      );
      const result = await api<{ mode: "demo" | "live"; posts: LocalPost[] }>(
        `/api/posts?${params}`,
      );
      setMode(result.mode);
      setPosts(result.posts);
      setError("");
    } catch (e) {
      setPosts([]);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [bounds]);

  useEffect(() => {
    void loadBootstrap();
    void loadViewer();
  }, [loadBootstrap, loadViewer]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    const db = browserSupabase();
    if (!db) return;
    const { data } = db.auth.onAuthStateChange(() => void loadViewer());
    return () => data.subscription.unsubscribe();
  }, [loadViewer]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("post");
    if (!id || mode !== "live") return;
    void api<{ post: LocalPost; comments: LocalComment[] }>(`/api/posts/${id}`)
      .then((result) => {
        setSelected(result.post);
        setComments(result.comments);
      })
      .catch(() => undefined);
  }, [mode]);

  const signIn = async () => {
    const db = browserSupabase();
    if (!db) {
      setNotice(
        "Bản demo không có đăng nhập. Kết nối Supabase để dùng mạng xã hội thật.",
      );
      return;
    }
    await db.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  const signOut = async () => {
    const db = browserSupabase();
    if (db) await db.auth.signOut();
    setViewer(null);
  };

  const openPost = async (post: LocalPost) => {
    setSelected(post);
    setComments([]);
    if (mode !== "live") return;
    try {
      const result = await api<{ post: LocalPost; comments: LocalComment[] }>(
        `/api/posts/${post.id}`,
      );
      setSelected(result.post);
      setComments(result.comments);
    } catch (e) {
      setNotice((e as Error).message);
    }
  };

  const refreshSelected = async () => {
    if (!selected || mode !== "live") return;
    const result = await api<{ post: LocalPost; comments: LocalComment[] }>(
      `/api/posts/${selected.id}`,
    );
    setSelected(result.post);
    setComments(result.comments);
    setPosts((current) =>
      current.map((post) => (post.id === result.post.id ? result.post : post)),
    );
  };

  const interact = async (action: "react" | "report" | "comment") => {
    if (!selected) return;
    if (!viewer) {
      await signIn();
      return;
    }
    try {
      setPending(true);
      await api(`/api/posts/${selected.id}`, {
        method: "POST",
        body: JSON.stringify({
          action,
          ...(action === "comment" ? { body: commentBody } : {}),
          ...(action === "report"
            ? { reason: "Báo cáo từ giao diện bài địa phương" }
            : {}),
        }),
      });
      if (action === "comment") setCommentBody("");
      setNotice(
        action === "report"
          ? "Đã gửi báo cáo để hệ thống xem xét."
          : "Đã lưu tương tác.",
      );
      await refreshSelected();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  const createPost = async () => {
    if (!viewer) {
      await signIn();
      return;
    }
    try {
      setPending(true);
      const payload = {
        request_id: crypto.randomUUID(),
        post_type: postType,
        body: postBody,
        ...(scope === "place" ? { place_id: placeId } : { area }),
      };
      const result = await api<{ id: string }>("/api/posts", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setCreateOpen(false);
      setPostBody("");
      setNotice("Bài địa phương đã xuất hiện trên bản đồ.");
      await loadPosts();
      const detail = await api<{ post: LocalPost; comments: LocalComment[] }>(
        `/api/posts/${result.id}`,
      );
      setSelected(detail.post);
      setComments(detail.comments);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setPending(false);
    }
  };

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
          {viewer ? (
            <>
              <Link href={`/u/${viewer.id}`} className={styles.navLink}>
                <UserRound size={16} /> {viewer.display_name}
              </Link>
              <button
                className={styles.ghostButton}
                onClick={() => void signOut()}
              >
                Đăng xuất
              </button>
            </>
          ) : (
            <button
              className={styles.ghostButton}
              onClick={() => void signIn()}
            >
              Đăng nhập
            </button>
          )}
          <button
            className={styles.primaryButton}
            onClick={() => (viewer ? setCreateOpen(true) : void signIn())}
          >
            <Plus size={17} /> Đăng bài địa phương
          </button>
        </nav>
      </header>

      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>
            <Sparkles size={15} /> MAP-NATIVE SOCIAL
          </span>
          <h1>Ở đây đang có chuyện gì?</h1>
          <p>
            Khám phá câu hỏi, cập nhật và gợi ý gắn với những nơi thật quanh TP.
            Hồ Chí Minh.
          </p>
        </div>
        <div className={styles.legend}>
          <span>
            <b>?</b> Hỏi quanh đây
          </span>
          <span>
            <b>•</b> Cập nhật
          </span>
          <span>
            <b>★</b> Gợi ý
          </span>
        </div>
      </section>

      {mode === "demo" && (
        <div className={styles.demoBanner}>
          Bản demo giữ bản đồ trống thay vì bịa bài đăng hoặc người dùng giả.
        </div>
      )}
      {error && <div className={styles.errorBanner}>{error}</div>}
      {notice && (
        <button className={styles.noticeBanner} onClick={() => setNotice("")}>
          {notice} <X size={14} />
        </button>
      )}

      <section className={styles.workspace}>
        <div className={styles.mapColumn}>
          <SocialMap
            posts={posts}
            selectedId={selected?.id}
            onSelect={(post) => void openPost(post)}
            onBounds={setBounds}
            city={city}
            initialBounds={bounds}
          />
        </div>
        <aside className={styles.feed}>
          <div className={styles.feedHeader}>
            <div>
              <strong>Bài địa phương</strong>
              <span>{posts.length} bài trong vùng bản đồ</span>
            </div>
            {loading && <LoaderCircle className={styles.spin} size={18} />}
          </div>
          {posts.length === 0 && !loading ? (
            <div className={styles.emptyState}>
              <MessageCircle size={30} />
              <strong>Chưa có tiếng nói nào ở vùng này.</strong>
              <p>
                Vietnam Social không tạo nội dung giả để lấp bản đồ. Người dùng
                thật sẽ tạo lớp xã hội này.
              </p>
              <button
                className={styles.primaryButton}
                onClick={() => (viewer ? setCreateOpen(true) : void signIn())}
              >
                Đăng bài đầu tiên
              </button>
            </div>
          ) : (
            posts.map((post) => (
              <button
                key={post.id}
                className={styles.postCard}
                onClick={() => void openPost(post)}
              >
                <div className={styles.postMeta}>
                  <span className={styles.typeChip}>
                    {LOCAL_POST_TYPES[post.post_type]}
                  </span>
                  <span>{localPostAge(post.created_at)}</span>
                </div>
                <strong>{post.author.display_name}</strong>
                <p>{post.body}</p>
                <div className={styles.postFooter}>
                  <span>
                    <MapPin size={14} /> {post.place_name || post.area}
                  </span>
                  <span>
                    <Heart size={14} /> {post.reaction_count}
                  </span>
                  <span>
                    <MessageCircle size={14} /> {post.comment_count}
                  </span>
                </div>
              </button>
            ))
          )}
        </aside>
      </section>

      <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content className={styles.modal}>
            <Dialog.Close className={styles.close} aria-label="Đóng">
              <X />
            </Dialog.Close>
            <Dialog.Title className={styles.modalTitle}>
              Đóng góp vào bản đồ xã hội
            </Dialog.Title>
            <Dialog.Description className={styles.modalDescription}>
              Bài đăng phải gắn với một địa điểm công cộng hoặc khu vực an toàn,
              không phải vị trí sống trực tiếp của bạn.
            </Dialog.Description>
            <div className={styles.formGrid}>
              <label>
                Loại bài
                <select
                  value={postType}
                  onChange={(event) =>
                    setPostType(event.target.value as LocalPostType)
                  }
                >
                  {Object.entries(LOCAL_POST_TYPES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Nội dung
                <textarea
                  value={postBody}
                  onChange={(event) => setPostBody(event.target.value)}
                  maxLength={800}
                  rows={5}
                  placeholder="Ví dụ: Chiều nay khu Nguyễn Huệ đang dựng sân khấu gì vậy?"
                />
                <small>{postBody.length}/800</small>
              </label>
              <div className={styles.scopeSwitch}>
                <button
                  className={scope === "area" ? styles.scopeActive : ""}
                  onClick={() => setScope("area")}
                >
                  Khu vực
                </button>
                <button
                  className={scope === "place" ? styles.scopeActive : ""}
                  onClick={() => setScope("place")}
                >
                  Địa điểm công cộng
                </button>
              </div>
              {scope === "area" ? (
                <label>
                  Khu vực
                  <select
                    value={area}
                    onChange={(event) => setArea(event.target.value)}
                  >
                    {areas.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                  Địa điểm
                  <select
                    value={placeId}
                    onChange={(event) => setPlaceId(event.target.value)}
                  >
                    {places.map((place) => (
                      <option key={place.id} value={place.id}>
                        {place.name} · {place.area}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                className={styles.primaryButton}
                disabled={pending || postBody.trim().length < 8}
                onClick={() => void createPost()}
              >
                {pending ? (
                  <LoaderCircle className={styles.spin} size={17} />
                ) : (
                  <Send size={17} />
                )}{" "}
                Đăng lên bản đồ
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content className={`${styles.modal} ${styles.detailModal}`}>
            <Dialog.Close className={styles.close} aria-label="Đóng">
              <X />
            </Dialog.Close>
            {selected && (
              <>
                <div className={styles.postMeta}>
                  <span className={styles.typeChip}>
                    {LOCAL_POST_TYPES[selected.post_type]}
                  </span>
                  <span>{localPostAge(selected.created_at)}</span>
                </div>
                <Dialog.Title className={styles.modalTitle}>
                  {selected.place_name || selected.area}
                </Dialog.Title>
                <Dialog.Description className={styles.modalDescription}>
                  Bài địa phương tại {selected.area}
                </Dialog.Description>
                <Link
                  className={styles.authorCard}
                  href={`/u/${selected.author.id}`}
                >
                  <span className={styles.avatar}>
                    {selected.author.display_name.slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    <strong>{selected.author.display_name}</strong>
                    <small>
                      {selected.author.role === "host"
                        ? "Host đã xác minh"
                        : "Thành viên địa phương"}
                    </small>
                  </span>
                </Link>
                <p className={styles.detailBody}>{selected.body}</p>
                <div className={styles.actions}>
                  <button
                    className={
                      selected.viewer_reacted ? styles.actionActive : ""
                    }
                    onClick={() => void interact("react")}
                    disabled={pending}
                  >
                    <Heart size={18} /> {selected.reaction_count} Hữu ích
                  </button>
                  <button
                    onClick={() =>
                      document.getElementById("social-comment")?.focus()
                    }
                  >
                    <MessageCircle size={18} /> {selected.comment_count} Bình
                    luận
                  </button>
                  <button
                    disabled={selected.viewer_reported || pending}
                    onClick={() => void interact("report")}
                  >
                    <Flag size={18} />{" "}
                    {selected.viewer_reported ? "Đã báo cáo" : "Báo cáo"}
                  </button>
                </div>
                <div className={styles.comments}>
                  <strong>Thảo luận địa phương</strong>
                  {comments.length === 0 ? (
                    <p className={styles.muted}>Chưa có bình luận.</p>
                  ) : (
                    comments.map((comment) => (
                      <div key={comment.id} className={styles.comment}>
                        <Link href={`/u/${comment.author.id}`}>
                          {comment.author.display_name}
                        </Link>
                        <p>{comment.body}</p>
                        <small>{localPostAge(comment.created_at)}</small>
                      </div>
                    ))
                  )}
                  <div className={styles.commentComposer}>
                    <input
                      id="social-comment"
                      value={commentBody}
                      onChange={(event) => setCommentBody(event.target.value)}
                      maxLength={500}
                      placeholder={
                        viewer ? "Viết bình luận…" : "Đăng nhập để bình luận"
                      }
                      disabled={!viewer || pending}
                    />
                    <button
                      onClick={() => void interact("comment")}
                      disabled={!viewer || pending || !commentBody.trim()}
                      aria-label="Gửi bình luận"
                    >
                      <Send size={17} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}
