import { advanceSpring } from "./spring";
import { useLayoutEffect, useRef, type ReactNode } from "react";

/** A single selection surface follows the current view, including mid-flight reversals. */
export function ViewSwitch({
  view,
  onChange,
  children,
}: {
  view: "city" | "list";
  onChange: (view: "city" | "list") => void;
  children: ReactNode;
}) {
  const group = useRef<HTMLDivElement>(null);
  const state = useRef({ x: 0, width: 0, vx: 0, vw: 0, ready: false });
  useLayoutEffect(() => {
    const node = group.current!;
    const pill = node.querySelector<HTMLElement>(".view-indicator")!;
    let frame = 0;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    function measure() {
      cancelAnimationFrame(frame);
      const button = node.querySelector<HTMLButtonElement>(
        '[aria-pressed="true"]',
      )!;
      const x = button.offsetLeft,
        width = button.offsetWidth;
      let previous = performance.now();
      function tick(now: number) {
        const s = state.current;
        const dt = Math.max((now - previous) / 1000, 0);
        previous = now;
        if (!s.ready || media.matches) {
          s.x = x;
          s.width = width;
          s.vx = s.vw = 0;
          s.ready = true;
        } else {
          const horizontal = advanceSpring(s.x, s.vx, x, dt);
          const sizing = advanceSpring(s.width, s.vw, width, dt);
          s.x = horizontal.position;
          s.vx = horizontal.velocity;
          s.width = sizing.position;
          s.vw = sizing.velocity;
        }
        pill.style.borderRadius = `${12 / Math.max(s.width, 1)}px / 12px`;
        pill.style.transform = `translateX(${s.x}px) scaleX(${s.width})`;
        if (
          Math.abs(x - s.x) +
            Math.abs(width - s.width) +
            Math.abs(s.vx) +
            Math.abs(s.vw) >
          0.05
        )
          frame = requestAnimationFrame(tick);
      }
      frame = requestAnimationFrame(tick);
    }
    const observer = new ResizeObserver(measure);
    node
      .querySelectorAll("button")
      .forEach((button) => observer.observe(button));
    media.addEventListener("change", measure);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      media.removeEventListener("change", measure);
    };
  }, [view]);
  return (
    <div
      ref={group}
      className="view-switch"
      role="group"
      aria-label="Workspace view"
    >
      <i className="view-indicator" aria-hidden="true" />
      <button aria-pressed={view === "city"} onClick={() => onChange("city")}>
        ◈ City View
      </button>
      <button aria-pressed={view === "list"} onClick={() => onChange("list")}>
        ☷ List View
      </button>
      <span>{children}</span>
    </div>
  );
}
