import Link from "next/link";
import { areaQuerySchema, areaSocialPageSchema } from "@/lib/place";
import { requestSupabase } from "@/lib/supabase";
import { PlaceSocialContext } from "@/components/place-page";
import styles from "@/components/place-page.module.css";

export const dynamic = "force-dynamic";

export default async function AreaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const input = areaQuerySchema.safeParse(await searchParams);
  const db = requestSupabase();
  const result =
    input.success && db
      ? await db.rpc("get_area_social_page", {
          p_city_id: input.data.city_id,
          p_area: input.data.area,
        })
      : null;
  const parsed = areaSocialPageSchema.safeParse(result?.data);
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <strong>Vietnam Social</strong>
        <nav className={styles.nav}>
          <Link href="/">Bản đồ xã hội</Link>
          <Link href="/following">Đang theo dõi</Link>
          <Link href="/activities">Hoạt động</Link>
        </nav>
      </header>
      {!parsed.success || result?.error ? (
        <section className={styles.hero}>
          <h1>
            {result?.error ? "Chưa tải được khu vực" : "Không tìm thấy khu vực"}
          </h1>
          <p>
            Chọn khu vực từ một địa điểm công cộng hoặc danh sách đang theo dõi.
          </p>
        </section>
      ) : (
        <>
          <section className={styles.hero}>
            <div className={styles.eyebrow}>{parsed.data.city_name}</div>
            <h1>{parsed.data.area}</h1>
            <p>
              Bài địa phương, hoạt động và cộng đồng tại khu vực bạn quan tâm.
              Mỗi nhóm hiển thị những nội dung gần đây, không phải toàn bộ lịch
              sử.
            </p>
          </section>
          <section className={styles.grid}>
            <PlaceSocialContext {...parsed.data} />
            <aside className={styles.card}>
              <h2>Địa điểm công cộng</h2>
              <p className={styles.muted}>
                Mở một địa điểm để theo dõi hoặc bỏ theo dõi địa điểm và khu vực
                này.
              </p>
              {parsed.data.places.map((place) => (
                <Link
                  className={styles.item}
                  key={place.id}
                  href={`/p/${place.id}`}
                >
                  <strong>{place.name}</strong>
                  <span>{place.follower_count} người theo dõi</span>
                </Link>
              ))}
            </aside>
          </section>
        </>
      )}
    </main>
  );
}
