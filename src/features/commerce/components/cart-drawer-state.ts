"use client";

import { useSyncExternalStore } from "react";

let opened = false;
let trigger: HTMLElement | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function openCart(element?: HTMLElement | null) {
  trigger = element ?? (document.activeElement as HTMLElement | null);
  opened = true;
  notify();
}

export function closeCart() {
  opened = false;
  notify();
  const focusTarget = trigger;
  trigger = null;
  queueMicrotask(() => focusTarget?.focus());
}

export function useCartDrawerOpen() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => opened,
    () => false,
  );
}
