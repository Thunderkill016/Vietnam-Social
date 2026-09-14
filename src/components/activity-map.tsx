"use client";
import { useEffect, useRef, useState } from "react";
import { Marker, type Map as MapInstance } from "maplibre-gl";
import { AlertCircle } from "lucide-react";
import {
  CATEGORIES,
  DEFAULT_CENTER,
  PILOT,
  type Bounds,
  type Signal,
} from "@/lib/domain";
import { publicConfig } from "@/lib/env";
export function ActivityMap({
  signals,
  selectedId,
  onSelect,
  onBounds,
  location,
}: {
  signals: Signal[];
  selectedId?: string;
  onSelect: (signal: Signal) => void;
  onBounds: (bounds: Bounds) => void;
  location: [number, number] | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapInstance>(null);
  const selectRef = useRef(onSelect);
  const boundsRef = useRef(onBounds);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    selectRef.current = onSelect;
    boundsRef.current = onBounds;
  });
  const [mapReady, setMapReady] = useState(false);
  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | undefined;
    let instance: MapInstance | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    void import("maplibre-gl")
      .then(({ Map, NavigationControl }) => {
        if (disposed || !container.current) return;
        instance = new Map({
          container: container.current,
          style: publicConfig().style,
          center: DEFAULT_CENTER,
          zoom: 13,
          minZoom: 12,
          maxZoom: 17,
          maxBounds: [
            [PILOT.west - 0.04, PILOT.south - 0.04],
            [PILOT.east + 0.04, PILOT.north + 0.04],
          ],
          attributionControl: { compact: true },
        });
        map.current = instance;
        setMapReady(true);
        instance.addControl(
          new NavigationControl({ showCompass: false }),
          "bottom-right",
        );
        instance.on("error", () => setFailed(true));
        instance.on("load", () => {
          setFailed(false);
          setLoaded(true);
          clearTimeout(timeout);
        });
        // Surface stalled tile/style requests instead of leaving an unexplained blank map.
        timeout = setTimeout(() => {
          if (!instance?.loaded()) setFailed(true);
        }, 15_000);
        instance.on("moveend", () => {
          const bounds = instance!.getBounds();
          boundsRef.current({
            west: bounds.getWest(),
            east: bounds.getEast(),
            north: bounds.getNorth(),
            south: bounds.getSouth(),
          });
        });
        observer = new ResizeObserver(() => instance?.resize());
        observer.observe(container.current);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      clearTimeout(timeout);
      observer?.disconnect();
      instance?.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    if (!map.current) return;
    const markers = signals.map((signal) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `map-pin ${selectedId === signal.id ? "selected" : ""}`;
      button.style.setProperty(
        "--pin-color",
        CATEGORIES[signal.category].color,
      );
      button.setAttribute("aria-label", `Xem ${signal.title}`);
      button.textContent = {
        sport: "↗",
        music: "♪",
        workshop: "✳",
        community: "☕",
      }[signal.category];
      button.addEventListener("click", () => selectRef.current(signal));
      return new Marker({ element: button, anchor: "bottom" })
        .setLngLat([signal.longitude, signal.latitude])
        .addTo(map.current!);
    });
    return () => markers.forEach((marker) => marker.remove());
  }, [signals, selectedId, mapReady]);
  useEffect(() => {
    if (location) map.current?.flyTo({ center: location, zoom: 14 });
  }, [location]);
  return (
    <div className="map-wrap">
      <div
        ref={container}
        className="map-canvas"
        data-state={failed ? "unavailable" : loaded ? "ready" : "loading"}
        aria-label="Bản đồ hoạt động quanh bạn"
      />
      {!loaded && !failed && (
        <div className="map-loading" role="status">
          Đang tải nền bản đồ…
        </div>
      )}
      {failed && (
        <div className="map-warning" role="status">
          <AlertCircle size={18} /> Không tải được nền bản đồ. Bạn vẫn có thể
          xem và mở hoạt động từ danh sách.
        </div>
      )}
      <div className="map-area-label">
        <span className="live-dot" /> KHU VỰC THỬ NGHIỆM{" "}
        <strong>Gò Vấp · Phú Nhuận · Tân Bình</strong>
      </div>
    </div>
  );
}
