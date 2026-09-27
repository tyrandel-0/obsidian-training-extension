import { useEffect, useMemo, useState } from "preact/hooks";
import { ActiveWorkout } from "./ActiveWorkout";
import { Icon } from "./components";
import { AppContext, type Ctx, type Nav, type Route, type TabId } from "./context";
import { ExerciseForm, ExerciseInfo } from "./ExerciseInfo";
import { ExercisePicker, ExercisesTab } from "./Exercises";
import { HomeTab, ReportTab } from "./Home";
import { RoutineDetail, RoutinesTab } from "./Routines";
import { RoutineEdit } from "./RoutineEdit";
import { WorkoutDetail } from "./Home";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "home", label: "Тренировка", icon: "dumbbell" },
  { id: "routines", label: "Программы", icon: "clipboard-list" },
  { id: "exercises", label: "Упражнения", icon: "layout-grid" },
  { id: "report", label: "Отчёт", icon: "bar-chart-3" },
];

function renderRoute(r: Route) {
  switch (r.kind) {
    case "routine":
      return <RoutineDetail file={r.file} />;
    case "routine-edit":
      return <RoutineEdit routine={r.routine} />;
    case "workout":
      return <ActiveWorkout />;
    case "picker":
      return <ExercisePicker title={r.title} multi={r.multi} onPick={r.onPick} />;
    case "exercise":
      return <ExerciseInfo id={r.id} />;
    case "exercise-form":
      return <ExerciseForm exercise={r.exercise ?? { id: "", name: "", primaryMuscles: [], secondaryMuscles: [], instructions: [], images: [], track: "weight_reps", source: "custom" }} />;
    case "history":
      return <WorkoutDetail file={r.file} />;
  }
}

export interface AppProps {
  ctx: Omit<Ctx, "nav">;
  /** lets the plugin open the running workout from a command */
  bindNav?: (nav: Nav) => void;
  initial?: Route;
}

export function App({ ctx, bindNav, initial }: AppProps) {
  const [tab, setTab] = useState<TabId>("home");
  // Screens stay mounted underneath each other so e.g. a routine being edited keeps its state
  // while the exercise picker is open on top of it.
  const [stack, setStack] = useState<{ key: number; route: Route }[]>(() => (initial ? [{ key: 0, route: initial }] : []));
  const nav = useMemo<Nav>(() => {
    let seq = 1;
    return {
      push: (route) => setStack((s) => [...s, { key: seq++, route }]),
      pop: () => setStack((s) => s.slice(0, -1)),
      replace: (route) => setStack((s) => [...s.slice(0, -1), { key: seq++, route }]),
      reset: () => setStack([]),
      tab: (t) => {
        setStack([]);
        setTab(t);
      },
    };
  }, []);
  useEffect(() => bindNav?.(nav), [nav]);

  const value = useMemo<Ctx>(() => ({ ...ctx, nav }), [ctx, nav]);
  const top = stack.length - 1;

  return (
    <AppContext.Provider value={value}>
      <div class="tt-app">
        <div class="tt-layer" style={{ display: top >= 0 ? "none" : undefined }}>
          <div class="tt-tab-body">
            {tab === "home" && <HomeTab />}
            {tab === "routines" && <RoutinesTab />}
            {tab === "exercises" && <ExercisesTab />}
            {tab === "report" && <ReportTab />}
          </div>
          <nav class="tt-tabbar">
            {TABS.map((t) => (
              <button class={`tt-tab ${tab === t.id ? "is-active" : ""}`} onClick={() => setTab(t.id)}>
                <Icon name={t.icon} />
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
        </div>
        {stack.map((s, i) => (
          <div class="tt-layer" key={s.key} style={{ display: i === top ? undefined : "none" }}>
            {renderRoute(s.route)}
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}
