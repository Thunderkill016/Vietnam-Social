"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Bell,
  BellOff,
  MapPin,
  MessageCircle,
  Users,
} from "lucide-react";
import { browserSupabase } from "@/lib/supabase";
import { CATEGORIES } from "@/lib/domain";
import { COMMUNITY_CATEGORIES } from "@/lib/community";
import { LOCAL_POST_TYPES, localPostAge } from "@/lib/social";
import type { PlaceSocialPage } from "@/lib/place";
import styles from "./place-page.module.css";

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

export function PlacePage({ id }: { id: string }) {
  const [detail, setDetail] = useState<PlaceSocialPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<"place" | "area" | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setDetail(await api<PlaceSocialPage>(`/api/places/${id}`));
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

  const follow = async (target: "place" | "area", value: boolean) => {
    const db = browserSupabase();
    const session = db ? (await db.auth.getSession()).data.session : null;
    if (!session) return void signIn();

    try {
      setPending(target);
      await api(`/api/places/${id}`, {
        method: "POST",
        body: JSON.stringify({ target, follow: value }),
      });
      await load();
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setPending(null);
    }
  };

  if (loading && !detail) {
    return (
      <main className={styles.shell}>
        <section className={styles.hero}>Đang tải lớp xã hội của địa điểm…</section>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className={styles.shell}>
        <section className={styles.hero}>
          <h1>Không tìm thấy địa điểm</h1>
          <p>{notice}</p>
          <Link href="/" className={styles.link}>
            Về bản đồ xã hội
          </Link>
        </section>
      </main>
    );
  }

  const { place, posts, activities, communities } = detail;

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
          <Link href="/following" className={styles.link}>
            Đang theo dõi
          </Link>
        </nav>
      </header>

      {notice && <div className={styles.notice}>{notice}</div>}

      <section className={styles.hero}>
        <div className={styles.eyebrow}>SOCIAL PLACE · {place.area}</div>
        <h1>{place.name}</h1>
        <p>
          Lớp xã hội của một địa điểm công cộng: những gì mọi người đang chia sẻ,
          hoạt động sắp diễn ra và cộng đồng đang neo tại đây.
        </p>
        <div className={styles.meta}>
          <span className={styles.chip}>
            <MapPin size={14} /> {place.area}
          </span>
          <span className={styles.chip}>
            <Bell size={14} /> {place.follower_count} người theo dõi địa điểm
          </span>
          <span className={styles.chip}>
            <Users size={14} /> {place.area_follower_count} người theo dõi khu vực
          </span>
        </div>
      </section>

      <section className={styles.grid}>
        <div className={styles.stack}>
          <section className={styles.card}>
            <div className={styles.sectionHeader}>
              <h2>Bài địa phương</h2>
              <span className={styles.count}>{posts.length} bài</span>
            </div>
            {posts.length === 0 ? (
              <p className={styles.empty}>Chưa có bài nào gắn trực tiếp với địa điểm này.</p>
            ) : (
              posts.map((post) => (
                <Link key={post.id} href={`/?post=${post.id}`} className={styles.item}>
                  <strong>{post.author.display_name}</strong>
                  <p>{post.body}</p>
                  <div className={styles.itemMeta}>
                    <span>{LOCAL_POST_TYPES[post.post_type]}</span>
                    <span>{localPostAge(post.created_at)}</span>
                    <span>
                      <MessageCircle size={13} /> {post.comment_count}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </section>

          <section className={styles.card}>
            <div className={styles.sectionHeader}>
              <h2>Hoạt động sắp tới</h2>
              <span className={styles.count}>{activities.length} hoạt động</span>
            </div>
            {activities.length === 0 ? (
              <p className={styles.empty}>Không có Activity đang hoạt động trong cửa sổ khám phá.</p>
            ) : (
              activities.map((activity) => (
                <Link key={activity.id} href={`/s/${activity.id}`} className={styles.item}>
                  <strong>{activity.title}</strong>
                  <p>{activity.description || "Hoạt động tại địa điểm này."}</p>
                  <div className={styles.itemMeta}>
                    <span>{CATEGORIES[activity.category].label}</span>
                    <span>{new Date(activity.starts_at).toLocaleString("vi-VN")}</span>
                    <span>
                      <Activity size={13} /> {activity.confidence}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </section>

          <section className={styles.card}>
            <div className={styles.sectionHeader}>
              <h2>Cộng đồng tại đây</h2>
              <span className={styles.count}>{communities.length} cộng đồng</span>
            </div>
            {communities.length === 0 ? (
              <p className={styles.empty}>Chưa có Community nào neo trực tiếp tại địa điểm này.</p>
            ) : (
              communities.map((community) => (
                <Link key={community.id} href={`/c/${community.id}`} className={styles.item}>
                  <strong>{community.name}</strong>
                  <p>{community.description || "Cộng đồng địa phương."}</p>
                  <div className={styles.itemMeta}>
                    <span>{COMMUNITY_CATEGORIES[community.category]}</span>
                    <span>{community.member_count} thành viên</span>
                  </div>
                </Link>
              ))
            )}
          </section>
        </div>

        <aside className={`${styles.card} ${styles.anchorCard}`}>
          <h3>Giữ liên kết với nơi này</h3>
          <p className={styles.muted}>
            Follow chỉ lưu mối quan hệ với địa điểm hoặc khu vực công cộng. Nó không
            bật theo dõi vị trí của bạn và không cấp quyền xem vị trí của người khác.
          </p>
          <div className={styles.actions}>
            <button
              className={place.viewer_follows ? styles.button : styles.primary}
              disabled={pending !== null}
              onClick={() => void follow("place", !place.viewer_follows)}
            >
              {place.viewer_follows ? <BellOff size={16} /> : <Bell size={16} />}
              {place.viewer_follows ? "Bỏ theo dõi địa điểm" : "Theo dõi địa điểm"}
            </button>
            <button
              className={place.viewer_follows_area ? styles.button : styles.primary}
              disabled={pending !== null}
              onClick={() => void follow("area", !place.viewer_follows_area)}
            >
              {place.viewer_follows_area ? <BellOff size={16} /> : <Bell size={16} />}
              {place.viewer_follows_area
                ? `Bỏ theo dõi ${place.area}`
                : `Theo dõi ${place.area}`}
            </button>
          </div>
          <Link href="/following" className={styles.link}>
            Xem các nơi và khu vực đang theo dõi →
          </Link>
        </aside>
      </section>
    </main>
  );
}
