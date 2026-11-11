import { useEffect, useRef, type ReactNode } from "react";

/** Retains the selected task during dismissal and reverses from the live spring value. */
export function InspectorSurface({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  const element = useRef<HTMLDivElement>(null),
    lastContent = useRef(children);
  const spring = useRef({ x: 1, v: 0 });
  if (open) lastContent.current = children;
  useEffect(() => {
    const node = element.current!;
    if (open) node.hidden = false;
    let frame = 0,
      previous = performance.now();
    const target = open ? 0 : 1;
    function tick(now: number) {
      const s = spring.current,
        dt = Math.min((now - previous) / 1000, 1 / 60);
      previous = now;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        s.x = target;
        s.v = 0;
      } else {
        s.v += (420 * (target - s.x) - 41 * s.v) * dt;
        s.x += s.v * dt;
      }
      node.style.opacity = String(1 - s.x);
      node.style.transform = `translateX(${s.x * 24}px)`;
      if (Math.abs(target - s.x) < 0.001 && Math.abs(s.v) < 0.01) {
        if (!open) node.hidden = true;
      } else frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [open]);
  return (
    <div
      ref={element}
      className="building-inspector"
      aria-label="Selected building details"
      aria-hidden={!open}
      inert={!open}
    >
      {open ? children : lastContent.current}
    </div>
  );
}
