// Pure helpers: labels, formatting, stats and (de)serialization of vault notes.
// Kept free of `obsidian` imports so they can be unit-tested in plain Node.
import type { Exercise, Routine, SetEntry, TrackType, Workout, WorkoutExercise } from "./types";

export interface Yaml {
  parse(src: string): unknown;
  stringify(obj: unknown): string;
}

export const WORKOUT_BLOCK = "training-workout";
export const ROUTINE_BLOCK = "training-routine";

export const MUSCLES_RU: Record<string, string> = {
  abdominals: "пресс",
  abductors: "отводящие бедра",
  adductors: "приводящие бедра",
  biceps: "бицепс",
  calves: "икры",
  chest: "грудь",
  forearms: "предплечья",
  glutes: "ягодицы",
  hamstrings: "бицепс бедра",
  lats: "широчайшие",
  "lower back": "поясница",
  "middle back": "середина спины",
  neck: "шея",
  quadriceps: "квадрицепс",
  shoulders: "плечи",
  traps: "трапеции",
  triceps: "трицепс",
};

export const EQUIPMENT_RU: Record<string, string> = {
  "body only": "свой вес",
  machine: "тренажёр",
  other: "другое",
  "foam roll": "ролик",
  kettlebells: "гиря",
  dumbbell: "гантели",
  cable: "блок",
  barbell: "штанга",
  bands: "резинки",
  "medicine ball": "медбол",
  "exercise ball": "фитбол",
  "e-z curl bar": "EZ-гриф",
};

export const CATEGORY_RU: Record<string, string> = {
  strength: "силовые",
  stretching: "растяжка",
  plyometrics: "плиометрика",
  strongman: "стронгмен",
  powerlifting: "пауэрлифтинг",
  cardio: "кардио",
  "olympic weightlifting": "тяжёлая атлетика",
};

export const TRACK_LABELS: Record<TrackType, string> = {
  weight_reps: "Вес × повторы",
  reps: "Только повторы",
  time: "Время",
  distance_time: "Дистанция + время",
};

export const ROUTINE_COLORS = ["#f5793b", "#e05a67", "#3a4fe0", "#2e9e6b", "#9b51e0", "#e0a63a", "#1f9bd1"];

export const muscleLabel = (m: string) => MUSCLES_RU[m] ?? m;
export const equipmentLabel = (e?: string) => (e ? EQUIPMENT_RU[e] ?? e : "");
export const categoryLabel = (c?: string) => (c ? CATEGORY_RU[c] ?? c : "");

export function defaultTrack(category?: string, equipment?: string | null): TrackType {
  if (category === "cardio") return "distance_time";
  if (category === "stretching") return "time";
  if (equipment === "body only") return "reps";
  return "weight_reps";
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => /[\p{L}]/u.test(w));
  const letters = words.slice(0, 2).map((w) => w.match(/\p{L}/u)?.[0] ?? "");
  return letters.join("").toUpperCase() || "?";
}

export function pad2(n: number): string {
  return String(Math.floor(n)).padStart(2, "0");
}

/** 75 -> "01:15", 3725 -> "1:02:05" */
export function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(sec)}` : `${pad2(m)}:${pad2(sec)}`;
}

/** Human duration: 2940 -> "49 мин", 3900 -> "1 ч 5 мин". */
export function fmtDuration(totalSec: number): string {
  const m = Math.round(Math.max(0, totalSec) / 60);
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} ч ${m % 60} мин` : `${h} ч`;
}

/** "1:30" / "90" / "1:02:05" -> seconds. Returns undefined for garbage. */
export function parseClock(text: string): number | undefined {
  const t = text.trim();
  if (!t) return undefined;
  if (!/^\d+(:\d{1,2}){0,2}$/.test(t)) return undefined;
  return t.split(":").map(Number).reduce((acc, n) => acc * 60 + n, 0);
}

