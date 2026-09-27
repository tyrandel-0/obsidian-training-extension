import { requestUrl } from "obsidian";
import { useState } from "preact/hooks";
import {
  categoryLabel,
  EQUIPMENT_RU,
  equipmentLabel,
  exerciseHistory,
  fmtClock,
  fmtKg,
  fmtNum,
  fmtSet,
  MUSCLES_RU,
  muscleLabel,
  TRACK_LABELS,
} from "../format";
import type { Exercise, TrackType } from "../types";
import { BigButton, Empty, ExImage, Icon, IconButton, Screen, Stat, TopBar } from "./components";
import { LineChart } from "./Charts";
import { useCtx, useStore } from "./context";
import { confirm, pickVaultImage, prompt, showMenu } from "./dialogs";

const shortDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

export function ExerciseInfo({ id }: { id: string }) {
  const store = useStore();
  const { app, nav, openFile } = useCtx();
  const ex = store.getExercise(id);
  const history = exerciseHistory(store.workouts, id);
  const snapshotName = store.workouts.flatMap((w) => w.exercises).find((e) => e.id === id)?.name;

  if (!ex) {
    return (
      <Screen>
        <TopBar onBack={nav.pop} title={snapshotName ?? "Упражнение"} />
        <Empty icon="help-circle" title="Упражнение не найдено" text="Оно есть в истории, но не в базе. Загрузи базу или создай своё с таким же id." />
      </Screen>
    );
  }

  const weighted = ex.track === "weight_reps";
  const timed = ex.track === "time" || ex.track === "distance_time";
  const metric = (p: (typeof history)[number]) => (weighted ? p.bestE1rm : timed ? p.bestSec : p.bestReps);
  const chart = history.slice(-30).map((p) => ({
    label: shortDate(p.date),
    value: metric(p),
    tip: `${shortDate(p.date)} · ${weighted ? `1ПМ ≈ ${fmtNum(Math.round(p.bestE1rm * 10) / 10)} кг (макс. вес ${fmtNum(p.bestKg)} кг)` : timed ? fmtClock(p.bestSec) : `${p.bestReps} повт.`}`,
  }));

  const recentSessions = store.workouts
    .filter((w) => w.status === "done" && w.exercises.some((e) => e.id === id))
    .sort((a, b) => b.start.localeCompare(a.start))
    .slice(0, 10);

  const menu = (e: MouseEvent) =>
    showMenu(e, [
      { title: ex.source === "library" && !ex.file ? "Переименовать / изменить" : "Изменить", icon: "pencil", onClick: () => nav.push({ kind: "exercise-form", exercise: ex }) },
      ...(ex.file ? [{ title: "Открыть заметку", icon: "file-text", onClick: () => openFile(ex.file!) }] : []),
      ...(ex.file
        ? [
            null,
            {
              title: ex.source === "library" ? "Сбросить изменения" : "Удалить упражнение",
              icon: "trash-2",
              warning: true,
              onClick: async () => {
                if (!(await confirm(app, "Удалить заметку упражнения?", "История тренировок не пострадает.", "Удалить", true))) return;
                await store.deleteExerciseNote(ex);
                if (ex.source === "custom") nav.pop();
              },
            },
          ]
        : []),
    ]);

  return (
    <Screen>
      <TopBar onBack={nav.pop} title="Упражнение" right={<IconButton icon="more-vertical" label="Меню" onClick={menu} />} />
      <div class="tt-scroll">
        <ExImage exercise={ex} animate class="tt-hero-img" />
        <div class="tt-info-title">{ex.name}</div>
        {ex.nameEn && ex.nameEn !== ex.name && <div class="tt-muted">{ex.nameEn}</div>}
        <div class="tt-tags">
          {ex.primaryMuscles.map((m) => (
            <span class="tt-tag is-primary">{muscleLabel(m)}</span>
          ))}
          {ex.secondaryMuscles.map((m) => (
            <span class="tt-tag">{muscleLabel(m)}</span>
          ))}
          {ex.equipment && <span class="tt-tag is-outline">{equipmentLabel(ex.equipment)}</span>}
          {ex.category && <span class="tt-tag is-outline">{categoryLabel(ex.category)}</span>}
        </div>

        {history.length > 0 && (
          <>
            <div class="tt-section">Рекорды</div>
            <div class="tt-stats">
              {weighted && <Stat label="макс. вес" value={fmtNum(Math.max(...history.map((p) => p.bestKg)))} unit="кг" />}
              {weighted && <Stat label="расчётный 1ПМ" value={fmtNum(Math.round(Math.max(...history.map((p) => p.bestE1rm))))} unit="кг" />}
              {!timed && <Stat label="макс. повторов" value={String(Math.max(...history.map((p) => p.bestReps)))} />}
              {timed && <Stat label="лучшее время" value={fmtClock(Math.max(...history.map((p) => p.bestSec)))} />}
              <Stat label="тренировок" value={String(history.length)} />
            </div>
            <div class="tt-section">{weighted ? "Прогресс: расчётный 1ПМ, кг" : timed ? "Прогресс: лучшее время" : "Прогресс: макс. повторов"}</div>
            <div class="tt-card tt-pad">
              <LineChart data={chart} />
            </div>
          </>
        )}

        {ex.instructions.length > 0 && (
          <>
            <div class="tt-section">Техника</div>
            <ol class="tt-instructions">
              {ex.instructions.map((l) => (
                <li>{l}</li>
              ))}
            </ol>
          </>
        )}

        {recentSessions.length > 0 && (
          <>
            <div class="tt-section">История</div>
            {recentSessions.map((w) => {
              const e = w.exercises.find((x) => x.id === id)!;
              return (
                <div class="tt-card tt-row" onClick={() => nav.push({ kind: "history", file: w.file! })}>
                  <div class="tt-row-text">
                    <div class="tt-row-title">
                      {new Date(w.start).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
                    </div>
                    <div class="tt-row-sub">{e.sets.filter((s) => s.done).map((s) => fmtSet(s, e.track)).join(", ")}</div>
                  </div>
                </div>
              );
            })}
          </>
        )}
        <div class="tt-bottom-spacer" />
      </div>
    </Screen>
  );
}

// ---------------------------------------------------------------------------

function MultiChips({ options, value, onChange }: { options: Record<string, string>; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div class="tt-chips is-wrap">
      {Object.entries(options).map(([k, label]) => (
        <button class={`tt-chip ${value.includes(k) ? "is-active" : ""}`} onClick={() => onChange(value.includes(k) ? value.filter((x) => x !== k) : [...value, k])}>
          {label}
        </button>
      ))}
    </div>
  );
}

function ImageRef({ refStr, file, onRemove }: { refStr: string; file?: string; onRemove: () => void }) {
  const fake: Exercise = { id: "", name: "", primaryMuscles: [], secondaryMuscles: [], instructions: [], images: [refStr], track: "reps", source: "custom", file };
  return (
    <div class="tt-image-ref">
      <ExImage exercise={fake} />
      <button class="tt-image-remove" aria-label="Убрать картинку" onClick={onRemove}>
        <Icon name="x" />
      </button>
    </div>
  );
}

export function ExerciseForm({ exercise }: { exercise: Exercise }) {
  const store = useStore();
  const { app, nav } = useCtx();
  const [ex, setEx] = useState<Exercise>(exercise);
  const [instructions, setInstructions] = useState(exercise.instructions.join("\n"));
  const [busy, setBusy] = useState(false);
  const isNew = !exercise.id;
  const isLibrary = exercise.source === "library";

  const addFromVault = async () => {
    const f = await pickVaultImage(app);
    if (f) setEx((e) => ({ ...e, images: [...e.images, `[[${f.path}]]`] }));
  };
  const addFromUrl = async () => {
    const url = await prompt(app, "Ссылка на картинку или GIF", "", "https://…/exercise.gif", "url");
    if (!url?.trim()) return;
    setBusy(true);
    try {
      const link = await store.saveImageFromUrl(url.trim(), async (u) => (await requestUrl({ url: u })).arrayBuffer);
      setEx((e) => ({ ...e, images: [...e.images, link] }));
    } catch (e) {
      store.notifyError(e, "Не удалось скачать картинку");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!ex.name.trim()) return;
    setBusy(true);
    try {
      const saved = await store.saveExercise({
        ...ex,
        name: ex.name.trim(),
        instructions: instructions
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean),
      });
      nav.pop();
      if (isNew) nav.push({ kind: "exercise", id: saved.id });
    } catch (e) {
      store.notifyError(e, "Не удалось сохранить упражнение");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <TopBar onBack={nav.pop} title={isNew ? "Новое упражнение" : isLibrary ? "Изменить упражнение" : "Своё упражнение"} />
      <div class="tt-scroll tt-form">
        {isLibrary && <div class="tt-muted">Изменения сохранятся отдельной заметкой в папке Exercises и перекроют данные из базы.</div>}
        <label class="tt-field">
          <span>Название</span>
          <input type="text" value={ex.name} placeholder="Жим лёжа · гантели" onInput={(e) => setEx({ ...ex, name: (e.currentTarget as HTMLInputElement).value })} />
        </label>
        <label class="tt-field">
          <span>Как считать</span>
          <select value={ex.track} onChange={(e) => setEx({ ...ex, track: (e.currentTarget as HTMLSelectElement).value as TrackType })}>
            {Object.entries(TRACK_LABELS).map(([k, l]) => (
              <option value={k}>{l}</option>
            ))}
          </select>
        </label>
        <label class="tt-field">
          <span>Оборудование</span>
          <select value={ex.equipment ?? ""} onChange={(e) => setEx({ ...ex, equipment: (e.currentTarget as HTMLSelectElement).value || undefined })}>
            <option value="">—</option>
            {Object.entries(EQUIPMENT_RU).map(([k, l]) => (
              <option value={k}>{l}</option>
            ))}
          </select>
        </label>
        <div class="tt-field">
          <span>Основные мышцы</span>
          <MultiChips options={MUSCLES_RU} value={ex.primaryMuscles} onChange={(v) => setEx({ ...ex, primaryMuscles: v })} />
        </div>
        <div class="tt-field">
          <span>Картинки / GIF</span>
          <div class="tt-image-refs">
            {ex.images.map((r, i) => (
              <ImageRef refStr={r} file={ex.file} onRemove={() => setEx({ ...ex, images: ex.images.filter((_, j) => j !== i) })} />
            ))}
          </div>
          <div class="tt-row-buttons">
            <BigButton kind="outline" icon="image" onClick={addFromVault} disabled={busy}>
              Из хранилища
            </BigButton>
            <BigButton kind="outline" icon="link" onClick={addFromUrl} disabled={busy}>
              По ссылке
            </BigButton>
          </div>
        </div>
        <label class="tt-field">
          <span>Техника (по шагу на строку)</span>
          <textarea rows={5} value={instructions} onInput={(e) => setInstructions((e.currentTarget as HTMLTextAreaElement).value)} />
        </label>
        <div class="tt-bottom-spacer" />
      </div>
      <div class="tt-bottom-bar">
        <BigButton onClick={save} disabled={busy || !ex.name.trim()}>
          Сохранить
        </BigButton>
      </div>
    </Screen>
  );
}

