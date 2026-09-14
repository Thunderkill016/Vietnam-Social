"use client";

import { useEffect, useRef, useState } from "react";
import { Marker, type Map as MapInstance } from "maplibre-gl";
import { AlertCircle } from "lucide-react";
import { HCMC_CITY, type Bounds, type CityConfig } from "@/lib/domain";
import { type LocalPost } from "@/lib/social";
import { type Community } from "@/lib/community";
import { publicConfig } from "@/lib/env";
import styles from "./social-explore.module.css";

const PIN_LABEL: Record<LocalPost["post_type"], string> = {
  question: "?",
  update: "•",
  recommendation: "★",
};

export function SocialMap({
  posts,
  communities,
  selectedId,
  onSelect,
  onSelectCommunity,
  onBounds,
  city = HCMC_CITY,
  initialBounds,
}: {
  posts: LocalPost[];
  communities: Community[];
  selectedId?: string;
  onSelect: (post: LocalPost) => void;
  onSelectCommunity: (community: Community) => void;
  onBounds: (bounds: Bounds) => void;
  city?: CityConfig;
  initialBounds?: Bounds;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapInstance>(null);
  const selectRef = useRef(onSelect);
  const selectCommunityRef = useRef(onSelectCommunity);
  const boundsRef = useRef(onBounds);
  const initialBoundsRef = useRef(initialBounds);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    selectRef.current = onSelect;
    selectCommunityRef.current = onSelectCommunity;
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
          clearTimeout(timeout);
        });
        instance.on("error", () => setFailed(true));
        instance.on("moveend", () => {
          const b = instance!.getBounds();
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
    const postMarkers = posts.map((post) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `${styles.mapPin} ${selectedId === post.id ? styles.mapPinSelected : ""}`;
      button.textContent = PIN_LABEL[post.post_type];
      button.setAttribute(
        "aria-label",
        `Mở bài của ${post.author.display_name} tại ${post.area}`,
      );
      button.addEventListener("click", () => selectRef.current(post));
      return new Marker({ element: button, anchor: "bottom" })
        .setLngLat([post.longitude, post.latitude])
        .addTo(map.current!);
    });
    const communityMarkers = communities.map((community) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = styles.mapPin;
      button.textContent = "C";
      button.setAttribute(
        "aria-label",
        `Mở cộng đồng ${community.name} tại ${community.area}`,
      );
      button.addEventListener("click", () =>
        selectCommunityRef.current(community),
      );
      return new Marker({ element: button, anchor: "bottom" })
        .setLngLat([community.longitude, community.latitude])
        .addTo(map.current!);
    });
    return () => {
      postMarkers.forEach((marker) => marker.remove());
      communityMarkers.forEach((marker) => marker.remove());
    };
  }, [posts, communities, selectedId, mapReady]);

  return (
    <div className={styles.mapWrap}>
      <div
        ref={container}
        className={styles.mapCanvas}
        aria-label="Bản đồ xã hội TP. Hồ Chí Minh"
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