export function parseNum(text: string): number | undefined {
  const t = text.trim().replace(",", ".");
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export function fmtNum(n: number | undefined): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "";
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export function fmtKg(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(n);
}

export function pluralRu(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** Short value of a single set, e.g. "40 кг × 12", "01:00", "12". */
export function fmtSet(set: SetEntry, track: TrackType): string {
  switch (track) {
    case "weight_reps":
      return `${fmtNum(set.kg) || "0"} кг × ${fmtNum(set.reps) || "0"}`;
    case "reps":
      return set.kg ? `+${fmtNum(set.kg)} кг × ${fmtNum(set.reps) || "0"}` : fmtNum(set.reps) || "0";
    case "time":
      return fmtClock(set.sec ?? 0);
    case "distance_time":
      return `${fmtNum(set.km) || "0"} км · ${fmtClock(set.sec ?? 0)}`;
  }
}

/** "3 × 20", "3 × 8–12", "3 × 00:30" — like the routine cards. */
export function setsSummary(ex: WorkoutExercise): string {
  const n = ex.sets.length;
  if (n === 0) return "0";
  if (ex.track === "time" || ex.track === "distance_time") {
    const secs = ex.sets.map((s) => s.sec ?? 0);
    const lo = Math.min(...secs);
    const hi = Math.max(...secs);
    return `${n} × ${lo === hi ? fmtClock(lo) : `${fmtClock(lo)}–${fmtClock(hi)}`}`;
  }
  const reps = ex.sets.map((s) => s.reps ?? 0);
  const lo = Math.min(...reps);
  const hi = Math.max(...reps);
  return `${n} × ${lo === hi ? lo : `${lo}–${hi}`}`;
}

export function setVolume(set: SetEntry, track: TrackType): number {
  if (track !== "weight_reps" && track !== "reps") return 0;
  return (set.kg ?? 0) * (set.reps ?? 0);
}

export function exerciseVolume(ex: WorkoutExercise, onlyDone = true): number {
  return ex.sets.filter((s) => !onlyDone || s.done).reduce((acc, s) => acc + setVolume(s, ex.track), 0);
}

export function workoutVolume(w: Workout): number {
  return w.exercises.reduce((acc, ex) => acc + exerciseVolume(ex), 0);
}

export function doneSets(w: Workout): number {
  return w.exercises.reduce((acc, ex) => acc + ex.sets.filter((s) => s.done).length, 0);
}

/** Epley estimated one-rep max. */
export function e1rm(kg: number, reps: number): number {
  if (!kg || !reps) return 0;
  return reps === 1 ? kg : kg * (1 + reps / 30);
}

export function workoutDuration(w: Workout, now = Date.now()): number {
  if (w.duration !== undefined) return w.duration;
  const start = Date.parse(w.start);
  const end = w.end ? Date.parse(w.end) : now;
  return Math.max(0, Math.round((end - start) / 1000));
}

/** Local ISO-like timestamp without timezone suffix: 2026-09-27T19:13:05 */
export function localIso(d = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|#^[\]]/g, "-").replace(/\s+/g, " ").trim() || "Без названия";
}

export function workoutFileName(w: Workout): string {
  const d = w.start.slice(0, 16).replace("T", " ").replace(":", "-");
  return `${d} ${safeFileName(w.name)}.md`;
}

// ---------------------------------------------------------------------------
// Serialization

function extractBlock(content: string, lang: string): string | undefined {
  const re = new RegExp("^```" + lang + "[^\\n]*\\n([\\s\\S]*?)^```", "m");
  return content.match(re)?.[1];
}

export function splitFrontmatter(content: string): { fm: string | undefined; body: string } {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: undefined, body: content };
  return { fm: m[1], body: content.slice(m[0].length) };
}

const TRACKS: TrackType[] = ["weight_reps", "reps", "time", "distance_time"];

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") return parseNum(v);
  return undefined;
}

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  return String(v);
}

function strList(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => x !== null && x !== undefined).map(String);
  if (typeof v === "string" && v.trim()) return v.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

function normalizeSet(raw: unknown): SetEntry {
  const r = (raw ?? {}) as Record<string, unknown>;
  const s: SetEntry = {};
  const kg = num(r.kg);
  const reps = num(r.reps);
  const sec = num(r.sec);
  const km = num(r.km);
  if (kg !== undefined) s.kg = kg;
  if (reps !== undefined) s.reps = reps;
  if (sec !== undefined) s.sec = sec;
  if (km !== undefined) s.km = km;
  if (r.done === true) s.done = true;
  return s;
}

