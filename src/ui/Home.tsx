import { doneSets, fmtClock, fmtDuration, fmtKg, fmtSet, initials, pluralRu, weeklyBuckets, workoutDuration, workoutVolume } from "../format";
import type { Workout } from "../types";
import { BigButton, Empty, Icon, IconButton, Screen, Stat, TopBar } from "./components";
import { BarChart } from "./Charts";
import { useCtx, useNow, useStore } from "./context";
import { confirm, showMenu } from "./dialogs";
import { exerciseTitle } from "./ExerciseBlock";
import { routineColor } from "./Routines";

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long" });

export function ActiveBanner() {
  const store = useStore();
  const { nav } = useCtx();
  const now = useNow(1000, !!store.active);
  const w = store.active;
  if (!w) return null;
  const total = w.exercises.reduce((a, e) => a + e.sets.length, 0);
  return (
    <button class="tt-active-banner" onClick={() => nav.push({ kind: "workout" })}>
      <Icon name="activity" />
      <span class="tt-grow">
        <b>{w.name}</b> · {doneSets(w)}/{total} подходов
      </span>
      <span class="tt-mono">{fmtClock(workoutDuration(w, now))}</span>
      <Icon name="chevron-right" />
    </button>
  );
}

function WorkoutRow({ w }: { w: Workout }) {
  const { nav } = useCtx();
  return (
    <div class="tt-card tt-row" onClick={() => nav.push({ kind: "history", file: w.file! })}>
      <div class="tt-row-text">
        <div class="tt-row-title">{w.name}</div>
        <div class="tt-row-sub">
          {dateLabel(w.start)} · {fmtDuration(workoutDuration(w))} · {fmtKg(workoutVolume(w))} кг
        </div>
      </div>
      <Icon name="chevron-right" />
    </div>
  );
}

