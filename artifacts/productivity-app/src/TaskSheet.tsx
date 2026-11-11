import { useEffect, useRef, type ReactNode } from "react";

/** A velocity-preserving spring, shared by gesture release and programmatic dismissal. */
export function TaskSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const physics = useRef({ position: 1, velocity: 0, target: 1 });
  const animation = useRef(0),
    drag = useRef<{
      start: number;
      offset: number;
      last: number;
      time: number;
    } | null>(null);
  const suppressClick = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const settle = useRef<() => void>(() => {});
  useEffect(() => {
    const node = dialog.current!;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    physics.current.target = open ? 0 : 1;
    if (open && !node.open) {
      returnFocus.current = document.activeElement as HTMLElement;
      node.showModal();
      node.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
    }
    settle.current = () => {
      cancelAnimationFrame(animation.current);
      let last = performance.now();
      function tick(now: number) {
        const s = physics.current,
          dt = Math.min((now - last) / 1000, 1 / 60);
        last = now;
        if (media.matches) {
          s.position = s.target;
          s.velocity = 0;
        } else {
          s.velocity += (420 * (s.target - s.position) - 41 * s.velocity) * dt;
          s.position += s.velocity * dt;
        }
        node.style.setProperty("--sheet-offset", String(s.position));
        if (
          Math.abs(s.target - s.position) < 0.001 &&
          Math.abs(s.velocity) < 0.01
        ) {
          s.position = s.target;
          node.style.setProperty("--sheet-offset", String(s.target));
          if (s.target === 1 && node.open) {
            node.close();
            returnFocus.current?.focus();
          }
        } else animation.current = requestAnimationFrame(tick);
      }
      animation.current = requestAnimationFrame(tick);
    };
    settle.current();
    return () => cancelAnimationFrame(animation.current);
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="task-sheet"
      aria-label="Task editor"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        className="sheet-handle"
        aria-label="Close task editor"
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          onClose();
        }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse") return;
          suppressClick.current = false;
          e.currentTarget.setPointerCapture(e.pointerId);
          cancelAnimationFrame(animation.current);
          drag.current = {
            start: e.clientY,
            offset: physics.current.position,
            last: e.clientY,
            time: e.timeStamp,
          };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const h = dialog.current!.getBoundingClientRect().height * 1.1;
          if (Math.abs(e.clientY - d.start) > 10) suppressClick.current = true;
          if (!suppressClick.current) return;
          const delta = (e.clientY - d.start) / h;
          const proposed = d.offset + delta;
          physics.current.position =
            proposed < 0
              ? (proposed * 0.55) / (1 + Math.abs(proposed) * 0.55)
              : proposed;
          const dt = e.timeStamp - d.time;
          if (dt > 0)
            physics.current.velocity = ((e.clientY - d.last) / h / dt) * 1000;
          d.last = e.clientY;
          d.time = e.timeStamp;
          dialog.current!.style.setProperty(
            "--sheet-offset",
            String(physics.current.position),
          );
        }}
        onPointerUp={(e) => {
          if (!drag.current) return;
          if (e.timeStamp - drag.current.time > 100)
            physics.current.velocity = 0;
          drag.current = null;
          const s = physics.current;
          const decelerationRate = 0.998;
          const projected =
            s.position +
            ((s.velocity / 1000) * decelerationRate) / (1 - decelerationRate);
          if (projected > 0.25) {
            s.target = 1;
            onClose();
          } else {
            s.target = 0;
            settle.current();
          }
        }}
        onPointerCancel={() => {
          drag.current = null;
          physics.current.target = 0;
          settle.current();
        }}
      >
        <span />
      </button>
      {children}
    </dialog>
  );
}
