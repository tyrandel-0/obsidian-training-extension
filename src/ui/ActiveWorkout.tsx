import { Modal, Notice, Setting } from "obsidian";
import { useEffect, useRef, useState } from "preact/hooks";
import { doneSets, fmtClock, fmtDuration, fmtKg, pluralRu, fmtSet, lastPerformance, localIso, workoutDuration, workoutVolume } from "../format";
import type { Workout, WorkoutExercise } from "../types";
import { BigButton, Empty, Icon, Screen, TopBar } from "./components";
import { useCtx, useNow, useStore } from "./context";
import { confirm, prompt, showMenu } from "./dialogs";
import { ExerciseBlock } from "./ExerciseBlock";
import { newWorkoutExercise } from "./RoutineEdit";

let audio: AudioContext | undefined;

/** iOS only lets audio start from a user gesture, so the context is created on a tap and reused later. */
function primeAudio(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audio ??= new Ctx();
    if (audio.state === "suspended") void audio.resume();
  } catch {
    /* no audio — fine */
  }
}

function beep(): void {
  try {
    const ctx = audio;
    if (!ctx) return;
    [0, 0.25, 0.5].forEach((t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, ctx.currentTime + t);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.2);
    });
  } catch {
    /* no audio — fine */
  }
}

function cursorOf(w: Workout): { ex: number; set: number } | undefined {
  for (let i = 0; i < w.exercises.length; i++) {
    const j = w.exercises[i].sets.findIndex((s) => !s.done);
    if (j >= 0) return { ex: i, set: j };
  }
  return undefined;
}

function RestBar() {
  const store = useStore();
  const { settings } = useCtx();
  const rest = store.rest;
  const now = useNow(250, !!rest);
  const fired = useRef(false);
  const left = rest ? Math.ceil((rest.until - now) / 1000) : 0;
  useEffect(() => {
    fired.current = false;
  }, [rest?.until]);
  useEffect(() => {
    if (rest && left <= 0 && !fired.current) {
      fired.current = true;
      if (settings().restSound) beep();
      new Notice("Отдых окончен — следующий подход 💪");
      store.stopRest();
    }
  }, [left, rest]);
  if (!rest || left <= 0) return null;
  const pct = Math.max(0, Math.min(1, left / rest.total));
  return (
    <div class="tt-rest">
      <div class="tt-rest-progress" style={{ width: `${pct * 100}%` }} />
      <button class="tt-rest-btn" onClick={() => store.adjustRest(-15)}>
        −15
      </button>
      <div class="tt-rest-time">
        <span class="tt-rest-label">Отдых</span>
        {fmtClock(left)}
      </div>
      <button class="tt-rest-btn" onClick={() => store.adjustRest(15)}>
        +15
      </button>
      <button class="tt-rest-btn" onClick={() => store.stopRest()} aria-label="Пропустить отдых">
        <Icon name="skip-forward" />
      </button>
    </div>
  );
}

function finishDialog(app: import("obsidian").App, w: Workout, hasRoutine: boolean): Promise<{ action: "finish" | "discard" | "cancel"; updateRoutine: boolean }> {
  return new Promise((resolve) => {
    let result: { action: "finish" | "discard" | "cancel"; updateRoutine: boolean } = { action: "cancel", updateRoutine: false };
    let updateRoutine = false;
    const m = new Modal(app);
    m.titleEl.setText("Закончить тренировку?");
    const sets = doneSets(w);
    const stats = m.contentEl.createDiv({ cls: "tt-finish-stats" });
    const stat = (v: string, l: string) => {
      const d = stats.createDiv({ cls: "tt-stat" });
      d.createDiv({ cls: "tt-stat-value", text: v });
      d.createDiv({ cls: "tt-stat-label", text: l });
    };
    stat(fmtDuration(workoutDuration(w)), "время");
    stat(String(sets), pluralRu(sets, "подход", "подхода", "подходов"));
    stat(fmtKg(workoutVolume(w)), "кг поднято");
    const undone = w.exercises.reduce((a, e) => a + e.sets.filter((s) => !s.done).length, 0);
    if (undone) m.contentEl.createEl("p", { cls: "tt-muted", text: `Неотмеченные подходы (${undone}) не попадут в историю.` });
    if (hasRoutine)
      new Setting(m.contentEl)
        .setName("Обновить программу")
        .setDesc("Сохранить веса, повторы и состав упражнений из этой тренировки в программу.")
        .addToggle((t) => t.setValue(false).onChange((v) => (updateRoutine = v)));
    new Setting(m.contentEl)
      .addButton((b) =>
        b
          .setButtonText("Удалить тренировку")
          .setWarning()
          .onClick(() => {
            result = { action: "discard", updateRoutine: false };
            m.close();
          }),
      )
      .addButton((b) => b.setButtonText("Продолжить").onClick(() => m.close()))
      .addButton((b) =>
        b
          .setButtonText("Закончить")
          .setCta()
          .setDisabled(sets === 0)
          .onClick(() => {
            result = { action: "finish", updateRoutine };
            m.close();
          }),
      );
    m.onClose = () => resolve(result);
    m.open();
  });
}

