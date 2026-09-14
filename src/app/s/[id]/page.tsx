import type { Metadata } from "next";
import { z } from "zod";
import { Explore } from "@/components/explore";
import { requestSupabase } from "@/lib/supabase";
import { demoSignals } from "@/lib/demo";
import { timeLabel } from "@/lib/domain";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return { title: "Không tìm thấy hoạt động — Vietnam Social" };
  const db = requestSupabase();
  const signal = db
    ? (await db.rpc("get_signal", { p_id: id })).data
    : demoSignals().find((s) => s.id === id);
  if (!signal) return { title: "Hoạt động đã kết thúc — Vietnam Social" };
  const timeText = timeLabel(signal.starts_at);
  const title = `${signal.title} — Vietnam Social`;
  const description =
    `${signal.place_name} (${signal.area}) · ${timeText}. ${signal.capacity_note ? `${signal.capacity_note} · ` : ""}${signal.description || ""}`.trim();
  const canonicalUrl = `https://vietnamsocial.app/s/${id}`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: canonicalUrl,
      locale: "vi_VN",
      siteName: "Vietnam Social",
    },
    twitter: { card: "summary", title, description },
    alternates: {
      canonical: canonicalUrl,
    },
  };
}
export default async function SignalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <Explore initialId={(await params).id} />;
}
