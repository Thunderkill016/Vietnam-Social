"use client";
import { useEffect, useRef, useState } from "react";
import { Marker, type Map as MapInstance } from "maplibre-gl";
import { AlertCircle } from "lucide-react";
import {
  CATEGORIES,
  HCMC_CITY,
  type Bounds,
  type CityConfig,
  type Signal,
} from "@/lib/domain";
import { publicConfig } from "@/lib/env";
import { trackEvent } from "@/lib/analytics";

export function ActivityMap({
  signals,
  selectedId,
  onSelect,
  onBounds,
  location,
  city = HCMC_CITY,
  initialBounds,
}: {
  signals: Signal[];
  selectedId?: string;
  onSelect: (signal: Signal) => void;
  onBounds: (bounds: Bounds) => void;
  location: [number, number] | null;
  city?: CityConfig;
  initialBounds?: Bounds;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapInstance>(null);
  const selectRef = useRef(onSelect);
  const boundsRef = useRef(onBounds);
  const initialBoundsRef = useRef(initialBounds);
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
      .then(({ Map, NavigationControl, setWorkerUrl }) => {
        if (disposed || !container.current) return;
        setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

        const margin = 0.05;
        const maxBounds: [[number, number], [number, number]] = [
          [
            city.operational_bounds.west - margin,
            city.operational_bounds.south - margin,
          ],
          [
            city.operational_bounds.east + margin,
            city.operational_bounds.north + margin,
          ],
        ];

        const initBounds = initialBoundsRef.current;
        const initialCenter: [number, number] = initBounds
          ? [
              (initBounds.west + initBounds.east) / 2,
              (initBounds.south + initBounds.north) / 2,
            ]
          : city.default_center;

        instance = new Map({
          container: container.current,
          style: publicConfig().style,
          center: initialCenter,
          zoom: city.default_zoom,
          minZoom: 10,
          maxZoom: 17,
          maxBounds,
          attributionControl: { compact: true },
        });

        map.current = instance;
        setMapReady(true);
        instance.addControl(
          new NavigationControl({ showCompass: false }),
          "bottom-right",
        );

        instance.on("error", (event) => {
          console.warn("Basemap error:", event.error.message);
          setFailed(true);
        });

        instance.on("load", () => {
          setFailed(false);
          setLoaded(true);
          clearTimeout(timeout);
          trackEvent({
            type: "map_opened",
            city_id: city.id,
            zoom: instance?.getZoom(),
          });
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
            city_id: city.id,
          });
        });

        observer = new ResizeObserver(() => instance?.resize());
        observer.observe(container.current);
      })
      .catch((error: unknown) => {
        console.warn(
          "Map initialization failed:",
          error instanceof Error ? error.message : "unknown error",
        );
        if (!disposed) setFailed(true);
      });

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
        <span className="live-dot" /> KHU VỰC HOẠT ĐỘNG{" "}
        <strong>{city.name}</strong>
      </div>
    </div>
  );
}
