import { equipmentLabel, nextSet, pluralRu, TRACK_LABELS } from "../format";
import type { Exercise, SetEntry, TrackType, WorkoutExercise } from "../types";
import { ExThumb, Icon, IconButton, NumField, TimeField } from "./components";
import { useCtx } from "./context";
import { confirm, prompt, showMenu, type MenuEntry } from "./dialogs";

export function exerciseTitle(ex: WorkoutExercise, info?: Exercise): string {
  const name = info?.name ?? ex.name;
  const eq = equipmentLabel(info?.equipment);
  // "Жим лёжа · гантели" — only when the name doesn't already mention the equipment
  // (compare a stem so "гантелей"/"штангой" count as mentions).
  if (!eq || info?.source !== "library" || eq === "другое" || eq === "свой вес") return name;
  const lower = name.toLowerCase();
  const stem = eq.slice(0, Math.min(5, eq.length - 1));
  const en = info.equipment?.split(/[\s-]/)[0] ?? "";
  return lower.includes(stem) || (en && lower.includes(en)) ? name : `${name} · ${eq}`;
}

function SetFields({ set, track, onChange }: { set: SetEntry; track: TrackType; onChange: (s: SetEntry) => void }) {
  const upd = (patch: Partial<SetEntry>) => onChange({ ...set, ...patch });
  switch (track) {
    case "weight_reps":
      return (
        <>
          <NumField value={set.kg} decimal onChange={(kg) => upd({ kg })} />
          <span class="tt-unit">КГ</span>
          <NumField value={set.reps} onChange={(reps) => upd({ reps })} />
          <span class="tt-unit">ПОВТ.</span>
        </>
      );
    case "reps":
      return (
        <>
          <NumField value={set.reps} onChange={(reps) => upd({ reps })} />
          <span class="tt-unit">ПОВТ.</span>
        </>
      );
    case "time":
      return <TimeField value={set.sec} onChange={(sec) => upd({ sec })} />;
    case "distance_time":
      return (
        <>
          <NumField value={set.km} decimal onChange={(km) => upd({ km })} />
          <span class="tt-unit">КМ</span>
          <TimeField value={set.sec} onChange={(sec) => upd({ sec })} />
        </>
      );
  }
}

export interface ExerciseBlockProps {
  ex: WorkoutExercise;
  mode: "edit" | "active";
  expanded: boolean;
  onToggle: () => void;
  onChange: (ex: WorkoutExercise) => void;
  onRemove: () => void;
  onMove?: (dir: -1 | 1) => void;
  onReplace?: () => void;
  /** index of the set the "record next set" button will tick */
  cursor?: number;
  onToggleDone?: (setIndex: number) => void;
  previous?: string;
}