function normalizeExercise(raw: unknown): WorkoutExercise | undefined {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = str(r.id);
  if (!id) return undefined;
  const track = TRACKS.includes(r.track as TrackType) ? (r.track as TrackType) : "weight_reps";
  const ex: WorkoutExercise = {
    id,
    name: str(r.name) ?? id,
    track,
    sets: Array.isArray(r.sets) ? r.sets.map(normalizeSet) : [],
  };
  const rest = num(r.rest);
  if (rest !== undefined) ex.rest = rest;
  if (r.note) ex.note = String(r.note);
  return ex;
}

function cleanSet(s: SetEntry, withDone: boolean): SetEntry {
  const out: SetEntry = {};
  if (s.kg !== undefined) out.kg = s.kg;
  if (s.reps !== undefined) out.reps = s.reps;
  if (s.sec !== undefined) out.sec = s.sec;
  if (s.km !== undefined) out.km = s.km;
  if (withDone && s.done) out.done = true;
  return out;
}

function cleanExercise(ex: WorkoutExercise, withDone: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = { id: ex.id, name: ex.name, track: ex.track };
  if (ex.rest !== undefined) out.rest = ex.rest;
  if (ex.note) out.note = ex.note;
  out.sets = ex.sets.map((s) => cleanSet(s, withDone));
  return out;
}

export function serializeWorkout(w: Workout, yaml: Yaml): string {
  const volume = Math.round(workoutVolume(w));
  const fm: Record<string, unknown> = {
    type: "training-workout",
    date: w.start.slice(0, 10),
    start: w.start,
    status: w.status,
  };
  if (w.routine) fm.routine = `[[${w.routine}]]`;
  if (w.status === "done") fm.duration_min = Math.round(workoutDuration(w) / 60);
  fm.volume_kg = volume;
  fm.sets = doneSets(w);
  fm.exercises = w.exercises.map((e) => e.name);

  const data: Record<string, unknown> = { name: w.name };
  if (w.routine) data.routine = w.routine;
  data.start = w.start;
  if (w.end) data.end = w.end;
  if (w.duration !== undefined) data.duration = w.duration;
  data.status = w.status;
  if (w.note) data.note = w.note;
  data.exercises = w.exercises.map((e) => cleanExercise(e, true));

  return `---\n${yaml.stringify(fm)}---\n\n\`\`\`${WORKOUT_BLOCK}\n${yaml.stringify(data)}\`\`\`\n`;
}

export function parseWorkout(content: string, yaml: Yaml): Workout | undefined {
  const block = extractBlock(content, WORKOUT_BLOCK);
  if (block === undefined) return undefined;
  const r = (yaml.parse(block) ?? {}) as Record<string, unknown>;
  const start = str(r.start);
  if (!start) return undefined;
  const w: Workout = {
    name: str(r.name) ?? "Тренировка",
    start,
    status: r.status === "in-progress" ? "in-progress" : "done",
    exercises: Array.isArray(r.exercises)
      ? r.exercises.map(normalizeExercise).filter((e): e is WorkoutExercise => !!e)
      : [],
  };
  if (r.routine) w.routine = String(r.routine);
  if (r.end) w.end = String(r.end);
  const duration = num(r.duration);
  if (duration !== undefined) w.duration = duration;
  if (r.note) w.note = String(r.note);
  return w;
}

export function serializeRoutine(r: Routine, yaml: Yaml): string {
  const fm: Record<string, unknown> = { type: "training-routine" };
  if (r.color) fm.color = r.color;
  fm.exercises = r.exercises.map((e) => e.name);
  const data = { exercises: r.exercises.map((e) => cleanExercise(e, false)) };
  return `---\n${yaml.stringify(fm)}---\n\n\`\`\`${ROUTINE_BLOCK}\n${yaml.stringify(data)}\`\`\`\n`;
}

