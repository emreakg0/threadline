import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { WorkspaceIcon } from "../WorkspaceIcon";
import type { ActionThread, ThreadNode } from "./data";
import { cardHeight, cardWidth, type GraphLayout, type RouteProjection } from "./layout";

type Props = {
  graph: ActionThread;
  layout: GraphLayout;
  route: RouteProjection;
  selected: string | null;
  select: (id: string) => void;
};

export function nodeStatus(node: ThreadNode, state: string, terminal: boolean) {
  if (state === "active") return "Active step";
  if (state === "complete") return node.kind === "decision" ? "Decision made" : "Completed";
  if (state === "unavailable") return "Unavailable on this route";
  return terminal ? "Terminal step" : node.kind === "decision" ? "Decision" : "Action";
}

export function StepMark({ kind, state, terminal }: {
  kind: ThreadNode["kind"]; state: string; terminal: boolean;
}) {
  return <span className="tl-thread-step-mark">
    <WorkspaceIcon name={state === "complete" ? "check" : kind === "decision" ? "branch" : terminal ? "finish" : "step"} />
  </span>;
}

type View = { x: number; y: number; scale: number };
const cameraTransform = ({ x, y, scale }: View) => `translate(${x}px, ${y}px) scale(${scale})`;

export function ThreadGraph({ graph, layout, route, selected, select, depth }: Props & { depth: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  const plane = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const tiltAllowed = useRef<MediaQueryList>(null);
  const tiltFrame = useRef(0);
  const tiltTarget = useRef({ x: 0, y: 0 });
  const marker = useId();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [manual, setManual] = useState<View | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const drag = useRef<{ id: number; x: number; y: number; origin: View; view: View } | null>(null);
  const attention = depth && !dragging ? focused ?? hovered : null;
  const neighbors = new Set(attention ? [attention] : []);
  for (const { from, to } of graph.edges) {
    if (from === attention) neighbors.add(to);
    if (to === attention) neighbors.add(from);
  }
  useLayoutEffect(() => {
    const element = viewport.current!;
    function measure() {
      setSize({ width: element.clientWidth, height: element.clientHeight });
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    tiltAllowed.current = matchMedia("(min-width: 761px) and (prefers-reduced-motion: no-preference)");
  }, []);

  useEffect(() => {
    const element = plane.current;
    return () => {
      cancelAnimationFrame(tiltFrame.current);
      tiltFrame.current = 0;
      element?.style.removeProperty("--thread-tilt-x");
      element?.style.removeProperty("--thread-tilt-y");
    };
  }, [depth]);

  const fittedScale = Math.min(1, Math.max(0.15, Math.min(
    (size.width - 22) / layout.width, (size.height - 24) / layout.height,
  )));
  const view = manual ?? {
    scale: fittedScale,
    x: (size.width - layout.width * fittedScale) / 2,
    y: (size.height - layout.height * fittedScale) / 2,
  };

  function zoom(factor: number, x = size.width / 2, y = size.height / 2) {
    const scale = Math.max(0.15, Math.min(2.2, view.scale * factor));
    const ratio = scale / view.scale;
    setManual({ scale, x: x - (x - view.x) * ratio, y: y - (y - view.y) * ratio });
  }

  useEffect(() => {
    const element = viewport.current!;
    function wheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      zoom(Math.exp(-event.deltaY * 0.007), event.clientX - rect.x, event.clientY - rect.y);
    }
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  });

  function resetTilt() {
    cancelAnimationFrame(tiltFrame.current);
    tiltFrame.current = 0;
    plane.current?.style.removeProperty("--thread-tilt-x");
    plane.current?.style.removeProperty("--thread-tilt-y");
  }

  function startPan(event: PointerEvent<HTMLDivElement>) {
    if (drag.current || event.button !== 0 || (event.target as Element).closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    resetTilt();
    setHovered(null);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, origin: view, view };
    setDragging(true);
  }
  function movePointer(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (start) {
      if (start.id !== event.pointerId) return;
      start.view = { ...start.origin, x: start.origin.x + event.clientX - start.x, y: start.origin.y + event.clientY - start.y };
      if (canvas.current) canvas.current.style.transform = cameraTransform(start.view);
      return;
    }
    if (!depth || !tiltAllowed.current?.matches || focused || event.pointerType !== "mouse") return;
    tiltTarget.current = { x: event.clientX, y: event.clientY };
    if (tiltFrame.current) return;
    tiltFrame.current = requestAnimationFrame(() => {
      tiltFrame.current = 0;
      const rect = viewport.current?.getBoundingClientRect();
      if (!rect || !rect.width || !rect.height) return;
      const offsetX = Math.max(-1, Math.min(1, 2 * (tiltTarget.current.x - rect.left) / rect.width - 1));
      const offsetY = Math.max(-1, Math.min(1, 2 * (tiltTarget.current.y - rect.top) / rect.height - 1));
      plane.current?.style.setProperty("--thread-tilt-x", `${offsetY * -1.6}deg`);
      plane.current?.style.setProperty("--thread-tilt-y", `${offsetX * 2.2}deg`);
    });
  }
  function stopPan(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (start?.id !== event.pointerId) return;
    drag.current = null;
    if (start.view !== start.origin) setManual(start.view);
    setDragging(false);
  }
  function showOnKeyboardFocus(id: string) {
    const position = layout.positions.get(id)!;
    const left = position.x * view.scale + view.x;
    const top = position.y * view.scale + view.y;
    if (left < 0 || top < 0 || left + cardWidth * view.scale > size.width ||
        top + cardHeight * view.scale > size.height) {
      setManual({
        scale: view.scale,
        x: size.width / 2 - (position.x + cardWidth / 2) * view.scale,
        y: size.height / 2 - (position.y + cardHeight / 2) * view.scale,
      });
    }
  }

  const edges = graph.edges.flatMap((edge, index) => {
    const from = layout.positions.get(edge.from);
    const to = layout.positions.get(edge.to);
    if (!from || !to) return [];
    const x1 = from.x + cardWidth / 2, x2 = to.x + cardWidth / 2;
    const y1 = from.y + cardHeight, y2 = to.y;
    const retry = edge.kind === "retry";
    const long = y2 - y1 > 142;
    const lane = retry ? 20 + (index % 2) * 15 : layout.width - 24 - (index % 3) * 13;
    const viaRail = retry || long;
    const middle = (y1 + y2) / 2;
    const direction = Math.sign(y2 - y1);
    const railFrom = x1 - Math.sign(x1 - lane) * 10;
    const railTo = x2 - Math.sign(x2 - lane) * 10;
    const d = viaRail
      ? `M ${x1} ${y1} v 13 Q ${x1} ${y1 + 22} ${railFrom} ${y1 + 22}
         H ${lane + Math.sign(x1 - lane) * 10} Q ${lane} ${y1 + 22} ${lane} ${y1 + 22 + direction * 10}
         V ${y2 - 22 - direction * 10} Q ${lane} ${y2 - 22} ${lane + Math.sign(x2 - lane) * 10} ${y2 - 22}
         H ${railTo}
         Q ${x2} ${y2 - 22} ${x2} ${y2 - 12} V ${y2 - 4}`
      : `M ${x1} ${y1} C ${x1} ${middle}, ${x2} ${middle}, ${x2} ${y2 - 4}`;
    const followed = route.followed(edge.from, edge.to);
    const unavailable = route.nodeState(edge.to) === "unavailable" || route.nodeState(edge.from) === "unavailable" ||
      (edge.kind === "outcome" && route.nodeState(edge.from) === "complete" && !followed);
    const emphasis = !attention ? undefined : edge.from === attention || edge.to === attention ? "connected" : "distant";
    return [{ edge, d, retry, mode: retry ? "retry" : followed ? "followed" : "default", unavailable, emphasis,
      label: retry ? `Retry · up to ${edge.max_traversals}` : edge.outcome,
      x: viaRail ? lane : (x1 + x2) / 2, y: middle }];
  });

  return <section aria-label="Graph" className="tl-thread-map">
    <div className="tl-thread-map-bar">
      <p>Drag to pan</p>
      <div className="tl-thread-tools" aria-label="Graph zoom">
        <button type="button" aria-label="Zoom out" onClick={() => zoom(1 / 1.2)}>−</button>
        <span aria-label="Zoom level">{Math.round(view.scale * 100)}%</span>
        <button type="button" aria-label="Zoom in" onClick={() => zoom(1.2)}>+</button>
        <button type="button" onClick={() => setManual(null)}>Fit graph</button>
      </div>
    </div>
    <div
      ref={viewport} tabIndex={0} role="region" aria-label="Graph canvas. Use arrow keys to pan."
      className="tl-thread-viewport" data-dragging={dragging} data-depth={depth}
      onPointerDown={startPan} onPointerMove={movePointer}
      onPointerLeave={resetTilt}
      onPointerUp={stopPan} onPointerCancel={stopPan} onLostPointerCapture={stopPan}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        const direction = { ArrowLeft: [44, 0], ArrowRight: [-44, 0], ArrowUp: [0, 44], ArrowDown: [0, -44] }[event.key];
        if (!direction) return;
        event.preventDefault();
        resetTilt();
        setManual({ ...view, x: view.x + direction[0], y: view.y + direction[1] });
      }}
    >
      {/* The same plane projects the SVG ports, labels, and HTML cards. */}
      <div className="tl-thread-plane" ref={plane}>
        <div className="tl-thread-canvas" ref={canvas} style={{
          width: layout.width, height: layout.height,
          transform: cameraTransform(view),
        }}>
          <svg className="tl-thread-connections" viewBox={`0 0 ${layout.width} ${layout.height}`} aria-hidden="true">
            <defs>
              {["default", "retry", "followed"].map((mode) => <marker
                key={mode} id={marker + mode} viewBox="0 0 10 10" refX="8" refY="5"
                markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"
              ><path data-mode={mode} d="M 1 1 L 8 5 L 1 9" /></marker>)}
            </defs>
            {edges.map(({ edge, d, mode, unavailable, emphasis }) => <path key={edge.from + "/" + edge.to}
              d={d} data-mode={mode} data-dim={unavailable} data-emphasis={emphasis}
              markerEnd={`url(#${marker + mode})`} />)}
          </svg>
          {edges.map(({ edge, label, x, y, retry, unavailable, emphasis }) => label && <span aria-hidden="true"
            key={edge.from + "/" + edge.to} className="tl-thread-edge-label" data-retry={retry}
            data-dim={unavailable} data-emphasis={emphasis} style={{ left: x, top: y }}>{label}</span>)}
          {layout.ordered.map((id) => {
            const node = graph.nodes.find((item) => item.id === id)!;
            const state = route.nodeState(id);
            const terminal = !graph.edges.some((edge) => edge.from === id);
            const status = nodeStatus(node, state, terminal);
            return <button
              key={id} type="button" className="tl-thread-graph-node" aria-pressed={selected === id}
              data-state={state} data-kind={node.kind} data-terminal={terminal}
              data-emphasis={attention ? (neighbors.has(id) ? "connected" : "distant") : undefined}
              style={{ left: layout.positions.get(id)!.x, top: layout.positions.get(id)!.y, width: cardWidth, height: cardHeight }}
              onPointerEnter={(event) => { if (depth && !drag.current && event.pointerType === "mouse") setHovered(id); }}
              onPointerLeave={() => setHovered(null)}
              onFocus={(event) => {
                if (!event.currentTarget.matches(":focus-visible")) return;
                resetTilt();
                setFocused(id);
                showOnKeyboardFocus(id);
              }}
              onBlur={() => setFocused(null)}
              onClick={() => select(id)}
            >
              <StepMark kind={node.kind} state={state} terminal={terminal} />
              <span><small>{status}</small><strong>{node.title}</strong></span>
            </button>;
          })}
        </div>
      </div>
    </div>
  </section>;
}

export function ThreadList({ graph, layout, route, selected, select }: Props) {
  return <ol className="tl-thread-linear" aria-label="Action Thread steps">
    {layout.ordered.map((id) => {
      const node = graph.nodes.find((item) => item.id === id)!;
      const outgoing = graph.edges.filter((edge) => edge.from === id);
      const state = route.nodeState(id);
      const terminal = outgoing.length === 0;
      return <li key={id} data-state={state}>
        <button type="button" aria-pressed={selected === id} onClick={() => select(id)}>
          <StepMark kind={node.kind} state={state} terminal={terminal} />
          <span><strong>{node.title}</strong><small>{nodeStatus(node, state, terminal)}</small></span>
          <WorkspaceIcon name="arrow" />
        </button>
        {outgoing.length > 0 && <ul>
          {outgoing.map((edge) => {
            const target = graph.nodes.find((item) => item.id === edge.to)?.title;
            const label = edge.kind === "retry" ? `Retry up to ${edge.max_traversals} times` : edge.outcome ?? "Then";
            return <li key={edge.to}><span>{label}</span> → {target}</li>;
          })}
        </ul>}
      </li>;
    })}
  </ol>;
}
