/**
 * 收藏成员：纯本地（localStorage），不建账号、不上报。
 * useSyncExternalStore 订阅：同页多个收藏钮、跨标签页（storage 事件）都即时同步；
 * 服务端快照恒为空集，SSR 与首帧水合一致（收藏态在水合后才出现）。
 */
import { useSyncExternalStore } from "react";

const STORE_KEY = "kosx:favorites";
const EMPTY: readonly string[] = Object.freeze([]);

let cache: readonly string[] | null = null;
const listeners = new Set<() => void>();

function read(): readonly string[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(ids: readonly string[]) {
  cache = ids;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(ids));
  } catch {
    /* 隐私模式写不进去：本页会话内仍生效 */
  }
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORE_KEY) return;
    cache = null;
    fn();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

/** 当前收藏的成员 id 列表（SSR / 水合首帧为空） */
export function useFavorites(): readonly string[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function toggleFavorite(id: string): boolean {
  const ids = read();
  const on = !ids.includes(id);
  write(on ? [...ids, id] : ids.filter((x) => x !== id));
  return on;
}
