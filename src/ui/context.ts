import { createContext } from "preact";
import { useContext, useEffect, useReducer, useState } from "preact/hooks";
import type { App } from "obsidian";
import type { TrainingStore } from "../store";
import type { Exercise, Routine, Settings } from "../types";

export type Route =
  | { kind: "routine"; file: string }
  | { kind: "routine-edit"; routine: Routine }
  | { kind: "workout" }
  | { kind: "picker"; title: string; multi: boolean; onPick: (ids: string[]) => void }
  | { kind: "exercise"; id: string }
  | { kind: "exercise-form"; exercise?: Exercise }
  | { kind: "history"; file: string };

export type TabId = "home" | "routines" | "exercises" | "report";

export interface Nav {
  tab(t: TabId): void;
  push(r: Route): void;
  pop(): void;
  replace(r: Route): void;
  reset(): void;
}

export interface Ctx {
  app: App;
  store: TrainingStore;
  settings: () => Settings;
  openFile: (path: string) => void;
  nav: Nav;
}

export const AppContext = createContext<Ctx>(null as unknown as Ctx);

export function useCtx(): Ctx {
  return useContext(AppContext);
}

/** Re-render whenever the store changes. */
export function useStore(): TrainingStore {
  const { store } = useCtx();
  const [, force] = useReducer((x: number, _: void) => x + 1, 0);
  useEffect(() => store.subscribe(() => force()), [store]);
  return store;
}

/** Current time, refreshed every `ms` while mounted. */
export function useNow(ms = 1000, enabled = true): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return;
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms, enabled]);
  return now;
}
