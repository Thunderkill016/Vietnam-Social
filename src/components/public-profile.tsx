"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Heart,
  LoaderCircle,
  MapPin,
  UserPlus,
  UserRoundCheck,
} from "lucide-react";
import { browserSupabase } from "@/lib/supabase";
import {
  LOCAL_POST_TYPES,
  localPostAge,
  type PublicProfile,
} from "@/lib/social";
import styles from "./social-explore.module.css";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
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
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "Không thể tải dữ liệu.");
  return body;
}

export function PublicProfileView({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await request<{ profile: PublicProfile }>(
        `/api/profiles/${userId}`,
      );
      setProfile(result.profile);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => void load(), [load]);

  const signIn = async () => {
    const db = browserSupabase();
    if (!db) return;
    await db.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  const toggleFollow = async () => {
    if (!profile) return;
    try {
      setPending(true);
      const result = await request<{
        following: boolean;
        follower_count: number;
      }>(`/api/profiles/${profile.id}`, {
        method: "POST",
        body: JSON.stringify({ follow: !profile.viewer_follows }),
      });
      setProfile({
        ...profile,
        viewer_follows: result.following,
        follower_count: result.follower_count,
      });
    } catch (e) {
      if ((e as Error).message.includes("đăng nhập")) await signIn();
      else setError((e as Error).message);
    } finally {
      setPending(false);
    }
  };

  if (loading)
    return (
      <main className={styles.profileShell}>
        <LoaderCircle className={styles.spin} /> Đang tải hồ sơ…
      </main>
    );
  if (error || !profile)
    return (
      <main className={styles.profileShell}>
        <Link href="/" className={styles.backLink}>
          <ArrowLeft size={17} /> Bản đồ xã hội
        </Link>
        <div className={styles.errorBanner}>
          {error || "Không tìm thấy hồ sơ."}
        </div>
      </main>
    );

  return (
    <main className={styles.profileShell}>
      <Link href="/" className={styles.backLink}>
        <ArrowLeft size={17} /> Bản đồ xã hội
      </Link>
      <section className={styles.profileHero}>
        <div className={styles.profileAvatar}>
          {profile.display_name.slice(0, 1).toUpperCase()}
        </div>
        <div className={styles.profileIdentity}>
          <h1>{profile.display_name}</h1>
          {profile.organizer_label && (
            <span className={styles.typeChip}>{profile.organizer_label}</span>
          )}
          <p>
            {profile.bio ||
              "Thành viên đang đóng góp vào bản đồ xã hội Việt Nam."}
          </p>
          <div className={styles.profileStats}>
            <strong>{profile.follower_count}</strong> người theo dõi ·{" "}
            <strong>{profile.following_count}</strong> đang theo dõi
          </div>
        </div>
        {!profile.is_self && (
          <button
            className={
              profile.viewer_follows ? styles.ghostButton : styles.primaryButton
            }
            disabled={pending}
            onClick={() => void toggleFollow()}
          >
            {profile.viewer_follows ? (
              <UserRoundCheck size={18} />
            ) : (
              <UserPlus size={18} />
            )}
            {profile.viewer_follows ? "Đang theo dõi" : "Theo dõi"}
          </button>
        )}
      </section>
      <section className={styles.profileContributions}>
        <h2>Đóng góp địa phương</h2>
        {profile.contributions.length === 0 ? (
          <p className={styles.muted}>Chưa có bài địa phương công khai.</p>
        ) : (
          profile.contributions.map((post) => (
            <Link
              key={post.id}
              href={`/?post=${post.id}`}
              className={styles.profilePost}
            >
              <div className={styles.postMeta}>
                <span className={styles.typeChip}>
                  {LOCAL_POST_TYPES[post.post_type]}
                </span>
                <span>{localPostAge(post.created_at)}</span>
              </div>
              <p>{post.body}</p>
              <div className={styles.postFooter}>
                <span>
                  <MapPin size={14} /> {post.place_name || post.area}
                </span>
                <span>
                  <Heart size={14} /> {post.reaction_count}
                </span>
              </div>
            </Link>
          ))
        )}
      </section>
    </main>
  );
}