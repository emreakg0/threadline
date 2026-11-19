const paths = {
  mark: "M3 5.5h14M10 5.5v5a3.5 3.5 0 0 1-3.5 3.5H3m7-3.5V14a2 2 0 0 0 2 2h5",
  capture: "M4 3h12v14H4z M7 8h6m-6 4h6",
  knowledge: "M3 4h3v12H3z m6 0h3v12H9z m5 1 2-1 3 11-2 1z",
  review: "M4 4h12v12H4z m3 6 2 2 4-4",
  folder:
    "M2 6a1 1 0 0 1 1-1h5l2 2h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z",
  trace: "M4 4h4v4H4z m8 8h4v4h-4z M6 8v6h6",
  plus: "M10 4v12M4 10h12",
  city: "M2 16h16M4 16V7h4v9m0 0V3h4v13m0 0v-6h4v6",
  search: "M13.5 8.5a5 5 0 1 1-10 0 5 5 0 0 1 10 0Zm-1.5 3.5 4 4",
  arrow: "M8 5l5 5-5 5",
  history: "M5 6a6 6 0 1 1-1 6M3 3v5h5m2-2v4l3 2",
  archive: "M3 4h14v4H3zm1 4v8h12V8m-8 3h4",
  evidence: "M6 3h8v13H6zm2 5h4m-4 3h4",
};

export type WorkspaceIconName = keyof typeof paths;

export function WorkspaceIcon({ name }: { name: WorkspaceIconName }) {
  return (
    <svg className="tl-icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
