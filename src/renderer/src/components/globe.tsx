"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useDeferredValue,
} from "react";
import { cn } from "@/lib/utils";
// Bundled as an inlined data URL so the globe's land map loads instantly from
// disk over file:// — no CDN round-trip (which silently failed offline / on a
// slow network and left the globe blank), and a data: URL keeps the canvas
// untainted so getImageData() can read pixels for dot placement.
import landMapDataUrl from "@/assets/globe-land-map.png?inline";

type GlobeInstance = {
  globeImageUrl: (url: string) => GlobeInstance;
  backgroundColor: (color: string) => GlobeInstance;
  showAtmosphere: (show: boolean) => GlobeInstance;
  atmosphereColor: (color: string) => GlobeInstance;
  atmosphereAltitude: (altitude: number) => GlobeInstance;
  width: (width: number) => GlobeInstance;
  height: (height: number) => GlobeInstance;
  pointsData: (data: LandDot[]) => GlobeInstance;
  pointColor: (fn: () => string) => GlobeInstance;
  pointRadius: (radius: number) => GlobeInstance;
  pointResolution: (resolution: number) => GlobeInstance;
  pointAltitude: (altitude: number) => GlobeInstance;
  pointsMerge: (merge: boolean) => GlobeInstance;
  arcColor: (fn: () => string) => GlobeInstance;
  arcStroke: (stroke: number) => GlobeInstance;
  arcDashInitialGap: (gap: number) => GlobeInstance;
  arcDashLength: (length: number) => GlobeInstance;
  arcDashGap: (gap: number) => GlobeInstance;
  arcDashAnimateTime: (time: number) => GlobeInstance;
  labelText: (fn: () => string) => GlobeInstance;
  labelColor: (fn: () => string) => GlobeInstance;
  labelDotRadius: (radius: number) => GlobeInstance;
  labelAltitude: (altitude: number) => GlobeInstance;
  labelsTransitionDuration: (duration: number) => GlobeInstance;
  ringColor: (fn: () => (t: number) => string) => GlobeInstance;
  ringMaxRadius: (radius: number) => GlobeInstance;
  ringPropagationSpeed: (speed: number) => GlobeInstance;
  ringRepeatPeriod: (period: number) => GlobeInstance;
  arcsData: (data: Arc[]) => GlobeInstance;
  labelsData: (data: Label[]) => GlobeInstance;
  ringsData: (data: Ring[]) => GlobeInstance;
  globeMaterial: () => {
    opacity: number;
    shininess: number;
    transparent: boolean;
    color: { set: (color: string) => void };
  };
  pointOfView: (view: { altitude: number }) => GlobeInstance;
  controls: () => {
    autoRotate: boolean;
    autoRotateSpeed: number;
    enabled: boolean;
    enableZoom: boolean;
  };
  onGlobeClick: (
    fn: (coords: { lat: number; lng: number }, event: MouseEvent) => void,
  ) => GlobeInstance;
  (element: HTMLElement): GlobeInstance;
};

declare global {
  interface Window {
    Globe?: () => GlobeInstance;
    d3?: unknown;
  }
}

export interface GlobeProps {
  /** Width of the globe container in pixels (or "auto" for parent width) */
  width?: number | "auto";

  /** Height of the globe container in pixels (or "auto" for parent width) */
  height?: number | "auto";

  /** Primary color for arcs and labels (any valid CSS color) */
  primaryColor?: string;

  /** Color for land dots and atmosphere (any valid CSS color) */
  neutralColor?: string;

  /** Color for atmosphere (defaults to neutralColor) */
  atmosphereColor?: string;

  /** Color of the globe sphere itself (any valid CSS color) */
  globeColor?: string;

  /** Show atmosphere around the globe */
  showAtmosphere?: boolean;

  /** Auto-rotation speed (0 = no rotation, higher = faster) */
  autoRotateSpeed?: number;

  /** Enable zoom controls */
  enableZoom?: boolean;

