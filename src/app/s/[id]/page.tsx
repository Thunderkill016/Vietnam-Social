import type { Metadata } from "next";
import { z } from "zod";
import { Explore } from "@/components/explore";
import { requestSupabase } from "@/lib/supabase";
import { demoSignals } from "@/lib/demo";
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
  const title = `${signal.title} — Vietnam Social`;
  const description = `${signal.source_label} · ${signal.place_name}. ${signal.description}`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  };
}
export default async function SignalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <Explore initialId={(await params).id} />;
}
