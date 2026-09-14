"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Marker, type Map as MapInstance } from "maplibre-gl";
import {
  Activity,
  AlertCircle,
  MapPin,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { HCMC_CITY, type Bounds, type CityConfig } from "@/lib/domain";
import { publicConfig } from "@/lib/env";
import type { SocialMapEntity } from "@/lib/social-map";
import styles from "./vietnam-social-v1.module.css";

const PIN_LABEL: Record<SocialMapEntity["kind"], string> = {
  local_post: "Bài",
  community: "Nhóm",
  activity: "Hẹn",
  place: "Nơi",
};

function compactTitle(value: string) {
  const clean = value.trim();
  return clean.length > 42 ? `${clean.slice(0, 39)}…` : clean;
}

export function UnifiedSocialMap({
  entities,
  selectedKey,
  onSelect,
  onBounds,
  city = HCMC_CITY,
  initialBounds,
}: {
  entities: SocialMapEntity[];
  selectedKey?: string;
  onSelect: (entity: SocialMapEntity) => void;
  onBounds: (bounds: Bounds) => void;
  city?: CityConfig;
  initialBounds?: Bounds;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapInstance>(null);
  const selectRef = useRef(onSelect);
  const boundsRef = useRef(onBounds);
  const initialBoundsRef = useRef(initialBounds);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [zoom, setZoom] = useState(city.default_zoom);

  useEffect(() => {
    selectRef.current = onSelect;
    boundsRef.current = onBounds;
  });

  useEffect(() => {
    let disposed = false;
    let instance: MapInstance | undefined;
    let observer: ResizeObserver | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    void import("maplibre-gl")
      .then(({ Map, NavigationControl, setWorkerUrl }) => {
        if (disposed || !container.current) return;
        setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
        const initial = initialBoundsRef.current;
        const center: [number, number] = initial
          ? [
              (initial.west + initial.east) / 2,
              (initial.south + initial.north) / 2,
            ]
          : city.default_center;
        const margin = 0.05;
        instance = new Map({
          container: container.current,
          style: publicConfig().style,
          center,
          zoom: city.default_zoom,
          minZoom: 10,
          maxZoom: 17,
          maxBounds: [
            [
              city.operational_bounds.west - margin,
              city.operational_bounds.south - margin,
            ],
            [
              city.operational_bounds.east + margin,
              city.operational_bounds.north + margin,
            ],
          ],
          attributionControl: { compact: true },
        });
        map.current = instance;
        setMapReady(true);
        instance.addControl(
          new NavigationControl({ showCompass: false }),
          "bottom-right",
        );
        instance.on("load", () => {
          setLoaded(true);
          setFailed(false);
          setZoom(instance?.getZoom() ?? city.default_zoom);
          clearTimeout(timeout);
        });
        instance.on("error", () => setFailed(true));
        instance.on("moveend", () => {
          const b = instance!.getBounds();
          setZoom(instance!.getZoom());
          boundsRef.current({
            west: b.getWest(),
            south: b.getSouth(),
            east: b.getEast(),
            north: b.getNorth(),
            city_id: city.id,
          });
        });
        timeout = setTimeout(() => {
          if (!instance?.loaded()) setFailed(true);
        }, 15_000);
        observer = new ResizeObserver(() => instance?.resize());
        observer.observe(container.current);
      })
      .catch(() => setFailed(true));

    return () => {
      disposed = true;
      clearTimeout(timeout);
      observer?.disconnect();
      instance?.remove();
      map.current = null;
    };
  }, [city]);

  useEffect(() => {
    if (!map.current) return;
    const visible = entities.filter(
      (entity) => entity.kind !== "place" || zoom >= 13,
    );
    const expandLabels = zoom >= 14.5 && visible.length <= 10;
    const markers = visible.map((entity) => {
      const key = `${entity.kind}:${entity.id}`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "vs-map-pin";
      button.dataset.kind = entity.kind;
      button.dataset.selected = selectedKey === key ? "true" : "false";
      button.dataset.expanded =
        selectedKey === key || expandLabels ? "true" : "false";
      button.setAttribute(
        "aria-label",
        `Mở ${entity.title} tại ${entity.area}`,
      );

      const kind = document.createElement("span");
      kind.className = "vs-map-pin__kind";
      kind.textContent = PIN_LABEL[entity.kind];
      kind.setAttribute("aria-hidden", "true");

      const label = document.createElement("span");
      label.className = "vs-map-pin__label";
      label.textContent = compactTitle(entity.title);
      label.setAttribute("aria-hidden", "true");

      button.append(kind, label);
      button.addEventListener("click", () => selectRef.current(entity));
      return new Marker({ element: button, anchor: "bottom" })
        .setLngLat([entity.longitude, entity.latitude])
        .addTo(map.current!);
    });
    return () => markers.forEach((marker) => marker.remove());
  }, [entities, selectedKey, mapReady, zoom]);

  return (
    <div className={styles.mapWrap}>
      <div
        ref={container}
        className={styles.mapCanvas}
        aria-label={`Bản đồ đời sống xã hội tại ${city.name}`}
      />
      {!loaded && !failed && (
        <div className={styles.mapStatus}>Đang mở bản đồ quanh bạn…</div>
      )}
      {failed && (
        <div className={styles.mapWarning} role="status">
          <AlertCircle size={18} /> Không tải được nền bản đồ. Bạn vẫn có thể
          xem danh sách bên cạnh.
        </div>
      )}
      {loaded && !failed && entities.length === 0 && (
        <section className="vs-map-empty" aria-label="Bắt đầu khu vực này">
          <span className="vs-map-empty__eyebrow">
            <Sparkles size={13} aria-hidden="true" /> Khu vực chưa có nội dung
          </span>
          <strong>Khu vực này đang chờ người mở lời.</strong>
          <p>
            Vietnam Social không lấp bản đồ bằng dữ liệu giả. Bạn có thể đặt một
            câu hỏi, chia sẻ điều hữu ích hoặc tạo một cuộc gặp thật cho người
            quanh đây.
          </p>
          <div className="vs-map-empty__actions">
            <Link className="vs-map-empty__action" href="/contribute">
              <MessageCircle size={14} aria-hidden="true" /> Chia sẻ điều bạn
              biết
            </Link>
            <Link className="vs-map-empty__action" href="/activities/manage">
              <Activity size={14} aria-hidden="true" /> Tổ chức một cuộc gặp
            </Link>
          </div>
          <span className="vs-map-empty__hint">
            Hoặc kéo bản đồ để khám phá một khu vực khác trong TP. Hồ Chí Minh.
          </span>
        </section>
      )}
      <div className={styles.mapLabel}>
        <MapPin size={14} /> <strong>{city.name}</strong> · đời sống quanh đây
      </div>
    </div>
  );
}