export function parseRoutine(content: string, name: string, yaml: Yaml): Routine | undefined {
  const block = extractBlock(content, ROUTINE_BLOCK);
  if (block === undefined) return undefined;
  const r = (yaml.parse(block) ?? {}) as Record<string, unknown>;
  const { fm } = splitFrontmatter(content);
  const meta = fm ? ((yaml.parse(fm) ?? {}) as Record<string, unknown>) : {};
  return {
    name,
    color: str(meta.color),
    exercises: Array.isArray(r.exercises)
      ? r.exercises.map(normalizeExercise).filter((e): e is WorkoutExercise => !!e)
      : [],
  };
}

/**
 * Custom exercise note: everything in frontmatter, instructions in the body.
 *
 * ---
 * type: training-exercise
 * name: Жим лёжа · гантели
 * muscles: [chest]
 * equipment: dumbbell
 * track: weight_reps
 * images: ["[[bench.gif]]"]
 * ---
 * Лечь на скамью...
 */
export interface ParsedExerciseNote {
  exercise: Exercise;
  /** Which optional fields the note sets explicitly (matters when it overrides a library exercise). */
  has: { muscles: boolean; secondary: boolean; images: boolean; body: boolean; track: boolean };
}

export function parseExerciseNote(content: string, basename: string, yaml: Yaml): ParsedExerciseNote {
  const { fm, body } = splitFrontmatter(content);
  const m = fm ? ((yaml.parse(fm) ?? {}) as Record<string, unknown>) : {};
  const track = TRACKS.includes(m.track as TrackType) ? (m.track as TrackType) : undefined;
  const equipment = str(m.equipment);
  const category = str(m.category);
  const instructions = body
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
  const primaryMuscles = strList(m.muscles ?? m.primaryMuscles);
  const secondaryMuscles = strList(m.secondary ?? m.secondaryMuscles);
  const images = strList(m.images ?? m.image);
  return {
    exercise: {
      id: str(m.id) ?? `custom/${basename}`,
      name: str(m.name) ?? basename,
      category,
      equipment,
      primaryMuscles,
      secondaryMuscles,
      instructions,
      images,
      track: track ?? defaultTrack(category, equipment),
      source: "custom",
    },
    has: {
      muscles: primaryMuscles.length > 0,
      secondary: secondaryMuscles.length > 0,
      images: images.length > 0,
      body: instructions.length > 0,
      track: track !== undefined,
    },
  };
}

/** Merge a note that overrides a library exercise: only the fields the note actually sets win. */
export function mergeOverride(base: Exercise, parsed: ParsedExerciseNote): Exercise {
  const { exercise: o, has } = parsed;
  return {
    ...base,
    name: o.name || base.name,
    category: o.category ?? base.category,
    equipment: o.equipment ?? base.equipment,
    primaryMuscles: has.muscles ? o.primaryMuscles : base.primaryMuscles,
    secondaryMuscles: has.secondary ? o.secondaryMuscles : base.secondaryMuscles,
    instructions: has.body ? o.instructions : base.instructions,
    images: has.images ? o.images : base.images,
    track: has.track ? o.track : base.track,
    file: o.file,
  };
}

export function serializeExerciseNote(ex: Exercise, yaml: Yaml, isOverride: boolean): string {
  const fm: Record<string, unknown> = { type: "training-exercise" };
  if (isOverride) fm.id = ex.id;
  fm.name = ex.name;
  if (ex.category) fm.category = ex.category;
  if (ex.equipment) fm.equipment = ex.equipment;
  fm.muscles = ex.primaryMuscles;
  if (ex.secondaryMuscles.length) fm.secondary = ex.secondaryMuscles;
  fm.track = ex.track;
  fm.images = ex.images;
  const body = ex.instructions.map((l, i) => `${i + 1}. ${l}`).join("\n");
  return `---\n${yaml.stringify(fm)}---\n\n${body}\n`;
}

