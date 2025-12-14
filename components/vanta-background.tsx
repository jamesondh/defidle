"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    VANTA?: {
      FOG: (config: Record<string, unknown>) => { destroy: () => void };
    };
  }
}

export function VantaBackground() {
  const vantaRef = useRef<HTMLDivElement>(null);
  const vantaEffect = useRef<{ destroy: () => void } | null>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Check initial dark mode
    const dark = document.documentElement.classList.contains("dark");
    setIsDark(dark);

    // Watch for dark mode changes
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!vantaRef.current) return;

    // Load scripts
    const loadScript = (src: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
          resolve();
          return;
        }
        const script = document.createElement("script");
        script.src = src;
        script.onload = () => resolve();
        script.onerror = reject;
        document.head.appendChild(script);
      });
    };

    const initVanta = async () => {
      try {
        await loadScript("/scripts/three.r134.min.js");
        await loadScript("/scripts/vanta.fog.min.js");

        // Destroy existing effect if any
        if (vantaEffect.current) {
          vantaEffect.current.destroy();
        }

        if (window.VANTA) {
          vantaEffect.current = window.VANTA.FOG({
            el: vantaRef.current,
            mouseControls: true,
            touchControls: true,
            gyroControls: false,
            minHeight: 200.0,
            minWidth: 200.0,
            highlightColor: 0xf0ff,
            midtoneColor: 0x9500ff,
            baseColor: isDark ? 0x0 : 0xffffff,
            blurFactor: 0.82,
            speed: 0.7,
            zoom: 0.3,
          });
        }
      } catch (e) {
        console.error("Failed to load Vanta.js:", e);
      }
    };

    initVanta();

    return () => {
      if (vantaEffect.current) {
        vantaEffect.current.destroy();
        vantaEffect.current = null;
      }
    };
  }, [isDark]);

  return (
    <div
      ref={vantaRef}
      className="fixed inset-0 -z-10 bg-background"
    />
  );
}
