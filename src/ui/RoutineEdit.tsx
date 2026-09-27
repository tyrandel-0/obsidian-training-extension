import { useState } from "preact/hooks";
import { lastPerformance, nextSet, ROUTINE_COLORS } from "../format";
import type { TrainingStore } from "../store";
import type { Routine, WorkoutExercise } from "../types";
import { BigButton, Icon, Screen, TopBar } from "./components";
import { useCtx, useStore } from "./context";
import { confirm, prompt } from "./dialogs";
import { ExerciseBlock } from "./ExerciseBlock";

/** A new exercise entry with 3 sets, pre-filled from the last time it was done. */
export function newWorkoutExercise(store: TrainingStore, id: string, defaultRest: number): WorkoutExercise {
  const info = store.getExercise(id);
  const base: WorkoutExercise = { id, name: info?.name ?? id, track: info?.track ?? "weight_reps", sets: [] };
  const prev = lastPerformance(store.workouts, id);
  if (prev && prev.exercise.track === base.track) {
    return { ...base, rest: prev.exercise.rest, sets: prev.exercise.sets.map(({ done: _d, ...s }) => s) };
  }
  const first = nextSet(base);
  return { ...base, rest: base.track === "time" ? 60 : defaultRest, sets: [first, { ...first }, { ...first }] };
}

export function RoutineEdit({ routine }: { routine: Routine }) {
  const store = useStore();
  const { app, nav, settings } = useCtx();
  const [draft, setDraft] = useState<Routine>(routine);
  const [dirty, setDirty] = useState(!routine.file);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set(routine.exercises.length ? [0] : []));

  const change = (r: Routine) => {
    setDraft(r);
    setDirty(true);
  };
  const setEx = (i: number, ex: WorkoutExercise) => change({ ...draft, exercises: draft.exercises.map((x, j) => (j === i ? ex : x)) });

  const back = async () => {
    if (dirty && !(await confirm(app, "Выйти без сохранения?", "Изменения в программе будут потеряны.", "Выйти", true))) return;
    nav.pop();
  };

  const save = async () => {
    if (!draft.name.trim()) {
      const v = await prompt(app, "Название программы", "", "Full Body 1");
      if (!v?.trim()) return;
      draft.name = v.trim();
    }
    try {
      const saved = await store.saveRoutine({ ...draft, name: draft.name.trim() });
      setDirty(false);
      nav.pop();
      if (!routine.file) nav.push({ kind: "routine", file: saved.file! });
      // renamed: the detail screen underneath still points at the old path
      else if (saved.file !== routine.file) nav.replace({ kind: "routine", file: saved.file! });
    } catch (e) {
      store.notifyError(e, "Не удалось сохранить программу");
    }
  };

  const rename = async () => {
    const v = await prompt(app, "Название программы", draft.name, "Full Body 1");
    if (v?.trim()) change({ ...draft, name: v.trim() });
  };

  const addExercises = () =>
    nav.push({
      kind: "picker",
      title: "Добавить упражнения",
      multi: true,
      onPick: (ids) => {
        setDraft((d) => {
          const added = ids.map((id) => newWorkoutExercise(store, id, settings().defaultRest));
          setExpanded((s) => new Set([...s, ...added.map((_, k) => d.exercises.length + k)]));
          return { ...d, exercises: [...d.exercises, ...added] };
        });
        setDirty(true);
      },
    });

  const replace = (i: number) =>
    nav.push({
      kind: "picker",
      title: "Заменить упражнение",
      multi: false,
      onPick: ([id]) => {
        setDraft((d) => {
          const fresh = newWorkoutExercise(store, id, settings().defaultRest);
          return { ...d, exercises: d.exercises.map((x, j) => (j === i ? fresh : x)) };
        });
        setDirty(true);
      },
    });

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= draft.exercises.length) return;
    const arr = [...draft.exercises];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    change({ ...draft, exercises: arr });
    setExpanded((s) => new Set([...s].map((k) => (k === i ? j : k === j ? i : k))));
  };

  return (
    <Screen class="tt-edit">
      <TopBar
        accent
        onBack={back}
        title={
          <span class="tt-editable" onClick={rename}>
            {draft.name || "Новая программа"} <Icon name="pencil" size={16} />
          </span>
        }
        subtitle="Режим редактирования"
      />
      <div class="tt-scroll">
        <div class="tt-color-row">
          {ROUTINE_COLORS.map((c) => (
            <button
              class={`tt-color-dot ${draft.color === c ? "is-active" : ""}`}
              style={{ background: c }}
              aria-label={`Цвет ${c}`}
              onClick={() => change({ ...draft, color: c })}
            />
          ))}
        </div>
        {draft.exercises.map((ex, i) => (
          <ExerciseBlock
            key={`${ex.id}-${i}`}
            ex={ex}
            mode="edit"
            expanded={expanded.has(i)}
            onToggle={() => setExpanded((s) => (s.has(i) ? new Set([...s].filter((k) => k !== i)) : new Set([...s, i])))}
            onChange={(nx) => setEx(i, nx)}
            onRemove={() => {
              change({ ...draft, exercises: draft.exercises.filter((_, j) => j !== i) });
              setExpanded((s) => new Set([...s].filter((k) => k !== i).map((k) => (k > i ? k - 1 : k))));
            }}
            onMove={(d) => move(i, d)}
            onReplace={() => replace(i)}
          />
        ))}
        <button class="tt-card tt-add-exercises" onClick={addExercises}>
          <Icon name="plus" /> Добавить упражнения
        </button>
        <div class="tt-bottom-spacer" />
      </div>
      <div class="tt-bottom-bar">
        <BigButton onClick={save} disabled={!dirty && !!routine.file}>
          Сохранить
        </BigButton>
      </div>
    </Screen>
  );
}
