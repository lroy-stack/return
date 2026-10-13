import { useEffect, useRef } from "react";

/**
 * Tiny bus for "something was created elsewhere" (the Quick card sheet creates items and tags while a page is
 * on screen). Pages that list that data subscribe and reload silently.
 */
const bus = new EventTarget();
const EVENT = "return:data-changed";

export function notifyDataChanged(): void {
  bus.dispatchEvent(new Event(EVENT));
}

export function useDataChanged(callback: () => void): void {
  const ref = useRef(callback);
  ref.current = callback;
  useEffect(() => {
    const handler = () => ref.current();
    bus.addEventListener(EVENT, handler);
    return () => bus.removeEventListener(EVENT, handler);
  }, []);
}
