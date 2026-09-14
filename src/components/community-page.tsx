"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LoaderCircle, MapPin, MessageCircle, Users } from "lucide-react";
import { browserSupabase } from "@/lib/supabase";
import { COMMUNITY_CATEGORIES, type CommunityDetail } from "@/lib/community";
import {
  LOCAL_POST_TYPES,
  localPostAge,
  type LocalPostType,
} from "@/lib/social";
import styles from "./community-page.module.css";

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
  if (!response.ok) throw new Error(body.error || "Có lỗi kết nối.");
  return body;
}

export function CommunityPage({ id }: { id: string }) {
  const [detail, setDetail] = useState<CommunityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [postType, setPostType] = useState<LocalPostType>("update");
  const [postBody, setPostBody] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setDetail(await api<CommunityDetail>(`/api/communities/${id}`));
      setNotice("");
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const signIn = async () => {
    const db = browserSupabase();
    if (!db) return setNotice("Cần kết nối Supabase để đăng nhập.");
    await db.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  const membership = async (action: "join" | "leave") => {
    const db = browserSupabase();
    const session = db ? (await db.auth.getSession()).data.session : null;
    if (!session) return void signIn();
    try {
      setPending(true);
      await api(`/api/communities/${id}`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      await load();
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setPending(false);
    }
  };

  const createPost = async () => {
    if (!detail) return;
    const db = browserSupabase();
    const session = db ? (await db.auth.getSession()).data.session : null;
    if (!session) return void signIn();
    try {
      setPending(true);
      await api("/api/posts", {
        method: "POST",
        body: JSON.stringify({
          request_id: crypto.randomUUID(),
          post_type: postType,
          body: postBody,
          community_id: detail.community.id,
        }),
      });
      setPostBody("");
      setNotice("Bài đã được đăng vào cộng đồng và lớp xã hội trên bản đồ.");
      await load();
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setPending(false);
    }
  };

  if (loading && !detail) {
    return (
      <main className={styles.shell}>
        <div className={styles.hero}>
          <LoaderCircle size={24} /> Đang tải cộng đồng…
        </div>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className={styles.shell}>
        <div className={styles.hero}>
          <h1>Không tìm thấy cộng đồng</h1>
          <p>{notice}</p>
          <Link href="/" className={styles.link}>
            Về bản đồ xã hội
          </Link>
        </div>
      </main>
    );
  }

  const { community, posts } = detail;
  const canPost = community.viewer_is_member;
  const canLeave =
    community.viewer_is_member && community.viewer_role !== "owner";

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>Vietnam Social</div>
        <nav className={styles.nav}>
          <Link href="/" className={styles.link}>
            Bản đồ xã hội
          </Link>
          <Link href="/activities" className={styles.link}>
            Hoạt động
          </Link>
          {!community.viewer_is_member ? (
            <button
              className={styles.primary}
              disabled={pending}
              onClick={() => void membership("join")}
            >
              Tham gia cộng đồng
            </button>
          ) : canLeave ? (
            <button
              className={styles.button}
              disabled={pending}
              onClick={() => void membership("leave")}
            >
              Rời cộng đồng
            </button>
          ) : (
            <span className={styles.chip}>Bạn là chủ cộng đồng</span>
          )}
        </nav>
      </header>

      {notice && <div className={styles.notice}>{notice}</div>}

      <section className={styles.hero}>
        <div className={styles.eyebrow}>
          {COMMUNITY_CATEGORIES[community.category]} · COMMUNITY
        </div>
        <h1>{community.name}</h1>
        <p>
          {community.description || "Cộng đồng địa phương trên Vietnam Social."}
        </p>
        <div className={styles.meta}>
          <span className={styles.chip}>
            <MapPin size={14} /> {community.place_name || community.area}
          </span>
          <span className={styles.chip}>
            <Users size={14} /> {community.member_count} thành viên
          </span>
          <span className={styles.chip}>
            <MessageCircle size={14} /> {posts.length} bài gần đây
          </span>
        </div>
      </section>

      <section className={styles.grid}>
        <div className={styles.card}>
          <h2>Thảo luận cộng đồng</h2>
          {canPost ? (
            <div className={styles.form}>
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
              <textarea
                rows={4}
                maxLength={800}
                value={postBody}
                onChange={(event) => setPostBody(event.target.value)}
                placeholder="Chia sẻ điều hữu ích với cộng đồng…"
              />
              <button
                className={styles.primary}
                disabled={pending || postBody.trim().length < 8}
                onClick={() => void createPost()}
              >
                {pending ? "Đang đăng…" : "Đăng vào cộng đồng"}
              </button>
            </div>
          ) : (
            <p className={styles.muted}>Tham gia cộng đồng để đăng bài.</p>
          )}

          {posts.length === 0 ? (
            <p className={styles.muted}>
              Chưa có bài nào. Vietnam Social không tạo nội dung giả để lấp chỗ
              trống.
            </p>
          ) : (
            posts.map((post) => (
              <article key={post.id} className={styles.post}>
                <div className={styles.postMeta}>
                  <span>{LOCAL_POST_TYPES[post.post_type]}</span>
                  <span>·</span>
                  <span>{localPostAge(post.created_at)}</span>
                </div>
                <Link href={`/u/${post.author.id}`}>
                  <strong>{post.author.display_name}</strong>
                </Link>
                <p>{post.body}</p>
              </article>
            ))
          )}
        </div>

        <aside className={styles.card}>
          <h3>Người tạo cộng đồng</h3>
          <Link href={`/u/${community.creator.id}`} className={styles.creator}>
            <span className={styles.avatar}>
              {community.creator.display_name.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{community.creator.display_name}</strong>
              <br />
              <small>
                {community.creator.organizer_label ||
                  "Thành viên Vietnam Social"}
              </small>
            </span>
          </Link>
          <h3>Khu vực</h3>
          <p className={styles.muted}>{community.area}</p>
          <p className={styles.muted}>
            Cộng đồng được neo vào khu vực/địa điểm công cộng, không phải vị trí
            sống trực tiếp của thành viên.
          </p>
        </aside>
      </section>
    </main>
  );
}