  /** Whether the globe is interactive (default: true) */
  interactive?: boolean;

  /** Number of animated arcs to show at once */
  arcCount?: number;

  /** Interval between arc animations in milliseconds */
  arcInterval?: number;

  /** Arc animation duration in milliseconds */
  arcAnimationDuration?: number;

  /** Altitude of the camera view (higher = further away) */
  cameraAltitude?: number;

  /** Number of rows for land dot grid */
  landDotRows?: number;

  /** URL of the land map image for dot placement */
  landMapUrl?: string;

  /** Additional class name for the container */
  className?: string;

  /** Callback when globe is ready */
  onReady?: () => void;

  /** Size of the land dots (default: 0.25) */
  pointSize?: number;

  /** Resolution of the points (default: 4) */
  pointResolution?: number;

  /** Altitude of the atmosphere (default: 0.3) */
  atmosphereAltitude?: number;

  /** Opacity of the globe material (default: 1) */
  globeOpacity?: number;

  /** Callback when globe is clicked */
  onGlobeClick?: (
    coords: { lat: number; lng: number },
    event: MouseEvent,
  ) => void;
}

interface LandDot {
  lat: number;
  lng: number;
}

interface Arc {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
}

interface Label {
  lat: number;
  lng: number;
}

interface Ring {
  lat: number;
  lng: number;
}

const landDotsCache = new Map<string, LandDot[]>();

/**
 * Persistent globe cache. A fully built WebGL globe is expensive (context
 * creation + scene setup + image decode), so once built it's kept alive in a
 * detached <div> and re-attached on later mounts instead of being rebuilt.
 * Navigating away → back, or toggling a panel, reuses the same instance — the
 * globe "loads once" and stays cached for the app's lifetime. Keyed by the
 * visual config so a theme/size change builds its own (small, bounded) variant.
 */
interface GlobeCacheEntry {
  holder: HTMLDivElement;
  world: GlobeInstance;
  /** Resume the arc animation + auto-rotation (on re-attach). */
  startAnim: () => void;
  /** Pause everything while detached so a hidden globe costs no CPU. */
  stopAnim: () => void;
}
const globeCache = new Map<string, GlobeCacheEntry>();

/**
 * Efficient random sampling without full array shuffle
 * Uses Fisher-Yates partial shuffle approach
 */
function getRandomSample<T>(arr: T[], n: number): T[] {
  const len = arr.length;
  if (n >= len) return [...arr];

  const result: T[] = [];
  const used = new Set<number>();

  while (result.length < n) {
    const idx = Math.floor(Math.random() * len);
    if (!used.has(idx)) {
      used.add(idx);
      result.push(arr[idx]);
    }
  }

  return result;
}

/**
 * Globe - A 3D rotating globe with animated connection arcs.
 *
 * Built once and cached: the first mount creates the WebGL globe; later mounts
 * re-attach the cached instance instantly (no rebuild, no re-fade), and the
 * animation pauses while the globe is detached so it never wastes CPU offscreen.
 */
