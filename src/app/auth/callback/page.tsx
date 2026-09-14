"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { browserSupabase } from "@/lib/supabase";
import { LoaderCircle } from "lucide-react";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    const db = browserSupabase();
    if (!db) {
      router.replace("/");
      return;
    }

    db.auth
      .getSession()
      .then(({ error: sessionError }) => {
        if (sessionError) {
          setError(sessionError.message);
          setTimeout(() => router.replace("/"), 3000);
          return;
        }
        router.replace("/");
      })
      .catch((err: Error) => {
        setError(err.message || "Lỗi xác thực");
        setTimeout(() => router.replace("/"), 3000);
      });
  }, [router]);

  return (
    <div className="auth-callback-container">
      {error ? (
        <div className="auth-callback-box">
          <p className="auth-callback-error">{error}</p>
          <p className="footnote">Đang chuyển về trang chủ…</p>
        </div>
      ) : (
        <div className="auth-callback-box">
          <LoaderCircle className="spin" size={28} />
          <p>Đang hoàn tất đăng nhập…</p>
        </div>
      )}
    </div>
  );
}
