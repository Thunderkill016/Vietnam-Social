"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, MapPin } from "lucide-react";
import { browserSupabase } from "@/lib/supabase";
import { areaHref, type LocalFollows } from "@/lib/place";
import styles from "./place-page.module.css";

type ApiErrorBody = { error?: string };

async function api<T>(path: string): Promise<T> {
  const db = browserSupabase();
  const session = db ? (await db.auth.getSession()).data.session : null;
  const response = await fetch(path, {
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  });
  const body = (await response.json()) as ApiErrorBody & T;
  if (!response.ok) throw new Error(body.error || "Có lỗi kết nối.");
  return body;
}

export function FollowingPage() {
  const [data, setData] = useState<LocalFollows | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const db = browserSupabase();
    const session = db ? (await db.auth.getSession()).data.session : null;
    if (!session) {
      setData(null);
      setLoading(false);
      setNotice("Đăng nhập để xem các địa điểm và khu vực bạn đang theo dõi.");
      return;
    }
    try {
      setLoading(true);
      setData(await api<LocalFollows>("/api/follows/local"));
      setNotice("");
    } catch (error) {
      setData(null);
      setNotice((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const db = browserSupabase();
    const subscription = db?.auth.onAuthStateChange(() => {
      void load();
    });
    return () => subscription?.data.subscription.unsubscribe();
  }, [load]);

  const signIn = async () => {
    const db = browserSupabase();
    if (!db) return setNotice("Cần kết nối Supabase để đăng nhập.");
    await db.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?${new URLSearchParams({ next: "/following" })}`,
      },
    });
  };

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
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.eyebrow}>ĐANG THEO DÕI</div>
        <h1>Những nơi bạn muốn quay lại</h1>
        <p>
          Đây là các địa điểm và khu vực công cộng bạn chủ động theo dõi. Danh
          sách này không chứa vị trí hiện tại hay lịch sử di chuyển của bạn.
        </p>
      </section>

      {notice && <div className={styles.notice}>{notice}</div>}

      <section className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.sectionHeader}>
            <h2>Địa điểm</h2>
            <span className={styles.count}>{data?.places.length ?? 0} nơi</span>
          </div>
          {loading ? (
            <p className={styles.muted}>Đang tải…</p>
          ) : data?.places.length ? (
            data.places.map((place) => (
              <Link
                key={place.id}
                href={`/p/${place.id}`}
                className={styles.item}
              >
                <strong>{place.name}</strong>
                <div className={styles.itemMeta}>
                  <span>
                    <MapPin size={13} /> {place.area}
                  </span>
                  <span>
                    <Bell size={13} /> {place.follower_count} người theo dõi
                  </span>
                </div>
              </Link>
            ))
          ) : (
            <p className={styles.empty}>
              {data
                ? "Bạn chưa theo dõi địa điểm nào."
                : "Danh sách riêng của bạn sẽ hiện sau khi đăng nhập."}
            </p>
          )}
        </div>

        <aside className={styles.card}>
          <div className={styles.sectionHeader}>
            <h2>Khu vực</h2>
            <span className={styles.count}>
              {data?.areas.length ?? 0} khu vực
            </span>
          </div>
          {data?.areas.length ? (
            data.areas.map((area) => (
              <Link
                href={areaHref(area.city_id, area.area)}
                key={`${area.city_id}:${area.area}`}
                className={styles.item}
              >
                <strong>
                  {area.area} · {area.city_name}
                </strong>
                <div className={styles.itemMeta}>
                  <span>
                    {area.follower_count} người theo dõi khu vực · Khám phá →
                  </span>
                </div>
              </Link>
            ))
          ) : (
            <p className={styles.empty}>
              {data
                ? "Bạn chưa theo dõi khu vực nào."
                : "Đăng nhập để xem khu vực đang theo dõi."}
            </p>
          )}
          {!data && !loading && (
            <button className={styles.primary} onClick={() => void signIn()}>
              Đăng nhập
            </button>
          )}
        </aside>
      </section>
    </main>
  );
}