export function ExerciseBlock(p: ExerciseBlockProps) {
  const { app, store, settings, nav } = useCtx();
  const info = store.getExercise(p.ex.id);
  const done = p.ex.sets.filter((s) => s.done).length;
  const subtitle =
    p.mode === "active"
      ? `${done}/${p.ex.sets.length} выполнено`
      : `${p.ex.sets.length} ${pluralRu(p.ex.sets.length, "подход", "подхода", "подходов")}`;
  const openInfo = () => nav.push({ kind: "exercise", id: p.ex.id });

  const setSet = (i: number, s: SetEntry) => p.onChange({ ...p.ex, sets: p.ex.sets.map((x, j) => (j === i ? s : x)) });

  const menu = (e: MouseEvent) => {
    const entries: (MenuEntry | null)[] = [
      { title: "Об упражнении", icon: "info", onClick: openInfo },
      ...(p.onReplace ? [{ title: "Заменить упражнение", icon: "replace", onClick: p.onReplace }] : []),
      null,
      ...(p.onMove
        ? [
            { title: "Выше", icon: "arrow-up", onClick: () => p.onMove!(-1) },
            { title: "Ниже", icon: "arrow-down", onClick: () => p.onMove!(1) },
          ]
        : []),
      {
        title: `Отдых: ${p.ex.rest ?? settings().defaultRest} с`,
        icon: "timer",
        onClick: async () => {
          const v = await prompt(app, "Отдых между подходами, секунд", String(p.ex.rest ?? settings().defaultRest), "90", "numeric");
          if (v === undefined) return;
          const n = parseInt(v, 10);
          p.onChange({ ...p.ex, rest: Number.isFinite(n) && n >= 0 ? n : undefined });
        },
      },
      ...(Object.keys(TRACK_LABELS) as TrackType[])
        .filter((t) => t !== p.ex.track)
        .map((t) => ({
          title: `Учёт: ${TRACK_LABELS[t]}`,
          icon: "ruler",
          onClick: () => {
            const base = { ...p.ex, track: t, sets: [] as SetEntry[] };
            p.onChange({ ...base, sets: p.ex.sets.map((s) => ({ ...nextSet(base), done: s.done })) });
          },
        })),
      {
        title: p.ex.note ? "Изменить заметку" : "Заметка",
        icon: "sticky-note",
        onClick: async () => {
          const v = await prompt(app, "Заметка к упражнению", p.ex.note ?? "");
          if (v !== undefined) p.onChange({ ...p.ex, note: v.trim() || undefined });
        },
      },
      null,
      { title: "Удалить упражнение", icon: "trash-2", warning: true, onClick: p.onRemove },
    ];
    showMenu(e, entries);
  };

  const removeSet = async (i: number) => {
    // a ticked-off set is real history — ask before throwing it away
    if (p.ex.sets[i].done && !(await confirm(app, "Удалить подход?", `Подход ${i + 1} уже отмечен выполненным.`, "Удалить", true))) return;
    p.onChange({ ...p.ex, sets: p.ex.sets.filter((_, j) => j !== i) });
  };

  const setMenu = (e: MouseEvent, i: number) =>
    showMenu(e, [
      { title: "Дублировать подход", icon: "copy", onClick: () => p.onChange({ ...p.ex, sets: [...p.ex.sets.slice(0, i + 1), { ...p.ex.sets[i], done: false }, ...p.ex.sets.slice(i + 1)] }) },
      { title: "Удалить подход", icon: "trash-2", warning: true, onClick: () => void removeSet(i) },
    ]);

  return (
    <div class={`tt-card tt-exercise ${p.expanded ? "is-expanded" : ""}`}>
      <div class="tt-exercise-head" onClick={p.onToggle}>
        <Icon name={p.expanded ? "chevron-up" : "chevron-down"} />
        <ExThumb exercise={info} onInfo={openInfo} />
        <div class="tt-exercise-titles">
          <div class="tt-exercise-name">{exerciseTitle(p.ex, info)}</div>
          <div class="tt-exercise-sub">{subtitle}</div>
        </div>
        <IconButton icon="more-vertical" label="Меню" onClick={menu} />
      </div>
      {p.expanded && (
        <div class="tt-sets">
          {p.ex.note && <div class="tt-note">{p.ex.note}</div>}
          {p.previous && <div class="tt-prev">Прошлый раз: {p.previous}</div>}
          {p.ex.sets.map((s, i) => (
            <div class={`tt-set ${s.done ? "is-done" : ""} ${p.cursor === i ? "is-current" : ""}`} key={i}>
              {p.mode === "active" && (
                <button class="tt-check" aria-label={s.done ? "Снять отметку" : "Отметить подход"} onClick={() => p.onToggleDone?.(i)}>
                  {s.done ? <Icon name="check" /> : null}
                </button>
              )}
              <button class="tt-set-num" onClick={(e) => setMenu(e, i)}>
                {i + 1}
              </button>
              <SetFields set={s} track={p.ex.track} onChange={(ns) => setSet(i, ns)} />
              <button class="tt-set-del" aria-label={`Удалить подход ${i + 1}`} onClick={() => void removeSet(i)}>
                <Icon name="x" size={18} />
              </button>
            </div>
          ))}
          <button class="tt-add-set" onClick={() => p.onChange({ ...p.ex, sets: [...p.ex.sets, nextSet(p.ex)] })}>
            <Icon name="plus" /> Добавить подход
          </button>
        </div>
      )}
    </div>
  );
}
