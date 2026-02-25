// Lightweight cross-page data invalidation via CustomEvents.
// Mutation pages (gastos, ingresos, metas) emit events;
// the dashboard listens and refetches when data changes.

export type DataEventType = "expenses" | "incomes" | "goals";

const EVENT_NAME = "data-changed";

export function emitDataChanged(type: DataEventType) {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { type } }));
}

export function onDataChanged(
  callback: (type: DataEventType) => void
): () => void {
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<{ type: DataEventType }>).detail;
    callback(detail.type);
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