export function HomeTab() {
  const store = useStore();
  const { app, nav } = useCtx();
  const done = store.workouts.filter((w) => w.status === "done").sort((a, b) => b.start.localeCompare(a.start));

  const startEmpty = async () => {
    if (store.active) return nav.push({ kind: "workout" });
    await store.startWorkout();
    nav.push({ kind: "workout" });
  };
  const startRoutine = async (i: number) => {
    const r = store.routines[i];
    if (store.active) {
      if (await confirm(app, "Уже идёт тренировка", `Сейчас открыта «${store.active.name}». Вернуться к ней?`, "Вернуться")) nav.push({ kind: "workout" });
      return;
    }
    await store.startWorkout(r);
    nav.push({ kind: "workout" });
  };

  return (
    <Screen>
      <div class="tt-page-title">Тренировка</div>
      <div class="tt-scroll">
        <ActiveBanner />
        {!store.active && (
          <BigButton onClick={startEmpty} icon="play">
            Начать пустую тренировку
          </BigButton>
        )}
        {store.routines.length > 0 && (
          <>
            <div class="tt-section">Быстрый старт</div>
            <div class="tt-quick">
              {store.routines.map((r, i) => (
                <button class="tt-card tt-quick-item" onClick={() => startRoutine(i)}>
                  <div class="tt-avatar" style={{ background: routineColor(r, i) }}>
                    {initials(r.name)}
                  </div>
                  <div class="tt-quick-name">{r.name}</div>
                  <div class="tt-muted">
                    {r.exercises.length} {pluralRu(r.exercises.length, "упражнение", "упражнения", "упражнений")}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
        <div class="tt-section">Последние тренировки</div>
        {done.length === 0 && <Empty icon="history" title="Истории пока нет" text="Законченные тренировки появятся здесь и в папке Workouts." />}
        {done.slice(0, 5).map((w) => (
          <WorkoutRow w={w} />
        ))}
        {done.length > 5 && (
          <button class="tt-link tt-link-btn" onClick={() => nav.tab("report")}>
            Вся история в «Отчёте»
          </button>
        )}
        <div class="tt-bottom-spacer" />
      </div>
    </Screen>
  );
}

export function ReportTab() {
  const store = useStore();
  const done = store.workouts.filter((w) => w.status === "done").sort((a, b) => b.start.localeCompare(a.start));
  const weeks = weeklyBuckets(done, 12);
  const month = done.filter((w) => Date.now() - Date.parse(w.start) < 30 * 864e5);
  const thisWeek = weeks[weeks.length - 1];
  const wk = (d: Date) => `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`;

  return (
    <Screen>
      <div class="tt-page-title">Отчёт</div>
      <div class="tt-scroll">
        <div class="tt-stats">
          <Stat label="тренировок за 30 дней" value={String(month.length)} />
          <Stat label="на этой неделе" value={String(thisWeek.workouts)} />
          <Stat label="время за неделю" value={fmtDuration(thisWeek.seconds)} />
          <Stat label="кг за неделю" value={fmtKg(thisWeek.volume)} />
        </div>
        <div class="tt-section">Тренировок в неделю</div>
        <div class="tt-card tt-pad">
          <BarChart
            integer
            data={weeks.map((b) => ({
              label: wk(b.start),
              value: b.workouts,
              tip: `Неделя с ${wk(b.start)}: ${b.workouts} ${pluralRu(b.workouts, "тренировка", "тренировки", "тренировок")}, ${fmtKg(b.volume)} кг`,
            }))}
            emptyText="Закончи первую тренировку — здесь появится график"
          />
        </div>
        <div class="tt-section">Поднято за неделю, кг</div>
        <div class="tt-card tt-pad">
          <BarChart
            data={weeks.map((b) => ({ label: wk(b.start), value: Math.round(b.volume), tip: `Неделя с ${wk(b.start)}: ${fmtKg(b.volume)} кг` }))}
            emptyText="Пока нет подходов с весом"
          />
        </div>
        <div class="tt-section">История · {done.length}</div>
        {done.length === 0 && <Empty icon="history" title="Истории пока нет" />}
        {done.map((w) => (
          <WorkoutRow w={w} />
        ))}
        <div class="tt-bottom-spacer" />
      </div>
    </Screen>
  );
}

export function WorkoutDetail({ file }: { file: string }) {
  const store = useStore();
  const { app, nav, openFile } = useCtx();
  const w = store.workouts.find((x) => x.file === file);
  if (!w) {
    return (
      <Screen>
        <TopBar onBack={nav.pop} title="Тренировка" />
        <Empty icon="file-x" title="Тренировка не найдена" />
      </Screen>
    );
  }
  const again = async () => {
    if (store.active) return nav.push({ kind: "workout" });
    await store.startWorkout({ name: w.routine ?? w.name, exercises: w.exercises });
    if (!w.routine) store.updateActive((a) => ({ ...a, routine: undefined }));
    nav.push({ kind: "workout" });
  };
  const menu = (e: MouseEvent) =>
    showMenu(e, [
      { title: "Повторить тренировку", icon: "repeat", onClick: again },
      { title: "Открыть заметку", icon: "file-text", onClick: () => openFile(w.file!) },
      null,
      {
        title: "Удалить",
        icon: "trash-2",
        warning: true,
        onClick: async () => {
          if (!(await confirm(app, "Удалить тренировку?", "Заметка будет перемещена в корзину.", "Удалить", true))) return;
          await store.deleteWorkout(w);
          nav.pop();
        },
      },
    ]);
  return (
    <Screen>
      <TopBar onBack={nav.pop} title={w.name} subtitle={dateLabel(w.start)} right={<IconButton icon="more-vertical" label="Меню" onClick={menu} />} />
      <div class="tt-scroll">
        <div class="tt-stats">
          <Stat label="время" value={fmtDuration(workoutDuration(w))} />
          <Stat label="подходов" value={String(doneSets(w))} />
          <Stat label="кг поднято" value={fmtKg(workoutVolume(w))} />
        </div>
        {w.note && <div class="tt-note">{w.note}</div>}
        {w.exercises.map((e) => (
          <div class="tt-card tt-pad" onClick={() => nav.push({ kind: "exercise", id: e.id })}>
            <div class="tt-row-title">{exerciseTitle(e, store.getExercise(e.id))}</div>
            <div class="tt-history-sets">
              {e.sets.map((s, i) => (
                <div class="tt-history-set">
                  <span class="tt-muted">{i + 1}</span> {fmtSet(s, e.track)}
                </div>
              ))}
            </div>
          </div>
        ))}
        <div class="tt-bottom-spacer" />
      </div>
      <div class="tt-bottom-bar">
        <BigButton kind="outline" icon="repeat" onClick={again}>
          Повторить
        </BigButton>
      </div>
    </Screen>
  );
}
