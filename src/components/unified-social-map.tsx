"use client";

import { useEffect, useRef, useState } from "react";
import { Marker, type Map as MapInstance } from "maplibre-gl";
import { AlertCircle } from "lucide-react";
import { HCMC_CITY, type Bounds, type CityConfig } from "@/lib/domain";
import { publicConfig } from "@/lib/env";
import type { SocialMapEntity } from "@/lib/social-map";
import styles from "./social-explore.module.css";

const PIN_LABEL: Record<SocialMapEntity["kind"], string> = {
  local_post: "•",
  community: "C",
  activity: "A",
  place: "P",
};

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
    const markers = visible.map((entity) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `${styles.mapPin} ${selectedKey === `${entity.kind}:${entity.id}` ? styles.mapPinSelected : ""}`;
      button.textContent = PIN_LABEL[entity.kind];
      button.dataset.kind = entity.kind;
      button.setAttribute("aria-label", `Mở ${entity.title} tại ${entity.area}`);
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
        aria-label="Bản đồ xã hội thống nhất TP. Hồ Chí Minh"
      />
      {!loaded && !failed && (
        <div className={styles.mapStatus}>Đang tải bản đồ xã hội…</div>
      )}
      {failed && (
        <div className={styles.mapWarning} role="status">
          <AlertCircle size={18} /> Không tải được nền bản đồ. Danh sách xã hội
          vẫn dùng được.
        </div>
      )}
      <div className={styles.mapLabel}>
        SOCIAL MAP · <strong>{city.name}</strong>
      </div>
    </div>
  );
}