export const Globe: React.FC<GlobeProps> = ({
  width = "auto",
  height = "auto",
  primaryColor = "rgb(59, 130, 246)",
  neutralColor = "rgb(156, 163, 175)",
  atmosphereColor,
  globeColor = "rgb(30, 30, 30)",
  showAtmosphere = true,
  autoRotateSpeed = 0.85,
  enableZoom = false,
  interactive = true,
  arcCount = 10,
  arcInterval = 6000,
  arcAnimationDuration = 2000,
  cameraAltitude = 2,
  landDotRows = 200,
  pointSize = 0.25,
  atmosphereAltitude = 0.3,
  landMapUrl = landMapDataUrl,
  className,
  onReady,
  onGlobeClick,
  pointResolution = 4,
  globeOpacity = 1,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGlobeVisible, setIsGlobeVisible] = useState(false);

  const onGlobeClickRef = useRef(onGlobeClick);
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onGlobeClickRef.current = onGlobeClick;
    onReadyRef.current = onReady;
  }, [onGlobeClick, onReady]);

  const deferredPrimaryColor = useDeferredValue(primaryColor);
  const deferredNeutralColor = useDeferredValue(neutralColor);
  const deferredAtmosphereColor = useDeferredValue(
    atmosphereColor || neutralColor,
  );
  const deferredGlobeColor = useDeferredValue(globeColor);

  const DEG2RAD = Math.PI / 180;

  useEffect(() => {
    // Load globe.gl from the bundled package (not a CDN) so it works offline
    // and complies with the renderer's strict CSP (script-src 'self').
    let cancelled = false;
    const loadScripts = async () => {
      try {
        if (!window.Globe) {
          const mod = (await import("globe.gl")) as unknown as {
            default: unknown;
          };
          (window as unknown as { Globe: unknown }).Globe = mod.default ?? mod;
        }
        if (!cancelled) setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load globe");
          setIsLoading(false);
        }
      }
    };

    loadScripts();
    return () => {
      cancelled = true;
    };
  }, []);

  const processLandMap = useCallback(
    (image: HTMLImageElement): LandDot[] => {
      const cacheKey = `${landMapUrl}_${landDotRows}`;
      const cached = landDotsCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return [];

      canvas.width = image.width;
      canvas.height = image.height;
      ctx.drawImage(image, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const dots: LandDot[] = [];

      const imgWidth = imageData.width;
      const imgHeight = imageData.height;
      const data = imageData.data;
      const rowBytes = 4 * imgWidth;

      const visibilityForCoordinate = (lng: number, lat: number): boolean => {
        const r = Math.floor(((lng + 180) / 360) * imgWidth + 0.5);
        const a = imgHeight - Math.floor(((lat + 90) / 180) * imgHeight - 0.5);
        const s = Math.floor(rowBytes * (a - 1) + 4 * r) + 3;
        return data[s] > 90;
      };

      const globeRad = 25;
      for (let lat = -90; lat <= 90; lat += 180 / landDotRows) {
        const radius = Math.cos(Math.abs(lat) * DEG2RAD) * globeRad;
        const circum = radius * Math.PI * 2 * 2;
        for (let r = 0; r < circum; r++) {
          const lng = (360 * r) / circum - 180;
          if (visibilityForCoordinate(lng, lat)) {
            dots.push({ lat, lng });
          }
        }
      }

      landDotsCache.set(cacheKey, dots);

      return dots;
    },
    [landDotRows, landMapUrl, DEG2RAD],
  );

  useEffect(() => {
    if (isLoading || error || !containerRef.current || !window.Globe) return;
    const container = containerRef.current;
    const GlobeCtor = window.Globe;

    // Visual signature. landMapUrl is excluded (it's a constant ~21KB data URL,
    // and landDotRows already captures any geometry difference).
    const cacheKey = JSON.stringify([
      width,
      height,
      deferredPrimaryColor,
      deferredNeutralColor,
      deferredAtmosphereColor,
      deferredGlobeColor,
      showAtmosphere,
      autoRotateSpeed,
      enableZoom,
      interactive,
      arcCount,
      arcInterval,
      arcAnimationDuration,
      cameraAltitude,
      landDotRows,
      pointSize,
      pointResolution,
      atmosphereAltitude,
      globeOpacity,
    ]);

    // --- Cache hit: re-attach the already-built globe, no rebuild. ---
    const cached = globeCache.get(cacheKey);
    if (cached) {
      container.appendChild(cached.holder);
      globeRef.current = cached.world;
      cached.startAnim();
      setIsGlobeVisible(true);
      return () => {
        cached.stopAnim();
        if (cached.holder.parentElement === container) {
          container.removeChild(cached.holder);
        }
      };
    }

    // --- Cache miss: build a fresh globe (deferred to idle). ---
    let disposed = false;
    let idleId: number | null = null;
    let detach: (() => void) | null = null;

    const build = () => {
      if (disposed || !window.Globe) return;

      const holder = document.createElement("div");
      holder.style.width = "100%";
      holder.style.height = "100%";
      container.appendChild(holder);

      const containerWidth =
        width === "auto"
          ? container.parentElement?.getBoundingClientRect().width || 600
          : width;
      const containerHeight = height === "auto" ? containerWidth : height;

      const landMapImage = new Image();
      landMapImage.crossOrigin = "anonymous";
      landMapImage.src = landMapUrl;

      landMapImage.onload = () => {
        if (disposed || !window.Globe) {
          if (holder.parentElement) holder.parentElement.removeChild(holder);
          return;
        }
        const dots = processLandMap(landMapImage);

        const createColorTexture = (color: string) => {
          const canvas = document.createElement("canvas");
          canvas.width = 1;
          canvas.height = 1;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, 1, 1);
          }
          return canvas.toDataURL();
        };

        const world = GlobeCtor()
          .globeImageUrl(createColorTexture(deferredGlobeColor))
          .backgroundColor("rgba(0, 0, 0, 0)")
          .showAtmosphere(showAtmosphere)
          .atmosphereColor(deferredAtmosphereColor)
          .atmosphereAltitude(atmosphereAltitude)
          .width(containerWidth)
          .height(containerHeight)
          .pointsData(dots)
          .pointColor(() => deferredNeutralColor)
          .pointRadius(pointSize)
          .pointResolution(pointResolution)
          .pointAltitude(0)
          .pointsMerge(true)
          .arcColor(() => deferredPrimaryColor)
          .arcStroke(0.25)
          .arcDashInitialGap(1)
          .arcDashLength(2)
          .arcDashGap(2)
          .arcDashAnimateTime(arcAnimationDuration)
          .labelText(() => "")
          .labelColor(() => deferredPrimaryColor)
          .labelDotRadius(0.3)
          .labelAltitude(0.002)
          .labelsTransitionDuration(250)
          .ringColor(() => (t: number) => `rgba(59, 130, 246, ${1 - t})`)
          .ringMaxRadius(2)
          .ringPropagationSpeed(2)
          .ringRepeatPeriod(0)(holder);

        const globeMat = world.globeMaterial();
        globeMat.transparent = true;
        globeMat.opacity = globeOpacity;
        globeMat.shininess = 0.5;

        world.pointOfView({ altitude: cameraAltitude });
        world.controls().autoRotateSpeed = autoRotateSpeed;
        world.controls().enabled = interactive;
        world.controls().enableZoom = enableZoom;

        world.onGlobeClick(
          (coords: { lat: number; lng: number }, event: MouseEvent) => {
            onGlobeClickRef.current?.(coords, event);
          },
        );

        globeRef.current = world;

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!disposed) setIsGlobeVisible(true);
          });
        });

        // --- Animation lifecycle (re-startable so it can pause while cached). ---
        let intervalId: number | null = null;
        let frameId: number | null = null;
        let animating = false;
        let visible = true;
        const timeouts: number[] = [];

        const animateArcs = () => {
          if (!dots.length || animating || !visible) return;
          animating = true;
          frameId = requestAnimationFrame(() => {
            const selected = getRandomSample(dots, arcCount * 2);
            const arcs: Arc[] = Array.from({ length: arcCount }, (_, i) => ({
              startLat: selected[i].lat,
              startLng: selected[i].lng,
              endLat: selected[i + arcCount].lat,
              endLng: selected[i + arcCount].lng,
            }));
            const labels: Label[] = Array.from({ length: arcCount }, (_, i) => ({
              lat: selected[i + arcCount].lat,
              lng: selected[i + arcCount].lng,
            }));
            const rings: Ring[] = Array.from({ length: arcCount }, (_, i) => ({
              lat: selected[i + arcCount].lat,
              lng: selected[i + arcCount].lng,
            }));
            world.arcsData(arcs).labelsData(labels);
            const rt = window.setTimeout(() => {
              world.ringsData(rings);
              animating = false;
            }, arcAnimationDuration * 1.5);
            timeouts.push(rt);
          });
        };

        const startAnim = () => {
          visible = true;
          try {
            world.controls().autoRotate = true;
          } catch {
            // controls may be gone if context was lost
          }
          if (intervalId != null) return;
          const t = window.setTimeout(animateArcs, 500);
          timeouts.push(t);
          intervalId = window.setInterval(animateArcs, arcInterval);
        };

        const stopAnim = () => {
          if (intervalId != null) {
            clearInterval(intervalId);
            intervalId = null;
          }
          if (frameId != null) {
            cancelAnimationFrame(frameId);
            frameId = null;
          }
          timeouts.forEach(clearTimeout);
          timeouts.length = 0;
          animating = false;
          try {
            world.controls().autoRotate = false;
          } catch {
            // ignore
          }
        };

        startAnim();

        // Resize: track the holder's live parent (it moves between mounts).
        let resizeTimeout: number | undefined;
        const handleResize = () => {
          window.clearTimeout(resizeTimeout);
          resizeTimeout = window.setTimeout(() => {
            const host = holder.parentElement;
            if (!host) return;
            const nw =
              width === "auto" ? host.getBoundingClientRect().width : width;
            const nh = height === "auto" ? nw : height;
            world.width(nw);
            world.height(nh);
          }, 150);
        };
        window.addEventListener("resize", handleResize);

        // Pause auto-rotation when the globe scrolls offscreen.
        let observer: IntersectionObserver | null = null;
        if ("IntersectionObserver" in window) {
          observer = new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                visible = entry.isIntersecting;
                try {
                  world.controls().autoRotate = entry.isIntersecting;
                } catch {
                  // ignore
                }
              });
            },
            { threshold: 0.1 },
          );
          observer.observe(holder);
        }

        const entry: GlobeCacheEntry = { holder, world, startAnim, stopAnim };
        globeCache.set(cacheKey, entry);

        detach = () => {
          stopAnim();
          if (holder.parentElement) holder.parentElement.removeChild(holder);
        };

        onReadyRef.current?.();
      };

      landMapImage.onerror = () => {
        if (!disposed) setError("Failed to load land map image");
      };
    };

    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(build, { timeout: 500 });
    } else {
      idleId = window.setTimeout(build, 0) as unknown as number;
    }

    return () => {
      disposed = true;
      if (idleId != null) {
        if (typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(idleId);
        } else {
          window.clearTimeout(idleId);
        }
      }
      if (detach) detach();
    };
  }, [
    isLoading,
    error,
    width,
    height,
    deferredPrimaryColor,
    deferredNeutralColor,
    deferredAtmosphereColor,
    deferredGlobeColor,
    showAtmosphere,
    autoRotateSpeed,
    enableZoom,
    interactive,
    arcCount,
    arcInterval,
    arcAnimationDuration,
    cameraAltitude,
    landDotRows,
    landMapUrl,
    processLandMap,
    pointSize,
    pointResolution,
    atmosphereAltitude,
    globeOpacity,
  ]);

  if (error) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-lg border border-red-200 bg-red-50 p-8 text-red-600",
          className,
        )}
      >
        <p>Error loading globe: {error}</p>
      </div>
    );
  }

  if (isLoading) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-hidden",
        interactive ? "cursor-grab" : "cursor-default",
        className,
      )}
      style={{
        width: width === "auto" ? "100%" : width,
        height: height === "auto" ? "auto" : height,
        opacity: isGlobeVisible ? 1 : 0,
        transform: isGlobeVisible ? "scale(1)" : "scale(0.85)",
        transition:
          "opacity 0.8s ease-out, transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
    />
  );
};

Globe.displayName = "Globe";

export default Globe;
