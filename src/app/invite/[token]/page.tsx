"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  LoaderCircle,
  Building2,
  Compass,
} from "lucide-react";
import { browserSupabase } from "@/lib/supabase";
import type { HostInvite, Viewer } from "@/lib/domain";

export default function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();

  const [invite, setInvite] = useState<HostInvite | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [organizerLabel, setOrganizerLabel] = useState("");
  const [bio, setBio] = useState("");
  const [contactChannel, setContactChannel] = useState("");
  const [onboardingPending, setOnboardingPending] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    // 1. Inspect invite token
    fetch(`/api/invites?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Không tìm thấy lời mời.");
        setInvite(data.invite);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));

    // 2. Check current authenticated viewer
    const db = browserSupabase();
    if (db) {
      db.auth.getSession().then(async ({ data: { session } }) => {
        if (session) {
          const res = await fetch("/api/auth/me", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          const body = await res.json();
          if (body.viewer) setViewer(body.viewer);
        }
      });
    }
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    setError("");
    try {
      const db = browserSupabase();
      const session = db ? (await db.auth.getSession()).data.session : null;
      if (!session) {
        throw new Error("Vui lòng đăng nhập trước khi chấp nhận lời mời.");
      }
      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể nhận lời mời.");
      setOnboarding(true);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setAccepting(false);
    }
  };

  const handleCompleteOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    setOnboardingPending(true);
    setError("");
    try {
      const db = browserSupabase();
      const session = db ? (await db.auth.getSession()).data.session : null;
      if (!session) throw new Error("Mất phiên đăng nhập.");

      const res = await fetch("/api/host/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          organizer_label: organizerLabel,
          bio,
          contact_channel: contactChannel,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Không thể hoàn tất onboarding.");
      setCompleted(true);
      setTimeout(() => router.replace("/"), 2500);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setOnboardingPending(false);
    }
  };

  return (
    <div className="invite-page-container">
      <div className="invite-card">
        <div className="invite-card-header">
          <div className="brand-symbol">
            <Compass size={22} color="#122119" />
          </div>
          <h2>Lời mời Trở thành Host</h2>
          <p className="footnote">
            Mạng lưới hoạt động thực tế Ho Chi Minh City
          </p>
        </div>

        {loading ? (
          <div className="ops-loading">
            <LoaderCircle className="spin" size={26} />
            <p>Đang kiểm tra tính hợp lệ của lời mời…</p>
          </div>
        ) : error ? (
          <div className="invite-state error-state">
            <AlertTriangle size={32} color="#d32f2f" />
            <h3>Lời mời không khả dụng</h3>
            <p>{error}</p>
            <Link href="/" className="dark-button" style={{ marginTop: 12 }}>
              Về trang bản đồ
            </Link>
          </div>
        ) : completed ? (
          <div className="invite-state success-state">
            <CheckCircle2 size={36} color="#4caf50" />
            <h3>Chào mừng bạn đến với Vietnam Social!</h3>
            <p>
              Tài khoản của bạn đã được nâng cấp thành <strong>Host</strong> và
              kích hoạt địa điểm phụ trách. Đang chuyển hướng về bản đồ…
            </p>
            <Link href="/" className="lime-button" style={{ marginTop: 12 }}>
              Mở bản đồ ngay <ArrowRight size={18} />
            </Link>
          </div>
        ) : onboarding ? (
          <form onSubmit={handleCompleteOnboarding} className="stack-form">
            <div className="invite-info-box">
              <CheckCircle2 size={20} color="#4caf50" />
              <span>
                Đã chấp nhận lời mời! Hãy hoàn tất thông tin tổ chức bên dưới:
              </span>
            </div>

            <label>
              Tên câu lạc bộ / Đơn vị tổ chức
              <input
                required
                placeholder="VD: CLB Cầu Lông Kỳ Hòa, Nhóm Chạy Phú Nhuận"
                value={organizerLabel}
                onChange={(e) => setOrganizerLabel(e.target.value)}
              />
            </label>

            <label>
              Giới thiệu ngắn về hoạt động
              <textarea
                rows={3}
                placeholder="VD: Giao lưu phong trào mỗi tối 18h-20h, chào đón mọi trình độ tham gia."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
            </label>

            <label>
              Kênh liên hệ hỗ trợ vận hành (Bảo mật, chỉ Operator xem được)
              <input
                required
                placeholder="VD: Zalo 0909xxxxxx hoặc SĐT"
                value={contactChannel}
                onChange={(e) => setContactChannel(e.target.value)}
              />
            </label>

            <button className="lime-button" disabled={onboardingPending}>
              {onboardingPending
                ? "Đang lưu…"
                : "Hoàn tất Onboarding & Bắt đầu"}
              <ArrowRight size={18} />
            </button>
          </form>
        ) : invite ? (
          <div className="invite-details">
            <div className="invite-notice-box">
              <ShieldCheck size={22} color="#122119" />
              <p>
                Bạn nhận được lời mời từ{" "}
                <strong>Ban Vận hành Vietnam Social</strong> để tham gia thử
                nghiệm nguồn cung hoạt động thực tế 7 ngày tại TP. Hồ Chí Minh.
              </p>
            </div>

            {invite.venue_name && (
              <div className="invite-venue-preview">
                <Building2 size={18} />
                <div>
                  <strong>{invite.venue_name}</strong>
                  <span className="footnote">Khu vực: {invite.venue_area}</span>
                </div>
              </div>
            )}

            {!viewer ? (
              <div className="invite-auth-cta">
                <p>
                  Vui lòng đăng nhập vào tài khoản của bạn để nhận quyền Host:
                </p>
                <Link
                  href="/"
                  className="dark-button"
                  style={{ width: "100%" }}
                >
                  Đăng nhập trên Trang chủ rồi quay lại link này
                </Link>
              </div>
            ) : (
              <div className="invite-action-area">
                <div
                  className="viewer-account-group"
                  style={{ marginBottom: 16 }}
                >
                  <span className="viewer-badge">
                    <span className="viewer-avatar-dot" />
                    <span className="viewer-name">{viewer.display_name}</span>
                  </span>
                  <span className="footnote">Sẽ nhận quyền Host</span>
                </div>

                <button
                  className="lime-button"
                  style={{ width: "100%" }}
                  disabled={accepting}
                  onClick={handleAccept}
                >
                  {accepting ? (
                    <LoaderCircle className="spin" size={18} />
                  ) : (
                    <CheckCircle2 size={18} />
                  )}
                  <span>Chấp nhận Lời mời làm Host</span>
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