/** Lowercase, strip diacritics and "ё" so search is forgiving. */
export function normalizeSearch(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function matchesQuery(ex: Exercise, query: string): boolean {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = normalizeSearch(
    [ex.name, ex.nameEn ?? "", equipmentLabel(ex.equipment), ex.equipment ?? "", ...ex.primaryMuscles.map(muscleLabel), ...ex.primaryMuscles].join(" "),
  );
  return words.every((w) => hay.includes(w));
}

/** Previous performance of an exercise: sets from the most recent finished workout that contains it. */
export function lastPerformance(workouts: Workout[], exerciseId: string, excludeStart?: string): { workout: Workout; exercise: WorkoutExercise } | undefined {
  let best: { workout: Workout; exercise: WorkoutExercise } | undefined;
  for (const w of workouts) {
    if (w.status !== "done" || w.start === excludeStart) continue;
    const ex = w.exercises.find((e) => e.id === exerciseId && e.sets.some((s) => s.done));
    if (!ex) continue;
    if (!best || w.start > best.workout.start) best = { workout: w, exercise: ex };
  }
  return best;
}

export interface ExercisePoint {
  date: string;
  bestKg: number;
  bestE1rm: number;
  bestReps: number;
  bestSec: number;
  volume: number;
}

export function exerciseHistory(workouts: Workout[], exerciseId: string): ExercisePoint[] {
  const pts: ExercisePoint[] = [];
  for (const w of workouts) {
    if (w.status !== "done") continue;
    for (const ex of w.exercises) {
      if (ex.id !== exerciseId) continue;
      const done = ex.sets.filter((s) => s.done);
      if (!done.length) continue;
      pts.push({
        date: w.start,
        bestKg: Math.max(...done.map((s) => s.kg ?? 0)),
        bestE1rm: Math.max(...done.map((s) => e1rm(s.kg ?? 0, s.reps ?? 0))),
        bestReps: Math.max(...done.map((s) => s.reps ?? 0)),
        bestSec: Math.max(...done.map((s) => s.sec ?? 0)),
        volume: exerciseVolume(ex),
      });
    }
  }
  return pts.sort((a, b) => a.date.localeCompare(b.date));
}

/** Monday 00:00 (local) of the week containing `d`. */
export function weekStart(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

export interface WeekBucket {
  start: Date;
  workouts: number;
  volume: number;
  seconds: number;
}

export function weeklyBuckets(workouts: Workout[], weeks: number, now = new Date()): WeekBucket[] {
  const first = weekStart(now);
  first.setDate(first.getDate() - 7 * (weeks - 1));
  const buckets: WeekBucket[] = Array.from({ length: weeks }, (_, i) => {
    const s = new Date(first);
    s.setDate(first.getDate() + 7 * i);
    return { start: s, workouts: 0, volume: 0, seconds: 0 };
  });
  for (const w of workouts) {
    if (w.status !== "done") continue;
    const idx = Math.floor((weekStart(new Date(w.start)).getTime() - first.getTime()) / (7 * 864e5) + 0.5);
    if (idx < 0 || idx >= weeks) continue;
    buckets[idx].workouts++;
    buckets[idx].volume += workoutVolume(w);
    buckets[idx].seconds += workoutDuration(w);
  }
  return buckets;
}

/** Build a fresh workout from a routine: values copied, nothing done yet. */
export function workoutFromRoutine(r: Routine, start: string): Workout {
  return {
    name: r.name,
    routine: r.name,
    start,
    status: "in-progress",
    exercises: r.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => cleanSet(s, false)) })),
  };
}

/** New set for an exercise: repeats the last set's values. */
export function nextSet(ex: WorkoutExercise): SetEntry {
  const last = ex.sets[ex.sets.length - 1];
  if (last) return cleanSet(last, false);
  switch (ex.track) {
    case "weight_reps":
      return { kg: 0, reps: 10 };
    case "reps":
      return { reps: 10 };
    case "time":
      return { sec: 60 };
    case "distance_time":
      return { km: 1, sec: 600 };
  }
}

/** Routine sets updated with the values actually performed in a workout (for "update routine" on finish). */
export function routineFromWorkout(r: Routine, w: Workout): Routine {
  return {
    ...r,
    exercises: w.exercises.map((e) => ({
      ...e,
      sets: e.sets.map((s) => cleanSet(s, false)),
    })),
  };
}
