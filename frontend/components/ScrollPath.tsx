"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Decorative dotted S-curve behind the landing sections. A faint dotted track
 * spans the whole area; a glowing brand-gradient stroke "draws" itself along
 * the track as the user scrolls past.
 */
export default function ScrollPath() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    function onScroll() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = containerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const viewport = window.innerHeight;
        // 0 when the section enters the viewport, 1 when it has fully passed
        const total = rect.height + viewport * 0.5;
        const travelled = viewport * 0.75 - rect.top;
        setProgress(Math.max(0, Math.min(1, travelled / total)));
      });
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // One big S that weaves left-right down the landing page
  const d =
    "M 50 0 " +
    "C 95 10, 95 18, 50 25 " +
    "C 5 32, 5 40, 50 47 " +
    "C 95 54, 95 62, 50 69 " +
    "C 5 76, 5 84, 50 91 " +
    "C 72 94.5, 78 97, 70 100";

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 hidden overflow-hidden lg:block"
    >
      <svg
        className="h-full w-full text-foreground"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="scoutPath" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2a9d8f" />
            <stop offset="50%" stopColor="#f4c430" />
            <stop offset="100%" stopColor="#e63946" />
          </linearGradient>
        </defs>
        {/* faint dotted track */}
        <path
          d={d}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.10"
          strokeWidth="0.35"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray="0.0035 0.012"
          vectorEffect="non-scaling-stroke"
          style={{ strokeWidth: 3 }}
        />
        {/* drawn-on-scroll progress stroke */}
        <path
          d={d}
          fill="none"
          stroke="url(#scoutPath)"
          strokeOpacity="0.8"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={`${progress} 1`}
          vectorEffect="non-scaling-stroke"
          style={{
            strokeWidth: 3,
            filter: "drop-shadow(0 0 6px rgba(42,157,143,0.6))",
            transition: "stroke-dasharray 80ms linear",
          }}
        />
      </svg>
    </div>
  );
}
