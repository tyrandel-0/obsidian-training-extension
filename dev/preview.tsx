// Browser preview of the tracker UI with an in-memory vault and demo data.
// Run `npm run preview`, open http://localhost:8000 (use the phone-sized devtools view).
import { render } from "preact";
import { localIso, serializeRoutine, serializeWorkout } from "../src/format";
import { TrainingStore, yaml } from "../src/store";
import { DEFAULT_SETTINGS, type Routine, type Workout } from "../src/types";
import { App } from "../src/ui/App";
import type { Nav } from "../src/ui/context";
import { makeApp, MemoryVault } from "./obsidian-shim";

const params = new URLSearchParams(location.search);
if (params.get("theme") === "dark") document.body.classList.add("theme-dark");
else document.body.classList.add("theme-light");

const settings = {
  ...DEFAULT_SETTINGS,
  libraryUrl: params.get("lib") ?? "exercises.json",
  libraryImageBase: params.get("img") ?? DEFAULT_SETTINGS.libraryImageBase,
};

const vault = new MemoryVault();
const app = makeApp(vault);

const fb1: Routine = {
  name: "Full Body 1",
  color: "#f5793b",
  exercises: [
    { id: "Dumbbell_Bench_Press", name: "Dumbbell Bench Press", track: "weight_reps", rest: 90, sets: [{ kg: 40, reps: 20 }, { kg: 40, reps: 20 }, { kg: 40, reps: 20 }] },
    { id: "Dumbbell_Squat", name: "Dumbbell Squat", track: "weight_reps", rest: 90, sets: [{ kg: 40, reps: 12 }, { kg: 40, reps: 12 }, { kg: 40, reps: 12 }] },
    { id: "Bent_Over_Two-Dumbbell_Row", name: "Bent Over Two-Dumbbell Row", track: "weight_reps", rest: 90, sets: [{ kg: 30, reps: 15 }, { kg: 30, reps: 15 }, { kg: 30, reps: 15 }] },
    { id: "Dumbbell_Flyes", name: "Dumbbell Flyes", track: "weight_reps", rest: 60, sets: [{ kg: 14, reps: 12 }, { kg: 14, reps: 12 }, { kg: 14, reps: 12 }] },
    { id: "Plank", name: "Plank", track: "time", rest: 60, sets: [{ sec: 60 }, { sec: 60 }, { sec: 60 }] },
    { id: "One_Arm_Dumbbell_Preacher_Curl", name: "Preacher Curl", track: "weight_reps", rest: 60, sets: [{ kg: 12, reps: 12 }, { kg: 12, reps: 12 }, { kg: 12, reps: 12 }] },
  ],
};
const fb2: Routine = {
  name: "Full Body 2",
  color: "#f5793b",
  exercises: [
    { id: "Incline_Dumbbell_Press", name: "Incline Dumbbell Press", track: "weight_reps", sets: [{ kg: 30, reps: 20 }, { kg: 30, reps: 20 }, { kg: 30, reps: 20 }] },
    { id: "Russian_Twist", name: "Russian Twist", track: "time", sets: [{ sec: 30 }, { sec: 30 }, { sec: 30 }] },
    { id: "Pullups", name: "Pullups", track: "reps", sets: [{ reps: 10 }, { reps: 10 }, { reps: 10 }] },
  ],
};
const fb3: Routine = {
  name: "Full Body 3",
  color: "#e05a67",
  exercises: [
    { id: "Dumbbell_Flyes", name: "Dumbbell Flyes", track: "weight_reps", sets: [{ kg: 14, reps: 20 }, { kg: 14, reps: 20 }, { kg: 14, reps: 20 }] },
    { id: "Dumbbell_Rear_Lunge", name: "Dumbbell Rear Lunge", track: "weight_reps", sets: [{ kg: 16, reps: 12 }, { kg: 16, reps: 12 }, { kg: 16, reps: 12 }] },
  ],
};
for (const r of [fb1, fb2, fb3]) vault.text.set(`Training/Routines/${r.name}.md`, serializeRoutine(r, yaml));

// ~8 weeks of history with slowly growing weights
if (params.get("empty") === null) {
  const now = Date.now();
  let n = 0;
  for (let d = 56; d > 0; d -= 2 + (d % 3)) {
    const start = new Date(now - d * 864e5);
    start.setHours(19, 10, 0, 0);
    const r = [fb1, fb2, fb3][n++ % 3];
    const grow = Math.floor((56 - d) / 14) * 2;
    const w: Workout = {
      name: r.name,
      routine: r.name,
      start: localIso(start),
      end: localIso(new Date(start.getTime() + (48 + (d % 7)) * 60000)),
      status: "done",
      exercises: r.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, kg: s.kg !== undefined ? s.kg - 6 + grow : undefined, done: true })) })),
    };
    vault.text.set(`Training/Workouts/${w.start.slice(0, 4)}/${w.start.slice(0, 10)} ${r.name}.md`, serializeWorkout(w, yaml));
  }
}

const store = new TrainingStore(app as never, () => settings);
declare global {
  interface Window {
    __nav?: Nav;
    __store?: TrainingStore;
  }
}
window.__store = store;

(async () => {
  await store.load();
  if (params.get("nolib") === null) await store.importLibrary();
  const root = document.getElementById("root")!;
  root.classList.add("tt-root");
  render(
    <App
      ctx={{ app: app as never, store, settings: () => settings, openFile: (p) => console.log("open", p) }}
      bindNav={(nav) => (window.__nav = nav)}
    />,
    root,
  );
})();
