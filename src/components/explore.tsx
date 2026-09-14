"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowDownUp,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Compass,
  ExternalLink,
  Flag,
  LocateFixed,
  MapPin,
  Music2,
  Plus,
  Search,
  Share2,
  Sparkles,
  Users,
  X,
  CircleHelp,
  LoaderCircle,
  LogOut,
  List,
  Map as MapIcon,
  ShieldCheck,
  Activity,
  Palette,
  ChevronDown,
} from "lucide-react";
import {
  CATEGORIES,
  CONFIDENCE_LABELS,
  HCMC_CITY,
  REFRESH_MS,
  boundsSchema,
  distanceKm,
  filterSignals,
  isWithinCity,
  timeLabel,
  type Bounds,
  type Category,
  type CityConfig,
  type Place,
  type Signal,
  type Viewer,
} from "@/lib/domain";
import { browserSupabase } from "@/lib/supabase";
import { trackEvent } from "@/lib/analytics";
const ActivityMap = dynamic(
  () => import("./activity-map").then((m) => m.ActivityMap),
  {
    ssr: false,
    loading: () => (
      <div className="map-loading">
        <LoaderCircle className="spin" /> Đang mở bản đồ…
      </div>
    ),
  },
);
const categoryIcons = {
  sport: Activity,
  music: Music2,
  workshop: Palette,
  community: Users,
};
type ModerationReport = { id: string; title: string; report_count: number };
class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
type SignalState = {
  attendance: string | null;
  verification: string | null;
  reported: boolean;
  is_owner: boolean;
};
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
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
  const body = await response.json();
  if (!response.ok)
    throw new ApiError(
      body.error || "Có lỗi kết nối. Vui lòng thử lại.",
      response.status,
    );
  return body as T;
}
function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className={`modal ${wide ? "detail-modal" : ""}`}>
          <Dialog.Close className="close-button" aria-label="Đóng">
            <X size={22} />
          </Dialog.Close>
          <Dialog.Title className="modal-title">{title}</Dialog.Title>
          <Dialog.Description className="modal-description">
            {description}
          </Dialog.Description>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Explore({ initialId }: { initialId?: string }) {
  const [city, setCity] = useState<CityConfig>(HCMC_CITY);
  const [signals, setSignals] = useState<Signal[]>([]),
    [places, setPlaces] = useState<Place[]>([]);
  const [mode, setMode] = useState<"demo" | "live">("demo"),
    [ready, setReady] = useState(false),
    [loading, setLoading] = useState(true);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [category, setCategory] = useState("all"),
    [query, setQuery] = useState("");
  const [bounds, setBounds] = useState<Bounds>(() => {
      if (typeof window !== "undefined" && window.location.search) {
        const params = new URLSearchParams(window.location.search);
        const w = params.get("west"),
          s = params.get("south"),
          e = params.get("east"),
          n = params.get("north");
        if (w && s && e && n) {
          const parsed = boundsSchema.safeParse({
            west: Number(w),
            south: Number(s),
            east: Number(e),
            north: Number(n),
            city_id: params.get("city_id") ?? HCMC_CITY.id,
          });
          if (parsed.success) {
            return parsed.data;
          }
        }
      }
      return {
        west: 106.62,
        south: 10.77,
        east: 106.73,
        north: 10.86,
        city_id: HCMC_CITY.id,
      };
    }),
    [location, setLocation] = useState<[number, number] | null>(null);
  const [selected, setSelected] = useState<Signal | null>(null),
    [myState, setMyState] = useState<SignalState | null>(null);
  const [loginOpen, setLoginOpen] = useState(false),
    [createOpen, setCreateOpen] = useState(false),
    [viewer, setViewer] = useState<Viewer | null>(null);
  const [pending, setPending] = useState(false),
    [mobileView, setMobileView] = useState("list"),
    [truncated, setTruncated] = useState(false);
  const [moderationOpen, setModerationOpen] = useState(false);
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [sort, setSort] = useState<"time" | "distance">("time");
  const selectedRef = useRef(selected);
  const detailVersion = useRef(0);
  const version = useRef(0);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  const load = useCallback(async () => {
    const current = ++version.current;
    try {
      const result = await api<{
        mode: "demo" | "live";
        signals: Signal[];
        truncated: boolean;
      }>(
        `/api/signals?${new URLSearchParams(Object.entries(bounds).map(([key, value]) => [key, String(value)]))}`,
      );
      if (current !== version.current) return;
      setSignals(result.signals);
      setMode(result.mode);
      setTruncated(result.truncated);
      setError("");
      if (selectedRef.current && result.mode === "live") {
        const expectedId = selectedRef.current.id;
        const detail = await api<{ signal: Signal; state: SignalState | null }>(
          `/api/signals/${expectedId}`,
        ).catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 404) return null;
          throw error;
        });
        if (
          current !== version.current ||
          selectedRef.current?.id !== expectedId
        )
          return;
        if (detail) {
          setSelected(detail.signal);
          setMyState(detail.state);
        } else {
          setSelected(null);
          setNotice(
            "Hoạt động không còn khả dụng. Hãy chọn một hoạt động khác.",
          );
        }
      }
    } catch (e) {
      if (current === version.current) {
        setError((e as Error).message);
        setSignals([]);
      }
    } finally {
      if (current === version.current) setLoading(false);
    }
  }, [bounds]);
  useEffect(() => {
    void api<{ mode: "demo" | "live"; places: Place[]; city?: CityConfig }>(
      "/api/bootstrap",
    )
      .then((data) => {
        setMode(data.mode);
        setPlaces(data.places);
        if (data.city) setCity(data.city);
        setReady(true);
      })
      .catch((e) => setError(e.message));
    const db = browserSupabase();
    if (!db) return;
    const refreshViewer = () => {
      void api<{ viewer: Viewer | null }>("/api/auth/me")
        .then((data) => setViewer(data.viewer))
        .catch(() => setViewer(null));
    };
    refreshViewer();
    const { data } = db.auth.onAuthStateChange(() => {
      queueMicrotask(refreshViewer);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    // Coalesce mount/viewport changes before starting external I/O.
    const initialFrame = requestAnimationFrame(() => {
      void load();
    });
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
    const refresh = () => {
      if (!document.hidden) void load();
    };
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelAnimationFrame(initialFrame);
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);
  const openSignal = useCallback(
    async (signal: Signal) => {
      const currentDetail = ++detailVersion.current;
      selectedRef.current = signal;
      setNotice("");
      setMyState(null);
      setSelected(signal);
      trackEvent({
        type: "signal_opened",
        signal_id: signal.id,
        city_id: city.id,
        category: signal.category,
      });
      try {
        const result = await api<{ signal: Signal; state: SignalState | null }>(
          `/api/signals/${signal.id}`,
        );
        if (currentDetail !== detailVersion.current) return;
        setSelected(result.signal);
        setMyState(result.state ?? null);
      } catch (e) {
        if (currentDetail !== detailVersion.current) return;
        setSelected(null);
        setNotice((e as Error).message);
      }
    },
    [city.id],
  );
  useEffect(() => {
    if (!initialId) return;
    void api<{ signal: Signal; state: SignalState | null }>(
      `/api/signals/${initialId}`,
    )
      .then((data) => {
        setSelected(data.signal);
        setMyState(data.state ?? null);
      })
      .catch((e) => setNotice(e.message));
  }, [initialId]);
  useEffect(() => {
    const db = browserSupabase();
    if (!db || !places.length) return;
    const cells = [
      ...new Set(
        places
          .filter(
            (p) =>
              p.longitude >= bounds.west &&
              p.longitude <= bounds.east &&
              p.latitude >= bounds.south &&
              p.latitude <= bounds.north,
          )
          .map((p) => p.h3_parent),
      ),
    ];
    const channels = cells.map((cell) =>
      db
        .channel(`signals:hcm:${cell}`)
        .on("broadcast", { event: "invalidate" }, () => {
          void load();
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") void load();
        }),
    );
    return () => {
      channels.forEach((channel) => {
        void db.removeChannel(channel);
      });
    };
  }, [places, bounds, load]);
  const locate = () => {
    if (!navigator.geolocation) {
      setNotice(
        "Thiết bị chưa hỗ trợ vị trí. Bạn có thể chọn hoạt động trên bản đồ.",
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!isWithinCity([coords.longitude, coords.latitude], city)) {
          setNotice(
            `Vị trí của bạn nằm ngoài ${city.name}. Bản đồ đang hiển thị khu vực ${city.name}.`,
          );
          return;
        }
        setLocation([coords.longitude, coords.latitude]);
        setSort("distance");
        trackEvent({
          type: "area_selected",
          city_id: city.id,
          area_name: "current_user_location",
        });
      },
      () =>
        setNotice(
          "Chưa có quyền vị trí. Bạn vẫn có thể xem hoạt động theo khu vực.",
        ),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  };
  const act = async (action: string, reason = "") => {
    if (!selected || mode === "demo") return;
    if (!viewer) {
      setLoginOpen(true);
      return;
    }
    setPending(true);
    setNotice("");
    try {
      await api(`/api/signals/${selected.id}`, {
        method: "POST",
        body: JSON.stringify({ action, reason }),
      });
      if (action === "join") {
        trackEvent({
          type: "join_clicked",
          signal_id: selected.id,
          city_id: city.id,
        });
      } else if (action === "go") {
        trackEvent({
          type: "go_clicked",
          signal_id: selected.id,
          city_id: city.id,
        });
      } else if (action === "confirm") {
        trackEvent({
          type: "confirmation_submitted",
          signal_id: selected.id,
          city_id: city.id,
        });
      } else if (action === "not_there") {
        trackEvent({
          type: "not_there_submitted",
          signal_id: selected.id,
          city_id: city.id,
        });
      } else if (action === "report") {
        trackEvent({
          type: "report_submitted",
          signal_id: selected.id,
          city_id: city.id,
          reason_code: reason,
        });
      }
      setNotice(
        action === "report"
          ? "Đã gửi báo cáo cho người kiểm duyệt."
          : action === "resolve" || action === "remove"
            ? "Hoạt động đã được ẩn."
            : "Đã ghi nhận. Cảm ơn bạn!",
      );
      await load();
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setPending(false);
    }
  };
  const filtered = filterSignals(signals, category, query).sort((a, b) =>
    sort === "distance"
      ? distanceKm(location ?? city.default_center, [a.longitude, a.latitude]) -
        distanceKm(location ?? city.default_center, [b.longitude, b.latitude])
      : Date.parse(a.starts_at) - Date.parse(b.starts_at),
  );
  return (
    <div className="app-shell">
      <a href="#activities" className="skip-link">
        Đến danh sách hoạt động
      </a>
      <header className="topbar">
        <Link
          className="brand"
          href="/"
          aria-label="Vietnam Social — Trang chủ"
        >
          <span className="brand-symbol">
            <Compass size={25} strokeWidth={2.5} />
          </span>
          <span>
            vietnam<span className="brand-light">social</span>
            <span className="brand-period">.</span>
          </span>
        </Link>
        <nav aria-label="Điều hướng chính">
          <span className="nav-active">Khám phá</span>
          <span className="pilot-badge">{city.name}</span>
        </nav>
        <div className="header-actions">
          {viewer?.role === "moderator" && (
            <button
              className="quiet-button"
              onClick={async () => {
                try {
                  const data = await api<{ reports: ModerationReport[] }>(
                    "/api/moderation",
                  );
                  setReports(data.reports);
                  setModerationOpen(true);
                } catch (e) {
                  setNotice((e as Error).message);
                }
              }}
            >
              Báo cáo
            </button>
          )}
          {viewer ? (
            <button
              className="quiet-button account-button"
              onClick={async () => {
                await browserSupabase()?.auth.signOut();
                setViewer(null);
                setMyState(null);
              }}
            >
              <LogOut size={17} /> Đăng xuất
            </button>
          ) : (
            <button
              className="quiet-button login-button"
              onClick={() => setLoginOpen(true)}
            >
              Đăng nhập
            </button>
          )}
          <button
            className="dark-button"
            aria-label="Đăng hoạt động"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={18} />
            <span>Đăng hoạt động</span>
          </button>
        </div>
      </header>
      {mode === "demo" && (
        <div className="demo-bar">
          <CircleHelp size={15} />
          <span>
            <strong>Bản xem thử.</strong> Địa điểm và hoạt động là minh họa;
            chưa ghi nhận đăng ký.
          </span>
        </div>
      )}
      <main className="workspace">
        <aside
          className={`discovery-panel ${mobileView === "map" ? "mobile-hidden" : ""}`}
        >
          <div className="panel-intro">
            <div className="eyebrow">
              <span className="live-dot" /> SÀI GÒN, MÌNH ĐI ĐÂU?
            </div>
            <h1>
              Một cuộc hẹn
              <br /> ở ngay <span>gần bạn.</span>
            </h1>
            <p>Tìm điều bạn muốn làm trong 6 giờ tới.</p>
          </div>
          <div className="search-field">
            <Search size={19} />
            <input
              aria-label="Tìm hoạt động hoặc địa điểm"
              placeholder="Cầu lông, acoustic, cà phê…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button aria-label="Xóa tìm kiếm" onClick={() => setQuery("")}>
                <X size={16} />
              </button>
            )}
          </div>
          <div className="area-row">
            <MapPin size={17} />
            <span>Gò Vấp · Phú Nhuận · Tân Bình</span>
            <button onClick={locate} aria-label="Dùng vị trí của tôi">
              <LocateFixed size={19} />
            </button>
          </div>
          <div className="category-chips" aria-label="Loại hoạt động">
            <button
              className={category === "all" ? "active" : ""}
              aria-pressed={category === "all"}
              onClick={() => setCategory("all")}
            >
              <Sparkles size={15} />
              Tất cả
            </button>
            {Object.entries(CATEGORIES).map(([key, value]) => {
              const Icon = categoryIcons[key as Category];
              return (
                <button
                  key={key}
                  className={category === key ? "active" : ""}
                  aria-pressed={category === key}
                  onClick={() => setCategory(key)}
                >
                  <Icon size={15} />
                  {value.label}
                </button>
              );
            })}
          </div>
          <div className="results-heading">
            <h2>
              {loading
                ? "Đang tìm hoạt động…"
                : `${filtered.length}${truncated ? "+" : ""} hoạt động${mode === "demo" ? " mẫu" : ""}`}
            </h2>
            <button
              className="sort-button"
              onClick={() => {
                if (sort === "time") {
                  if (!location) locate();
                  else setSort("distance");
                } else setSort("time");
              }}
            >
              <ArrowDownUp size={14} />
              {sort === "time" ? "Sắp bắt đầu" : "Gần nhất"}
            </button>
          </div>
          <div className="activities" id="activities" tabIndex={-1}>
            {error && (
              <div className="empty-state" role="alert">
                <CircleHelp />
                <h3>Chưa kết nối được</h3>
                <p>{error}</p>
                <button className="dark-button" onClick={() => void load()}>
                  Thử lại
                </button>
              </div>
            )}
            {!error && !loading && filtered.length === 0 && (
              <div className="empty-state">
                <MapPin />
                {signals.length === 0 ? (
                  <>
                    <h3>Chưa có hoạt động đang diễn ra trong khu vực này.</h3>
                    <p>
                      Vietnam Social chỉ hiển thị các hoạt động thực tế có điểm
                      hẹn trong vài giờ tới. Bạn có thể di chuyển bản đồ sang
                      khu vực lân cận hoặc trở về trung tâm {city.name}.
                    </p>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                        justifyContent: "center",
                      }}
                    >
                      <button
                        className="quiet-button"
                        onClick={() => {
                          setCategory("all");
                          setQuery("");
                          setBounds({
                            west: city.default_center[0] - 0.03,
                            south: city.default_center[1] - 0.03,
                            east: city.default_center[0] + 0.03,
                            north: city.default_center[1] + 0.03,
                            city_id: city.id,
                          });
                          setLocation(city.default_center);
                        }}
                      >
                        Về trung tâm {city.name}
                      </button>
                      {viewer &&
                        (viewer.role === "host" ||
                          viewer.role === "moderator") && (
                          <button
                            className="dark-button"
                            onClick={() => setCreateOpen(true)}
                          >
                            Tạo hoạt động mới
                          </button>
                        )}
                    </div>
                  </>
                ) : (
                  <>
                    <h3>Chưa có cuộc hẹn phù hợp</h3>
                    <p>Thử loại hoạt động khác hoặc xóa từ khóa tìm kiếm.</p>
                    <button
                      className="quiet-button"
                      onClick={() => {
                        setCategory("all");
                        setQuery("");
                      }}
                    >
                      Xóa bộ lọc
                    </button>
                  </>
                )}
              </div>
            )}
            {filtered.map((signal) => {
              const Icon = categoryIcons[signal.category];
              return (
                <button
                  className={`activity-card ${selected?.id === signal.id ? "selected" : ""}`}
                  key={signal.id}
                  onClick={() => void openSignal(signal)}
                >
                  <span
                    className="activity-icon"
                    style={{ background: CATEGORIES[signal.category].color }}
                  >
                    <Icon size={26} strokeWidth={1.7} />
                  </span>
                  <span className="activity-content">
                    <span className="card-topline">
                      <span>{CATEGORIES[signal.category].label}</span>
                      <span className="time-badge">
                        {timeLabel(signal.starts_at)}
                      </span>
                    </span>
                    <strong>{signal.title}</strong>
                    <span className="place-line">
                      {signal.place_name} · {signal.area}
                    </span>
                    <span className="card-bottom">
                      <span>
                        <Clock3 size={13} />
                        Đến {timeLabel(signal.expires_at)}
                      </span>
                      {location && (
                        <span>
                          {distanceKm(location, [
                            signal.longitude,
                            signal.latitude,
                          ]).toFixed(1)}{" "}
                          km
                        </span>
                      )}
                      <span className="confidence-dot">
                        {signal.is_demo
                          ? "Minh họa"
                          : CONFIDENCE_LABELS[signal.confidence]}
                      </span>
                    </span>
                  </span>
                  <ArrowRight className="card-arrow" size={17} />
                </button>
              );
            })}
            {truncated && (
              <p className="footnote">
                Đang hiển thị tối đa 100 hoạt động. Phóng to bản đồ để xem khu
                vực cụ thể hơn.
              </p>
            )}
          </div>
          <div className="panel-footer">
            <ShieldCheck size={16} />
            <span>Không theo dõi vị trí liên tục.</span>
            <span className="footer-index">01 / KHÁM PHÁ</span>
          </div>
        </aside>
        <section
          className={`map-panel ${mobileView === "list" ? "mobile-hidden" : ""}`}
          aria-label="Bản đồ"
        >
          <ActivityMap
            signals={filtered}
            selectedId={selected?.id}
            onSelect={(signal) => void openSignal(signal)}
            onBounds={setBounds}
            location={location}
            city={city}
            initialBounds={bounds}
          />
          <button className="locate-map" onClick={locate}>
            <LocateFixed size={18} /> Vị trí của tôi
          </button>
          <div className="map-key">
            {Object.entries(CATEGORIES).map(([key, value]) => (
              <span key={key}>
                <i style={{ background: value.color }} />
                {value.label}
              </span>
            ))}
          </div>
        </section>
        <button
          className="mobile-toggle dark-button"
          onClick={() => setMobileView(mobileView === "list" ? "map" : "list")}
        >
          {mobileView === "list" ? <MapIcon size={18} /> : <List size={18} />}{" "}
          {mobileView === "list" ? "Xem bản đồ" : "Xem danh sách"}
        </button>
      </main>
      {notice && !selected && (
        <div className="toast" role="status">
          {notice}
          <button aria-label="Đóng thông báo" onClick={() => setNotice("")}>
            <X size={17} />
          </button>
        </div>
      )}
      <Modal
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) {
            detailVersion.current += 1;
            selectedRef.current = null;
            setSelected(null);
            setMyState(null);
            setNotice("");
          }
        }}
        title={selected?.title ?? "Hoạt động"}
        description={
          selected
            ? `${CATEGORIES[selected.category].label} · ${selected.area}`
            : ""
        }
        wide
      >
        {selected && (
          <>
            <div
              className="detail-banner"
              style={{ background: CATEGORIES[selected.category].color }}
            >
              {(() => {
                const Icon = categoryIcons[selected.category];
                return <Icon size={65} strokeWidth={1.2} />;
              })()}
              <span>
                {CATEGORIES[selected.category].label.toUpperCase()}
                <strong>{timeLabel(selected.starts_at)}</strong>
              </span>
            </div>
            <div className="detail-facts">
              <div>
                <Clock3 />
                <span>
                  Bắt đầu — kết thúc
                  <strong>
                    {timeLabel(selected.starts_at)} —{" "}
                    {timeLabel(selected.expires_at)}
                  </strong>
                </span>
              </div>
              <div>
                <MapPin />
                <span>
                  Địa điểm công cộng<strong>{selected.place_name}</strong>
                </span>
              </div>
              <div>
                <Users />
                <span>
                  Chỗ tham gia
                  <strong>
                    {selected.capacity_note ||
                      "Liên hệ người tổ chức tại địa điểm"}
                  </strong>
                </span>
              </div>
            </div>
            <p className="detail-description">{selected.description}</p>
            <div className="source-box">
              <ShieldCheck size={20} />
              <div>
                <strong>{selected.source_label}</strong>
                <span>
                  {CONFIDENCE_LABELS[selected.confidence]} ·{" "}
                  {selected.confirmation_count} xác nhận
                </span>
              </div>
            </div>
            {mode === "demo" && (
              <p className="demo-note">
                Đây là hoạt động mẫu. Bạn chưa thể đăng ký hay đến địa điểm này.
              </p>
            )}
            <div className="detail-primary">
              <button
                className="lime-button"
                disabled={
                  pending || mode === "demo" || myState?.attendance === "join"
                }
                onClick={() => void act("join")}
              >
                {myState?.attendance === "join" ? (
                  <Check />
                ) : (
                  <Plus size={19} />
                )}{" "}
                {myState?.attendance === "join"
                  ? "Đã tham gia"
                  : "Tôi muốn tham gia"}
              </button>
              <button
                className="outline-button"
                disabled={pending || mode === "demo"}
                onClick={() => void act("go")}
              >
                {myState?.attendance === "go" ? "Đã chọn đi" : "Tôi sẽ đến"}
                <ArrowRight size={17} />
              </button>
            </div>
            <div className="verification">
              <h3>Bạn đã đến đây?</h3>
              <p>Xác nhận điều bạn trực tiếp nhìn thấy.</p>
              <div>
                <button
                  disabled={
                    pending ||
                    mode === "demo" ||
                    myState?.is_owner ||
                    myState?.verification === "confirm"
                  }
                  onClick={() => void act("confirm")}
                >
                  <CheckCircle2 size={17} />
                  {myState?.verification === "confirm"
                    ? "Đã xác nhận"
                    : "Đang diễn ra"}
                </button>
                <button
                  disabled={
                    pending ||
                    mode === "demo" ||
                    myState?.is_owner ||
                    myState?.verification === "not_there"
                  }
                  onClick={() => void act("not_there")}
                >
                  <CircleHelp size={17} />
                  {myState?.verification === "not_there"
                    ? "Đã báo không thấy"
                    : "Không thấy hoạt động"}
                </button>
              </div>
            </div>
            <div className="detail-tools">
              <button
                onClick={async () => {
                  try {
                    trackEvent({
                      type: "share_clicked",
                      signal_id: selected.id,
                      city_id: city.id,
                    });
                    await navigator.clipboard.writeText(
                      `${window.location.origin}/s/${selected.id}`,
                    );
                    setNotice("Đã sao chép liên kết.");
                  } catch {
                    setNotice(
                      `Liên kết: ${window.location.origin}/s/${selected.id}`,
                    );
                  }
                }}
              >
                <Share2 size={16} />
                Chia sẻ
              </button>
              {mode === "live" && (
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selected.latitude},${selected.longitude}`}
                >
                  <ExternalLink size={16} />
                  Chỉ đường
                </a>
              )}
              <button
                disabled={pending || mode === "demo" || myState?.reported}
                onClick={() => void act("report")}
              >
                <Flag size={16} />
                {myState?.reported ? "Đã báo cáo" : "Báo cáo"}
              </button>
            </div>
            {myState?.is_owner && (
              <button
                className="outline-button full-width"
                disabled={pending}
                onClick={() => void act("resolve")}
              >
                Kết thúc hoạt động của tôi
              </button>
            )}
            {viewer?.role === "moderator" && (
              <button
                className="outline-button full-width"
                disabled={pending}
                onClick={() => void act("remove")}
              >
                Ẩn hoạt động vi phạm
              </button>
            )}
            {notice && (
              <p className="inline-notice" role="status">
                {notice}
              </p>
            )}
          </>
        )}
      </Modal>
      <Modal
        open={moderationOpen}
        onOpenChange={setModerationOpen}
        title="Báo cáo cần xem xét"
        description="Hoạt động đang hiển thị được thành viên báo cáo."
      >
        {reports.length === 0 ? (
          <p>Chưa có báo cáo đang mở.</p>
        ) : (
          reports.map((report) => (
            <button
              className="activity-card"
              key={report.id}
              onClick={async () => {
                try {
                  const data = await api<{ signal: Signal }>(
                    `/api/signals/${report.id}`,
                  );
                  setModerationOpen(false);
                  await openSignal(data.signal);
                } catch (e) {
                  setNotice((e as Error).message);
                }
              }}
            >
              <span>
                <strong>{report.title}</strong>
                <br />
                {report.report_count} báo cáo
              </span>
              <ArrowRight size={18} />
            </button>
          ))
        )}
      </Modal>
      <AuthModal open={loginOpen} setOpen={setLoginOpen} mode={mode} />
      <CreateModal
        open={createOpen}
        setOpen={setCreateOpen}
        places={places}
        mode={mode}
        viewer={viewer}
        ready={ready}
        onLogin={() => {
          setCreateOpen(false);
          setLoginOpen(true);
        }}
        onCreated={async (id) => {
          setCreateOpen(false);
          await load();
          const detail = await api<{ signal: Signal }>(
            `/api/signals/${id}`,
          ).catch(() => null);
          if (detail) void openSignal(detail.signal);
          else
            setNotice(
              "Đã đăng hoạt động. Hoạt động sẽ hiện trên bản đồ trong 6 giờ trước khi bắt đầu.",
            );
        }}
      />
    </div>
  );
}
function AuthModal({
  open,
  setOpen,
  mode,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  mode: string;
}) {
  const [signup, setSignup] = useState(false),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title={signup ? "Tạo tài khoản" : "Chào bạn trở lại."}
      description="Đăng nhập để tham gia và xác nhận hoạt động."
    >
      {mode === "demo" ? (
        <div className="empty-state">
          <Compass />
          <h3>Đang ở bản xem thử</h3>
          <p>
            Đăng nhập sẽ khả dụng khi kết nối Supabase local. Bạn có thể tiếp
            tục khám phá các hoạt động mẫu.
          </p>
          <button className="dark-button" onClick={() => setOpen(false)}>
            Tiếp tục khám phá
          </button>
        </div>
      ) : (
        <form
          className="stack-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            setMessage("");
            const values = new FormData(e.currentTarget);
            const db = browserSupabase()!;
            const credentials = {
              email: String(values.get("email")),
              password: String(values.get("password")),
            };
            try {
              const result = signup
                ? await db.auth.signUp(credentials)
                : await db.auth.signInWithPassword(credentials);
              if (result.error) {
                setMessage(
                  "Chưa đăng nhập được. Kiểm tra email, mật khẩu hoặc thư xác nhận.",
                );
              } else if (result.data.session) setOpen(false);
              else setMessage("Kiểm tra email để xác nhận tài khoản.");
            } catch {
              setMessage("Mất kết nối. Vui lòng thử lại.");
            } finally {
              setPending(false);
            }
          }}
        >
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="ban@example.com"
            />
          </label>
          <label>
            Mật khẩu
            <input
              name="password"
              type="password"
              minLength={8}
              maxLength={128}
              autoComplete={signup ? "new-password" : "current-password"}
              required
            />
          </label>
          <p className="footnote">
            Tài khoản mới có quyền thành viên. Quyền đăng hoạt động do người vận
            hành cấp cho host.
          </p>
          <button className="lime-button" disabled={pending}>
            {pending ? "Đang xử lý…" : signup ? "Tạo tài khoản" : "Đăng nhập"}
            <ArrowRight size={18} />
          </button>
          <button
            className="quiet-button"
            type="button"
            onClick={() => {
              setSignup(!signup);
              setMessage("");
            }}
          >
            {signup
              ? "Đã có tài khoản? Đăng nhập"
              : "Chưa có tài khoản? Đăng ký"}
          </button>
          {message && (
            <p role="status" className="inline-notice">
              {message}
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}
function CreateModal({
  open,
  setOpen,
  places,
  mode,
  viewer,
  ready,
  onLogin,
  onCreated,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  places: Place[];
  mode: string;
  viewer: Viewer | null;
  ready: boolean;
  onLogin: () => void;
  onCreated: (id: string) => Promise<void>;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  const requestId = useRef<string | null>(null);
  const lastBody = useRef("");
  const allowed =
    ready &&
    mode === "live" &&
    (viewer?.role === "host" || viewer?.role === "moderator");
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="Rủ mọi người cùng tham gia."
      description="Một hoạt động, một địa điểm công cộng, một cuộc hẹn rõ ràng."
    >
      <form
        className="stack-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!allowed) return;
          setPending(true);
          setError("");
          const form = new FormData(e.currentTarget);
          try {
            const fields = {
              title: String(form.get("title")),
              description: String(form.get("description")),
              category: String(form.get("category")),
              place_id: String(form.get("place_id")),
              starts_at: new Date(
                `${form.get("starts_at")}:00+07:00`,
              ).toISOString(),
              expires_at: new Date(
                `${form.get("expires_at")}:00+07:00`,
              ).toISOString(),
              capacity_note: String(form.get("capacity_note")),
            };
            const serialized = JSON.stringify(fields);
            if (!requestId.current || lastBody.current !== serialized) {
              requestId.current = crypto.randomUUID();
              lastBody.current = serialized;
            }
            const result = await api<{ id: string }>("/api/signals", {
              method: "POST",
              body: JSON.stringify({
                ...fields,
                request_id: requestId.current,
              }),
            });
            requestId.current = null;
            await onCreated(result.id);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setPending(false);
          }
        }}
      >
        {mode === "demo" && (
          <p className="demo-note">
            Bạn có thể xem mẫu biểu. Việc đăng hoạt động cần Supabase local và
            tài khoản host.
          </p>
        )}
        {mode === "live" && !viewer && (
          <button type="button" className="outline-button" onClick={onLogin}>
            Đăng nhập để tiếp tục
          </button>
        )}
        {mode === "live" && viewer?.role === "member" && (
          <p className="demo-note">
            Bạn đang là thành viên. Người vận hành cần cấp quyền host trước khi
            bạn có thể đăng hoạt động.
          </p>
        )}
        <label>
          Tên hoạt động
          <input
            name="title"
            required
            minLength={8}
            maxLength={100}
            placeholder="Ví dụ: Cầu lông tối nay, còn 2 chỗ"
          />
        </label>
        <div className="form-grid">
          <label>
            Loại hoạt động
            <span className="select-wrap">
              <select name="category" aria-label="Loại hoạt động">
                {Object.entries(CATEGORIES).map(([key, value]) => (
                  <option value={key} key={key}>
                    {value.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} />
            </span>
          </label>
          <label>
            Địa điểm công cộng
            <span className="select-wrap">
              <select
                name="place_id"
                aria-label="Địa điểm công cộng"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Chọn địa điểm
                </option>
                {places.map((place) => (
                  <option value={place.id} key={place.id}>
                    {place.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} />
            </span>
          </label>
        </div>
        <div className="form-grid">
          <label>
            Bắt đầu (giờ Việt Nam)
            <input name="starts_at" type="datetime-local" required />
          </label>
          <label>
            Kết thúc (giờ Việt Nam)
            <input name="expires_at" type="datetime-local" required />
          </label>
        </div>
        <label>
          Thông tin chỗ tham gia
          <input
            name="capacity_note"
            maxLength={100}
            placeholder="Ví dụ: Còn 2 chỗ · chia tiền sân"
          />
        </label>
        <label>
          Mô tả ngắn
          <textarea
            name="description"
            maxLength={600}
            rows={3}
            placeholder="Mọi người cần biết hoặc mang theo gì?"
          />
        </label>
        <p className="footnote">
          Chỉ dùng địa điểm công cộng đã được duyệt. Hoạt động tự ẩn khi hết
          hạn, tối đa 24 giờ sau khi bắt đầu.
        </p>
        <button
          className="lime-button"
          disabled={!allowed || pending || places.length === 0}
        >
          {pending ? "Đang đăng…" : "Đăng hoạt động"}
          <ArrowRight size={18} />
        </button>
        {error && (
          <p role="alert" className="inline-notice">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
