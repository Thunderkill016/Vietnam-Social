"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  LoaderCircle,
  Copy,
  Check,
  Plus,
  ShieldCheck,
  Building2,
  Users,
  Activity,
  BarChart3,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import type { OpsDashboardMetrics, Place } from "@/lib/domain";
import { browserSupabase } from "@/lib/supabase";

async function opsApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const db = browserSupabase();
  const session = db ? (await db.auth.getSession()).data.session : null;
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...init.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Lỗi thao tác vận hành.");
  return data as T;
}

export function OpsDashboardModal({
  open,
  setOpen,
  places,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  places: Place[];
}) {
  const [tab, setTab] = useState<
    "gate" | "hosts" | "venues" | "supply" | "moderation"
  >("gate");
  const [metrics, setMetrics] = useState<OpsDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Invite creator form
  const [inviteVenueId, setInviteVenueId] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteNote, setInviteNote] = useState("");
  const [generatedInviteLink, setGeneratedInviteLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);

  // New venue form
  const [venueName, setVenueName] = useState("");
  const [venueArea, setVenueArea] = useState("");
  const [venueLng, setVenueLng] = useState("106.68");
  const [venueLat, setVenueLat] = useState("10.77");
  const [creatingVenue, setCreatingVenue] = useState(false);
  const [venueNotice, setVenueNotice] = useState("");

  const refreshMetrics = async () => {
    try {
      const data = await opsApi<{ metrics: OpsDashboardMetrics }>(
        "/api/ops/dashboard",
      );
      setMetrics(data.metrics);
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    if (!open) return;
    let active = true;
    opsApi<{ metrics: OpsDashboardMetrics }>("/api/ops/dashboard")
      .then((data) => {
        if (active) {
          setMetrics(data.metrics);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError((err as Error).message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [open]);

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingInvite(true);
    try {
      const data = await opsApi<{ invite: { token: string } }>("/api/invites", {
        method: "POST",
        body: JSON.stringify({
          venue_id: inviteVenueId || undefined,
          email: inviteEmail || undefined,
          note: inviteNote || undefined,
        }),
      });
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      setGeneratedInviteLink(`${origin}/invite/${data.invite.token}`);
      void refreshMetrics();
    } catch (err: unknown) {
      alert((err as Error).message);
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleCreateVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingVenue(true);
    setVenueNotice("");
    try {
      await opsApi("/api/venues", {
        method: "POST",
        body: JSON.stringify({
          action: "create",
          name: venueName,
          area: venueArea,
          longitude: parseFloat(venueLng),
          latitude: parseFloat(venueLat),
        }),
      });
      setVenueNotice("Đã tạo địa điểm công cộng thành công!");
      setVenueName("");
      setVenueArea("");
      void refreshMetrics();
    } catch (err: unknown) {
      setVenueNotice(`Lỗi: ${(err as Error).message}`);
    } finally {
      setCreatingVenue(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const gateBadgeClass = (status: string) => {
    if (status === "PASS") return "status-pass";
    if (status === "IN PROGRESS") return "status-progress";
    return "status-not-started";
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal ops-modal">
          <Dialog.Close className="close-button" aria-label="Đóng">
            <X size={22} />
          </Dialog.Close>
          <div className="ops-header">
            <div className="ops-title-group">
              <ShieldCheck size={26} className="ops-shield-icon" />
              <div>
                <Dialog.Title className="modal-title" style={{ margin: 0 }}>
                  Trung tâm Vận hành Nguồn cung HCMC
                </Dialog.Title>
                <Dialog.Description
                  className="modal-description"
                  style={{ margin: 0 }}
                >
                  Giám sát thử nghiệm nguồn cung 7 ngày &amp; quản lý host thực
                  tế
                </Dialog.Description>
              </div>
            </div>
            {metrics?.evidence_gate && (
              <span
                className={`gate-overall-badge ${gateBadgeClass(metrics.evidence_gate.overall_status)}`}
              >
                {metrics.evidence_gate.overall_status}
              </span>
            )}
          </div>

          <div className="ops-tabs">
            <button
              className={`ops-tab ${tab === "gate" ? "active" : ""}`}
              onClick={() => setTab("gate")}
            >
              <BarChart3 size={16} /> 7-Day Gate
            </button>
            <button
              className={`ops-tab ${tab === "hosts" ? "active" : ""}`}
              onClick={() => setTab("hosts")}
            >
              <Users size={16} /> Host &amp; Lời mời
            </button>
            <button
              className={`ops-tab ${tab === "venues" ? "active" : ""}`}
              onClick={() => setTab("venues")}
            >
              <Building2 size={16} /> Địa điểm
            </button>
            <button
              className={`ops-tab ${tab === "supply" ? "active" : ""}`}
              onClick={() => setTab("supply")}
            >
              <Activity size={16} /> Nguồn cung &amp; Cầu
            </button>
            <button
              className={`ops-tab ${tab === "moderation" ? "active" : ""}`}
              onClick={() => setTab("moderation")}
            >
              <AlertTriangle size={16} /> Kiểm duyệt
            </button>
          </div>

          {loading ? (
            <div className="ops-loading">
              <LoaderCircle className="spin" size={28} />
              <p>Đang tải dữ liệu thực tế từ PostGIS &amp; Supabase…</p>
            </div>
          ) : error ? (
            <div className="ops-error">
              <AlertTriangle size={24} />
              <p>{error}</p>
            </div>
          ) : metrics ? (
            <div className="ops-body">
              {/* TAB 1: 7-DAY EVIDENCE GATE */}
              {tab === "gate" && (
                <div className="gate-tab-content">
                  <div className="gate-intro-banner">
                    <h4>
                      Mục tiêu Kiểm định Thử nghiệm 7 ngày (Ho Chi Minh City)
                    </h4>
                    <p>
                      Mọi chỉ số phản ánh <strong>100% dữ liệu thực tế</strong>{" "}
                      từ hoạt động của Host và người dùng. Không tính dữ liệu
                      mẫu (Demo) hay dữ liệu kiểm thử (Test).
                    </p>
                  </div>

                  <div className="gate-grid">
                    <div className="gate-card">
                      <div className="gate-card-header">
                        <span className="gate-card-title">1. Host Cam kết</span>
                        <span
                          className={`gate-status-pill ${gateBadgeClass(metrics.evidence_gate.host_target.status)}`}
                        >
                          {metrics.evidence_gate.host_target.status}
                        </span>
                      </div>
                      <div className="gate-metric-row">
                        <span className="gate-num">
                          {metrics.evidence_gate.host_target.actual}
                        </span>
                        <span className="gate-slash">/</span>
                        <span className="gate-target">
                          {metrics.evidence_gate.host_target.target} hosts
                        </span>
                      </div>
                      <p className="gate-subtext">
                        Số host thực tế đã nhận lời mời tham gia thử nghiệm.
                      </p>
                    </div>

                    <div className="gate-card">
                      <div className="gate-card-header">
                        <span className="gate-card-title">
                          2. Nguồn cung 7 ngày
                        </span>
                        <span
                          className={`gate-status-pill ${gateBadgeClass(metrics.evidence_gate.supply_target.status)}`}
                        >
                          {metrics.evidence_gate.supply_target.status}
                        </span>
                      </div>
                      <div className="gate-metric-row">
                        <span className="gate-num">
                          {metrics.evidence_gate.supply_target.actual}
                        </span>
                        <span className="gate-slash">/</span>
                        <span className="gate-target">
                          {metrics.evidence_gate.supply_target.target} hoạt động
                        </span>
                      </div>
                      <p className="gate-subtext">
                        Số hoạt động thực tế được tạo trong chu kỳ 7 ngày.
                      </p>
                    </div>

                    <div className="gate-card">
                      <div className="gate-card-header">
                        <span className="gate-card-title">
                          3. Tiếp cận Người dùng
                        </span>
                        <span
                          className={`gate-status-pill ${gateBadgeClass(metrics.evidence_gate.demand_target.status)}`}
                        >
                          {metrics.evidence_gate.demand_target.status}
                        </span>
                      </div>
                      <div className="gate-metric-row">
                        <span className="gate-num">
                          {metrics.evidence_gate.demand_target.actual}
                        </span>
                        <span className="gate-slash">/</span>
                        <span className="gate-target">
                          {metrics.evidence_gate.demand_target.target} users
                        </span>
                      </div>
                      <p className="gate-subtext">
                        Người dùng thực tế mở xem chi tiết (Qualified Open).
                      </p>
                    </div>

                    <div className="gate-card">
                      <div className="gate-card-header">
                        <span className="gate-card-title">
                          4. Hành động Xác nhận Thực tế
                        </span>
                        <span
                          className={`gate-status-pill ${gateBadgeClass(metrics.evidence_gate.action_target.status)}`}
                        >
                          {metrics.evidence_gate.action_target.status}
                        </span>
                      </div>
                      <div className="gate-metric-row">
                        <span className="gate-num">
                          {metrics.evidence_gate.action_target.actual}
                        </span>
                        <span className="gate-slash">/</span>
                        <span className="gate-target">
                          {metrics.evidence_gate.action_target.target} hành động
                        </span>
                      </div>
                      <p className="gate-subtext">
                        Người dùng bấm tham gia và xác nhận sau giờ bắt đầu.
                      </p>
                    </div>

                    <div className="gate-card">
                      <div className="gate-card-header">
                        <span className="gate-card-title">
                          5. Người dùng Quay lại
                        </span>
                        <span
                          className={`gate-status-pill ${gateBadgeClass(metrics.evidence_gate.return_target.status)}`}
                        >
                          {metrics.evidence_gate.return_target.status}
                        </span>
                      </div>
                      <div className="gate-metric-row">
                        <span className="gate-num">
                          {metrics.evidence_gate.return_target.actual}
                        </span>
                        <span className="gate-slash">/</span>
                        <span className="gate-target">
                          {metrics.evidence_gate.return_target.target} users
                        </span>
                      </div>
                      <p className="gate-subtext">
                        Người dùng tự nguyện tương tác trên &gt;= 2 ngày khác
                        nhau.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: HOSTS & INVITES */}
              {tab === "hosts" && (
                <div className="hosts-tab-content">
                  <div className="hosts-funnel-bar">
                    <div className="funnel-step">
                      <span className="step-count">
                        {metrics.hosts.invited}
                      </span>
                      <span className="step-label">Đã mời</span>
                    </div>
                    <ChevronRight size={18} className="funnel-arrow" />
                    <div className="funnel-step">
                      <span className="step-count">
                        {metrics.hosts.accepted}
                      </span>
                      <span className="step-label">Đã nhận lời</span>
                    </div>
                    <ChevronRight size={18} className="funnel-arrow" />
                    <div className="funnel-step">
                      <span className="step-count">
                        {metrics.hosts.onboarded}
                      </span>
                      <span className="step-label">Onboarding xong</span>
                    </div>
                    <ChevronRight size={18} className="funnel-arrow" />
                    <div className="funnel-step">
                      <span className="step-count">
                        {metrics.hosts.published_at_least_one}
                      </span>
                      <span className="step-label">Đăng lần 1</span>
                    </div>
                    <ChevronRight size={18} className="funnel-arrow" />
                    <div className="funnel-step highlighted">
                      <span className="step-count">
                        {metrics.hosts.published_again}
                      </span>
                      <span className="step-label">Đăng lại (Tuần 2)</span>
                    </div>
                  </div>

                  <div className="invite-generator-card">
                    <h4>Tạo Lời mời Host Mới (Secure One-Time Token)</h4>
                    <form onSubmit={handleCreateInvite} className="invite-form">
                      <div className="form-grid">
                        <label>
                          Địa điểm liên kết trước (tùy chọn)
                          <select
                            value={inviteVenueId}
                            onChange={(e) => setInviteVenueId(e.target.value)}
                          >
                            <option value="">-- Không gán trước --</option>
                            {places.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.area})
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Email host (tùy chọn)
                          <input
                            type="email"
                            placeholder="host@example.com"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                          />
                        </label>
                      </div>
                      <label>
                        Ghi chú nội bộ cho Operator
                        <input
                          type="text"
                          placeholder="CLB Cầu Lông Kỳ Hòa / Anh Nam"
                          value={inviteNote}
                          onChange={(e) => setInviteNote(e.target.value)}
                        />
                      </label>
                      <button
                        className="lime-button"
                        disabled={creatingInvite}
                        style={{ marginTop: 8 }}
                      >
                        {creatingInvite ? (
                          <LoaderCircle className="spin" size={18} />
                        ) : (
                          <Plus size={18} />
                        )}
                        <span>Tạo Link Lời Mời</span>
                      </button>
                    </form>

                    {generatedInviteLink && (
                      <div className="invite-link-result">
                        <p className="footnote">
                          Gửi link một lần này cho Host để nhận quyền:
                        </p>
                        <div className="link-copy-box">
                          <code>{generatedInviteLink}</code>
                          <button
                            className="dark-button"
                            onClick={() => copyToClipboard(generatedInviteLink)}
                          >
                            {copied ? <Check size={16} /> : <Copy size={16} />}
                            <span>{copied ? "Đã chép" : "Sao chép"}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: VENUES */}
              {tab === "venues" && (
                <div className="venues-tab-content">
                  <div className="stat-cards-row">
                    <div className="mini-stat-card">
                      <span className="mini-stat-val">
                        {metrics.venues.approved}
                      </span>
                      <span className="mini-stat-lbl">Địa điểm Hoạt động</span>
                    </div>
                    <div className="mini-stat-card">
                      <span className="mini-stat-val">
                        {metrics.venues.host_linked}
                      </span>
                      <span className="mini-stat-lbl">Có Host Phụ trách</span>
                    </div>
                    <div className="mini-stat-card">
                      <span className="mini-stat-val">
                        {metrics.venues.pending_review}
                      </span>
                      <span className="mini-stat-lbl">Đang chờ Duyệt</span>
                    </div>
                  </div>

                  <div className="venue-create-card">
                    <h4>Thêm Địa điểm Công cộng Mới vào HCMC</h4>
                    <form onSubmit={handleCreateVenue} className="stack-form">
                      <div className="form-grid">
                        <label>
                          Tên địa điểm
                          <input
                            required
                            placeholder="Sân vận động Hoa Lư"
                            value={venueName}
                            onChange={(e) => setVenueName(e.target.value)}
                          />
                        </label>
                        <label>
                          Khu vực / Quận
                          <input
                            required
                            placeholder="Quận 1"
                            value={venueArea}
                            onChange={(e) => setVenueArea(e.target.value)}
                          />
                        </label>
                      </div>
                      <div className="form-grid">
                        <label>
                          Kinh độ (Longitude)
                          <input
                            required
                            type="number"
                            step="any"
                            value={venueLng}
                            onChange={(e) => setVenueLng(e.target.value)}
                          />
                        </label>
                        <label>
                          Vĩ độ (Latitude)
                          <input
                            required
                            type="number"
                            step="any"
                            value={venueLat}
                            onChange={(e) => setVenueLat(e.target.value)}
                          />
                        </label>
                      </div>
                      <button className="lime-button" disabled={creatingVenue}>
                        {creatingVenue ? (
                          <LoaderCircle className="spin" size={18} />
                        ) : (
                          <Plus size={18} />
                        )}
                        <span>Thêm Địa điểm</span>
                      </button>
                      {venueNotice && (
                        <p className="inline-notice">{venueNotice}</p>
                      )}
                    </form>
                  </div>
                </div>
              )}

              {/* TAB 4: SUPPLY & DEMAND */}
              {tab === "supply" && (
                <div className="supply-tab-content">
                  <div className="stat-cards-row">
                    <div className="mini-stat-card">
                      <span className="mini-stat-val">
                        {metrics.supply.signals_created_7d}
                      </span>
                      <span className="mini-stat-lbl">
                        Hoạt động trong 7 ngày
                      </span>
                    </div>
                    <div className="mini-stat-card">
                      <span className="mini-stat-val">
                        {metrics.supply.signals_active_now}
                      </span>
                      <span className="mini-stat-lbl">
                        Đang diễn ra ngay lúc này
                      </span>
                    </div>
                    <div className="mini-stat-card">
                      <span className="mini-stat-val">
                        {metrics.demand.users_exposed}
                      </span>
                      <span className="mini-stat-lbl">Users Mở Chi tiết</span>
                    </div>
                    <div className="mini-stat-card">
                      <span className="mini-stat-val">
                        {metrics.demand.confirmed_real_world_actions}
                      </span>
                      <span className="mini-stat-lbl">
                        Hành động Đã xác nhận
                      </span>
                    </div>
                  </div>

                  <div className="metrics-columns">
                    <div className="metrics-box">
                      <h5>Phân bố theo Thể loại</h5>
                      <ul className="ops-list">
                        {Object.entries(metrics.supply.by_category).map(
                          ([cat, count]) => (
                            <li key={cat} className="ops-list-item">
                              <span>{cat}</span>
                              <strong>{count}</strong>
                            </li>
                          ),
                        )}
                      </ul>
                    </div>

                    <div className="metrics-box">
                      <h5>Top Địa điểm Nhiều Hoạt động</h5>
                      <ul className="ops-list">
                        {metrics.supply.by_venue.map((v, i) => (
                          <li key={i} className="ops-list-item">
                            <span>{v.place_name}</span>
                            <strong>{v.signal_count}</strong>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {metrics.supply.zero_qualified_opens.length > 0 && (
                    <div className="zero-opens-card">
                      <h5>
                        Hoạt động Chưa có Lượt mở Qualified (&lt; 2s hoặc chưa
                        tương tác)
                      </h5>
                      <ul className="ops-list">
                        {metrics.supply.zero_qualified_opens.map((s) => (
                          <li key={s.id} className="ops-list-item">
                            <span>{s.title}</span>
                            <span className="footnote">
                              {new Date(s.starts_at).toLocaleDateString(
                                "vi-VN",
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: MODERATION */}
              {tab === "moderation" && (
                <div className="moderation-tab-content">
                  <div className="stat-cards-row">
                    <div className="mini-stat-card">
                      <span className="mini-stat-val">
                        {metrics.moderation.reports_count}
                      </span>
                      <span className="mini-stat-lbl">
                        Lượt Báo cáo Hoạt động
                      </span>
                    </div>
                    <div className="mini-stat-card">
                      <span className="mini-stat-val">
                        {metrics.moderation.not_there_count}
                      </span>
                      <span className="mini-stat-lbl">
                        Báo Không thấy Diễn ra
                      </span>
                    </div>
                  </div>
                  <p className="footnote" style={{ marginTop: 12 }}>
                    Cơ chế bảo vệ: Hoạt động có từ 2 lượt báo &quot;không
                    thấy&quot; sẽ bị hạ độ tin cậy xuống mức &quot;Cần kiểm
                    tra&quot; (questionable).
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
