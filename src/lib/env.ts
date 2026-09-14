import { z } from "zod";

export type AppEnvironment = "demo" | "local" | "staging" | "production";

export interface PublicConfig {
  url: string;
  key: string;
  style: string;
  mode: "demo" | "live";
  env: AppEnvironment;
}

export function readPublicConfig(input: {
  url?: string;
  key?: string;
  style?: string;
  appEnv?: string;
}): PublicConfig {
  const url = input.url?.trim() || "";
  const key = input.key?.trim() || "";
  const rawEnv = input.appEnv?.trim() || "";

  // 1. Incomplete configuration check: if one is present, both must be valid.
  if (Boolean(url) !== Boolean(key)) {
    throw new Error(
      "Cấu hình Supabase không đầy đủ: cần cung cấp đồng thời cả NEXT_PUBLIC_SUPABASE_URL và NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  // 2. Determine target environment
  let env: AppEnvironment = "demo";
  if (
    rawEnv === "production" ||
    rawEnv === "staging" ||
    rawEnv === "local" ||
    rawEnv === "demo"
  ) {
    env = rawEnv;
  } else if (url) {
    try {
      const parsedUrl = new URL(url);
      env = ["localhost", "127.0.0.1"].includes(parsedUrl.hostname)
        ? "local"
        : "production";
    } catch {
      env = "demo";
    }
  }

  // 3. Validation for configured (live) environments
  if (url) {
    const parsed = z.url().parse(url);
    const u = new URL(parsed);

    // Protocol check: general invariant
    if (
      u.protocol !== "https:" &&
      !(
        u.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(u.hostname)
      )
    ) {
      throw new Error("Supabase URL cần sử dụng HTTPS hoặc địa chỉ local.");
    }

    if (env === "production" || env === "staging") {
      if (["localhost", "127.0.0.1"].includes(u.hostname)) {
        throw new Error(
          `Môi trường ${env} không được trỏ về địa chỉ localhost.`,
        );
      }
      if (u.protocol !== "https:") {
        throw new Error(
          `Môi trường ${env} bắt buộc sử dụng giao thức HTTPS cho Supabase URL.`,
        );
      }
    }

    // Key safety validation: only anon / publishable key is permitted
    if (key.startsWith("sb_secret_")) {
      throw new Error(
        "Tuyệt đối không đưa secret key hoặc service-role vào cấu hình public.",
      );
    }
    if (!key.startsWith("sb_publishable_") && !key.startsWith("eyJ")) {
      throw new Error("Chỉ cho phép sử dụng publishable key hoặc anon key.");
    }
    if (key.startsWith("eyJ")) {
      let payload: { role?: string };
      try {
        payload = JSON.parse(atob(key.split(".")[1]));
      } catch {
        throw new Error("Anon JWT key không hợp lệ.");
      }
      if (payload.role !== "anon") {
        throw new Error(
          "Không được dùng secret/service-role key trong cấu hình public (phải có role 'anon').",
        );
      }
    }
  }

  // 4. Map style validation
  const style =
    input.style?.trim() || "https://tiles.openfreemap.org/styles/positron";
  if (!style.startsWith("https://")) {
    throw new Error("Map style URL bắt buộc phải sử dụng HTTPS.");
  }

  return {
    url,
    key,
    style,
    mode: url ? "live" : "demo",
    env,
  };
}

export function publicConfig(): PublicConfig {
  return readPublicConfig({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    key:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY,
    style: process.env.NEXT_PUBLIC_MAP_STYLE_URL,
    appEnv:
      process.env.NEXT_PUBLIC_APP_ENV ||
      (process.env.NODE_ENV === "production" &&
      (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)
        ? "production"
        : undefined),
  });
}
