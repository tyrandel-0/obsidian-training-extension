import { Notice } from "obsidian";
import type { ComponentChildren } from "preact";
import { useMemo, useState } from "preact/hooks";
import { equipmentLabel, matchesQuery, MUSCLES_RU, muscleLabel } from "../format";
import type { Exercise } from "../types";
import { BigButton, Chips, Empty, ExThumb, Icon, Screen, TopBar } from "./components";
import { useCtx, useStore } from "./context";

const PAGE = 50;

const MUSCLE_OPTIONS = Object.entries(MUSCLES_RU)
  .map(([value, label]) => ({ value, label }))
  .sort((a, b) => a.label.localeCompare(b.label, "ru"));

type SourceFilter = "all" | "mine" | "used";

export function LibraryBanner() {
  const store = useStore();
  const [loading, setLoading] = useState(false);
  if (store.libraryLoaded) return null;
  const load = async () => {
    setLoading(true);
    try {
      const n = await store.importLibrary();
      new Notice(`Загружено упражнений: ${n}`);
    } catch (e) {
      store.notifyError(e, "Не удалось загрузить базу");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div class="tt-card tt-banner">
      <div class="tt-banner-title">База упражнений не загружена</div>
      <div class="tt-muted">
        ~870 упражнений с картинками и техникой из открытой базы free-exercise-db (общественное достояние). Названия переведены на русский. Картинки
        скачиваются по мере просмотра и сохраняются в хранилище.
      </div>
      <BigButton onClick={load} disabled={loading} icon="download">
        {loading ? "Загружаю…" : "Загрузить базу (1 МБ)"}
      </BigButton>
    </div>
  );
}

function ExerciseList(props: { onSelect: (ex: Exercise) => void; selected?: Set<string>; header?: ComponentChildren }) {
  const store = useStore();
  const { nav } = useCtx();
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState<string | undefined>();
  const [source, setSource] = useState<SourceFilter>("all");
  const [limit, setLimit] = useState(PAGE);

  const usedIds = useMemo(() => {
    const count = new Map<string, number>();
    for (const w of store.workouts) for (const e of w.exercises) count.set(e.id, (count.get(e.id) ?? 0) + 1);
    return count;
  }, [store.version]);

  const results = useMemo(() => {
    let list = store.exerciseList.filter((e) => matchesQuery(e, query) && (!muscle || e.primaryMuscles.includes(muscle)));
    if (source === "mine") list = list.filter((e) => e.source === "custom" || e.file);
    if (source === "used") list = list.filter((e) => usedIds.has(e.id)).sort((a, b) => (usedIds.get(b.id) ?? 0) - (usedIds.get(a.id) ?? 0));
    return list;
  }, [store.version, query, muscle, source]);

  return (
    <>
      <div class="tt-search">
        <Icon name="search" />
        <input
          type="search"
          placeholder="Поиск: жим, присед, гантели, грудь…"
          value={query}
          onInput={(e) => {
            setQuery((e.currentTarget as HTMLInputElement).value);
            setLimit(PAGE);
          }}
        />
      </div>
      <Chips
        options={[
          { value: "used" as SourceFilter, label: "Мои частые" },
          { value: "mine" as SourceFilter, label: "Свои" },
        ]}
        value={source === "all" ? undefined : source}
        onChange={(v) => setSource(v ?? "all")}
      />
      <Chips options={MUSCLE_OPTIONS} value={muscle} onChange={setMuscle} />
      <div class="tt-scroll">
        {props.header}
        {results.length === 0 && store.exerciseList.length > 0 && (
          <Empty icon="search-x" title="Ничего не найдено">
            <BigButton kind="outline" icon="plus" onClick={() => nav.push({ kind: "exercise-form", exercise: blankExercise(query) })}>
              Создать «{query || "своё упражнение"}»
            </BigButton>
          </Empty>
        )}
        {results.slice(0, limit).map((ex) => (
          <div class={`tt-card tt-row ${props.selected?.has(ex.id) ? "is-selected" : ""}`} key={ex.id} onClick={() => props.onSelect(ex)}>
            <ExThumb exercise={ex} onInfo={() => nav.push({ kind: "exercise", id: ex.id })} />
            <div class="tt-row-text">
              <div class="tt-row-title">{ex.name}</div>
              <div class="tt-row-sub">
                {[ex.primaryMuscles.map(muscleLabel).join(", "), equipmentLabel(ex.equipment)].filter(Boolean).join(" · ")}
                {ex.source === "custom" && <span class="tt-badge">своё</span>}
              </div>
            </div>
            {props.selected && <div class={`tt-check ${props.selected.has(ex.id) ? "is-on" : ""}`}>{props.selected.has(ex.id) && <Icon name="check" />}</div>}
          </div>
        ))}
        {results.length > limit && (
          <button class="tt-card tt-add-exercises" onClick={() => setLimit(limit + PAGE)}>
            Показать ещё ({results.length - limit})
          </button>
        )}
        <div class="tt-bottom-spacer" />
      </div>
    </>
  );
}

export function blankExercise(name = ""): Exercise {
  return { id: "", name, primaryMuscles: [], secondaryMuscles: [], instructions: [], images: [], track: "weight_reps", source: "custom" };
}

export function ExercisesTab() {
  const { nav } = useCtx();
  return (
    <Screen>
      <div class="tt-page-title">
        Упражнения
        <button class="tt-title-action" onClick={() => nav.push({ kind: "exercise-form", exercise: blankExercise() })}>
          <Icon name="plus" /> Своё
        </button>
      </div>
      <ExerciseList onSelect={(ex) => nav.push({ kind: "exercise", id: ex.id })} header={<LibraryBanner />} />
    </Screen>
  );
}

export function ExercisePicker(props: { title: string; multi: boolean; onPick: (ids: string[]) => void }) {
  const { nav } = useCtx();
  const [selected, setSelected] = useState<string[]>([]);
  const done = (ids: string[]) => {
    nav.pop();
    if (ids.length) props.onPick(ids);
  };
  return (
    <Screen>
      <TopBar
        onBack={nav.pop}
        title={props.title}
        right={
          <button class="tt-title-action" onClick={() => nav.push({ kind: "exercise-form", exercise: blankExercise() })}>
            <Icon name="plus" /> Своё
          </button>
        }
      />
      <ExerciseList
        header={<LibraryBanner />}
        selected={props.multi ? new Set(selected) : undefined}
        onSelect={(ex) => {
          if (!props.multi) return done([ex.id]);
          setSelected((s) => (s.includes(ex.id) ? s.filter((x) => x !== ex.id) : [...s, ex.id]));
        }}
      />
      {props.multi && selected.length > 0 && (
        <div class="tt-bottom-bar">
          <BigButton onClick={() => done(selected)}>Добавить ({selected.length})</BigButton>
        </div>
      )}
    </Screen>
  );
}