export function ActiveWorkout() {
  const store = useStore();
  const { app, nav, settings } = useCtx();
  const w = store.active;
  const now = useNow(1000, !!w);
  const cursor = w ? cursorOf(w) : undefined;
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set(cursor ? [cursor.ex] : []));
  const lastCursorEx = useRef(cursor?.ex);
  const listRef = useRef<HTMLDivElement>(null);

  // Follow the cursor into the next exercise, like the original app does.
  useEffect(() => {
    if (cursor && cursor.ex !== lastCursorEx.current) {
      lastCursorEx.current = cursor.ex;
      setExpanded((s) => new Set([...s, cursor.ex]));
      window.setTimeout(() => {
        listRef.current?.querySelector(".tt-set.is-current")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    }
  }, [cursor?.ex]);

  if (!w) {
    return (
      <Screen>
        <TopBar onBack={nav.pop} title="Тренировка" />
        <Empty icon="dumbbell" title="Нет активной тренировки" />
      </Screen>
    );
  }

  const update = (fn: (w: Workout) => Workout) => store.updateActive(fn);
  const setEx = (i: number, ex: WorkoutExercise) => update((w) => ({ ...w, exercises: w.exercises.map((x, j) => (j === i ? ex : x)) }));

  const toggleDone = (ei: number, si: number) => {
    const ex = w.exercises[ei];
    const wasDone = !!ex.sets[si].done;
    setEx(ei, { ...ex, sets: ex.sets.map((s, j) => (j === si ? { ...s, done: !wasDone } : s)) });
    if (!wasDone && settings().restTimer) {
      if (settings().restSound) primeAudio();
      const isLastOverall = !w.exercises.some((e, i) => e.sets.some((s, j) => !s.done && !(i === ei && j === si)));
      if (!isLastOverall) store.startRest(ex.rest ?? settings().defaultRest);
    }
  };

  const recordNext = () => {
    if (cursor) toggleDone(cursor.ex, cursor.set);
  };

  const completeAll = async () => {
    if (!(await confirm(app, "Отметить всё?", "Все оставшиеся подходы будут отмечены выполненными с текущими значениями.", "Отметить"))) return;
    update((w) => ({ ...w, exercises: w.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s, done: true })) })) }));
  };

  const finish = async () => {
    await store.flushActive();
    const r = await finishDialog(app, w, !!w.routine && store.routines.some((x) => x.name === w.routine));
    if (r.action === "finish") {
      const done = await store.finishActive({ updateRoutine: r.updateRoutine });
      nav.pop();
      if (done?.file) nav.push({ kind: "history", file: done.file });
    } else if (r.action === "discard") {
      if (await confirm(app, "Удалить тренировку?", "Заметка тренировки будет перемещена в корзину.", "Удалить", true)) {
        await store.discardActive();
        nav.pop();
      }
    }
  };

  const addExercises = () =>
    nav.push({
      kind: "picker",
      title: "Добавить упражнения",
      multi: true,
      onPick: (ids) => {
        const added = ids.map((id) => newWorkoutExercise(store, id, settings().defaultRest));
        update((w) => ({ ...w, exercises: [...w.exercises, ...added] }));
        setExpanded((s) => new Set([...s, ...added.map((_, i) => w.exercises.length + i)]));
      },
    });

  const replace = (i: number) =>
    nav.push({
      kind: "picker",
      title: "Заменить упражнение",
      multi: false,
      onPick: ([id]) => {
        const fresh = newWorkoutExercise(store, id, settings().defaultRest);
        const old = w.exercises[i];
        // keep the planned number of sets, reset values to the new exercise's type
        setEx(i, { ...fresh, rest: old.rest, sets: old.track === fresh.track ? old.sets.map((s) => ({ ...s, done: false })) : fresh.sets });
      },
    });

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= w.exercises.length) return;
    update((w) => {
      const arr = [...w.exercises];
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...w, exercises: arr };
    });
    setExpanded((s) => new Set([...s].map((k) => (k === i ? j : k === j ? i : k))));
  };

  const remove = async (i: number) => {
    if (w.exercises[i].sets.some((s) => s.done) && !(await confirm(app, "Удалить упражнение?", "Отмеченные подходы тоже удалятся.", "Удалить", true))) return;
    update((w) => ({ ...w, exercises: w.exercises.filter((_, j) => j !== i) }));
    setExpanded((s) => new Set([...s].filter((k) => k !== i).map((k) => (k > i ? k - 1 : k))));
  };

  const editTimer = async () => {
    const mins = Math.round(workoutDuration(w, now) / 60);
    const v = await prompt(app, "Сколько минут идёт тренировка?", String(mins), "", "numeric");
    const n = v === undefined ? NaN : parseInt(v, 10);
    if (Number.isFinite(n) && n >= 0) {
      const start = localIso(new Date(Date.now() - n * 60000));
      update((w) => ({ ...w, start }));
    }
  };

  const headerMenu = (e: MouseEvent) =>
    showMenu(e, [
      {
        title: "Переименовать",
        icon: "pencil",
        onClick: async () => {
          const v = await prompt(app, "Название тренировки", w.name);
          if (v?.trim()) update((w) => ({ ...w, name: v.trim() }));
        },
      },
      { title: "Изменить время", icon: "clock", onClick: editTimer },
      {
        title: w.note ? "Изменить заметку" : "Заметка к тренировке",
        icon: "sticky-note",
        onClick: async () => {
          const v = await prompt(app, "Заметка", w.note ?? "");
          if (v !== undefined) update((w) => ({ ...w, note: v.trim() || undefined }));
        },
      },
      null,
      {
        title: "Удалить тренировку",
        icon: "trash-2",
        warning: true,
        onClick: async () => {
          if (await confirm(app, "Удалить тренировку?", "Заметка тренировки будет перемещена в корзину.", "Удалить", true)) {
            await store.discardActive();
            nav.pop();
          }
        },
      },
    ]);

  return (
    <Screen class="tt-active">
      <TopBar
        onBack={nav.pop}
        title={<span class="tt-small-title" onClick={headerMenu}>{w.name}</span>}
        subtitle={
          <span class="tt-timer" onClick={editTimer}>
            {fmtClock(workoutDuration(w, now))} <Icon name="pencil" size={16} />
          </span>
        }
        right={
          <>
            <button class="tt-finish-btn" onClick={finish}>
              Закончить
            </button>
            <button class="tt-icon-btn clickable-icon" aria-label="Меню" onClick={headerMenu}>
              <Icon name="more-vertical" />
            </button>
          </>
        }
      />
      <div class="tt-scroll" ref={listRef}>
        {w.exercises.length === 0 && <Empty icon="list-plus" title="Пустая тренировка" text="Добавь упражнения, чтобы начать записывать подходы." />}
        {w.exercises.map((ex, i) => {
          const prev = lastPerformance(store.workouts, ex.id, w.start);
          return (
            <ExerciseBlock
              key={`${ex.id}-${i}`}
              ex={ex}
              mode="active"
              expanded={expanded.has(i)}
              onToggle={() => setExpanded((s) => (s.has(i) ? new Set([...s].filter((k) => k !== i)) : new Set([...s, i])))}
              onChange={(nx) => setEx(i, nx)}
              onRemove={() => void remove(i)}
              onMove={(d) => move(i, d)}
              onReplace={() => replace(i)}
              cursor={cursor?.ex === i ? cursor.set : undefined}
              onToggleDone={(si) => toggleDone(i, si)}
              previous={prev?.exercise.sets.map((s) => fmtSet(s, prev.exercise.track)).join(", ")}
            />
          );
        })}
        <button class="tt-card tt-add-exercises" onClick={addExercises}>
          <Icon name="plus" /> Добавить упражнения
        </button>
        <div class="tt-bottom-spacer" />
      </div>
      <div class="tt-bottom-bar">
        <RestBar />
        <div class="tt-bottom-row">
          <button class="tt-all-btn" onClick={completeAll} aria-label="Отметить всё">
            <Icon name="check-square" />
            <span>ВСЕ</span>
          </button>
          <BigButton onClick={cursor ? recordNext : finish} class="tt-grow">
            {cursor ? "Записать следующий подход" : w.exercises.length ? "Закончить тренировку" : "Закончить"}
          </BigButton>
        </div>
      </div>
    </Screen>
  );
}
