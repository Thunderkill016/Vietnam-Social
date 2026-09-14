import { z } from "zod";
export function readPublicConfig(input: {
  url?: string;
  key?: string;
  style?: string;
}) {
  const url = input.url?.trim() || "";
  const key = input.key?.trim() || "";
  if (Boolean(url) !== Boolean(key))
    throw new Error("Cần cấu hình cả Supabase URL và publishable key.");
  if (url) {
    const parsed = z.url().parse(url);
    const u = new URL(parsed);
    if (
      u.protocol !== "https:" &&
      !(
        u.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(u.hostname)
      )
    )
      throw new Error("Supabase cần HTTPS hoặc địa chỉ local.");
    if (!key.startsWith("sb_publishable_") && !key.startsWith("eyJ"))
      throw new Error("Chỉ dùng publishable key hoặc anon key.");
    if (key.startsWith("eyJ")) {
      let payload: { role?: string };
      try {
        payload = JSON.parse(atob(key.split(".")[1]));
      } catch {
        throw new Error("Anon key không hợp lệ.");
      }
      if (payload.role !== "anon")
        throw new Error(
          "Không được dùng secret/service-role key trong cấu hình public.",
        );
    }
  }
  const style = input.style || "https://tiles.openfreemap.org/styles/positron";
  if (!style.startsWith("https://")) throw new Error("Map style cần HTTPS.");
  return { url, key, style, mode: url ? ("live" as const) : ("demo" as const) };
}
export function publicConfig() {
  return readPublicConfig({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    style: process.env.NEXT_PUBLIC_MAP_STYLE_URL,
  });
}
