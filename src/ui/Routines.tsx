import { exerciseVolume, fmtKg, initials, pluralRu, ROUTINE_COLORS, setsSummary, TRACK_LABELS } from "../format";
import type { Routine } from "../types";
import { BigButton, Empty, ExThumb, Icon, IconButton, Screen, TopBar } from "./components";
import { useCtx, useStore } from "./context";
import { confirm, showMenu } from "./dialogs";
import { exerciseTitle } from "./ExerciseBlock";

export function routineColor(r: Routine, index = 0): string {
  return r.color ?? ROUTINE_COLORS[index % ROUTINE_COLORS.length];
}

function repsLabel(r: Routine["exercises"][number]): string {
  const [n, rest] = setsSummary(r).split(" × ");
  if (r.track === "time" || r.track === "distance_time") return `${n} подх. × ${rest}`;
  return `${n} подх. × ${rest} повт.`;
}

export function RoutinesTab() {
  const store = useStore();
  const { nav } = useCtx();
  const create = () => nav.push({ kind: "routine-edit", routine: { name: "", color: ROUTINE_COLORS[store.routines.length % ROUTINE_COLORS.length], exercises: [] } });
  return (
    <Screen>
      <div class="tt-page-title">Программы</div>
      <div class="tt-scroll">
        {store.routines.length === 0 && (
          <Empty icon="clipboard-list" title="Пока нет программ" text="Собери программу из упражнений — потом запускай её в один тап.">
            <BigButton onClick={create} icon="plus">
              Создать программу
            </BigButton>
          </Empty>
        )}
        {store.routines.map((r, i) => (
          <div class="tt-card tt-routine-card" onClick={() => nav.push({ kind: "routine", file: r.file! })}>
            <div class="tt-routine-head">
              <div>
                <div class="tt-routine-name">{r.name}</div>
                <div class="tt-muted">Упражнений: {r.exercises.length}</div>
              </div>
              <div class="tt-avatar" style={{ background: routineColor(r, i) }}>
                {initials(r.name)}
              </div>
            </div>
            <div class="tt-routine-lines">
              {r.exercises.slice(0, 3).map((e) => (
                <div class="tt-routine-line">
                  <span class="tt-ellipsis">{exerciseTitle(e, store.getExercise(e.id))}</span>
                  <b>{setsSummary(e)}</b>
                </div>
              ))}
            </div>
            {r.exercises.length > 3 && <div class="tt-link">Смотреть все</div>}
          </div>
        ))}
        <div class="tt-bottom-spacer" />
      </div>
      {store.routines.length > 0 && (
        <button class="tt-fab" onClick={create}>
          <Icon name="plus" /> Новая
        </button>
      )}
    </Screen>
  );
}

export function RoutineDetail({ file }: { file: string }) {
  const store = useStore();
  const { app, nav, openFile } = useCtx();
  const idx = store.routines.findIndex((r) => r.file === file);
  const r = store.routines[idx];
  if (!r) {
    return (
      <Screen>
        <TopBar onBack={nav.pop} title="Программа" />
        <Empty icon="file-x" title="Программа не найдена" text="Возможно, заметку переименовали или удалили." />
      </Screen>
    );
  }
  const history = store.workouts.filter((w) => w.status === "done" && w.routine === r.name);
  const lifted = history.reduce((a, w) => a + w.exercises.reduce((b, e) => b + exerciseVolume(e), 0), 0);

  const start = async () => {
    if (store.active) {
      if (!(await confirm(app, "Уже идёт тренировка", `Сейчас открыта «${store.active.name}». Вернуться к ней?`, "Вернуться"))) return;
      nav.push({ kind: "workout" });
      return;
    }
    await store.startWorkout(r);
    nav.push({ kind: "workout" });
  };

  const menu = (e: MouseEvent) =>
    showMenu(e, [
      { title: "Изменить", icon: "pencil", onClick: () => nav.push({ kind: "routine-edit", routine: structuredClone(r) }) },
      {
        title: "Дублировать",
        icon: "copy",
        onClick: async () => {
          const copy = await store.saveRoutine({ ...structuredClone(r), name: `${r.name} (копия)`, file: undefined });
          nav.replace({ kind: "routine", file: copy.file! });
        },
      },
      { title: "Открыть заметку", icon: "file-text", onClick: () => openFile(r.file!) },
      null,
      {
        title: "Удалить программу",
        icon: "trash-2",
        warning: true,
        onClick: async () => {
          if (!(await confirm(app, "Удалить программу?", `«${r.name}» будет перемещена в корзину. История тренировок останется.`, "Удалить", true))) return;
          await store.deleteRoutine(r);
          nav.pop();
        },
      },
    ]);

  const color = routineColor(r, idx);
  return (
    <Screen>
      <div class="tt-hero" style={{ "--tt-hero": color }}>
        <div class="tt-hero-bar">
          <IconButton icon="chevron-left" label="Назад" onClick={nav.pop} />
          <IconButton icon="more-horizontal" label="Меню" onClick={menu} />
        </div>
        <div class="tt-hero-title">{r.name}</div>
        <div class="tt-hero-sub">
          Выполнено {history.length} {pluralRu(history.length, "раз", "раза", "раз")} | {fmtKg(lifted)} кг поднято всего
        </div>
      </div>
      <div class="tt-scroll">
        {r.exercises.length === 0 && <Empty icon="list-plus" title="В программе нет упражнений" text="Нажми «Изменить», чтобы добавить." />}
        {r.exercises.map((e) => {
          const info = store.getExercise(e.id);
          return (
            <div class="tt-card tt-row" onClick={() => nav.push({ kind: "exercise", id: e.id })}>
              <ExThumb exercise={info} onInfo={() => nav.push({ kind: "exercise", id: e.id })} />
              <div class="tt-row-text">
                <div class="tt-row-title">{exerciseTitle(e, info)}</div>
                <div class="tt-row-sub" title={TRACK_LABELS[e.track]}>
                  {repsLabel(e)}
                </div>
              </div>
            </div>
          );
        })}
        <div class="tt-bottom-spacer" />
      </div>
      <div class="tt-bottom-bar tt-stack">
        <BigButton onClick={start} disabled={r.exercises.length === 0}>
          {store.active?.routine === r.name ? "Продолжить" : "Начать"}
        </BigButton>
        <BigButton kind="outline" icon="pencil" onClick={() => nav.push({ kind: "routine-edit", routine: structuredClone(r) })}>
          Изменить
        </BigButton>
      </div>
    </Screen>
  );
}
