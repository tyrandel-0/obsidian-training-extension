import { test } from "node:test";
import assert from "node:assert/strict";
import * as jsyaml from "js-yaml";
import {
  e1rm,
  exerciseHistory,
  fmtClock,
  initials,
  lastPerformance,
  matchesQuery,
  mergeOverride,
  nextSet,
  parseClock,
  parseExerciseNote,
  parseRoutine,
  parseWorkout,
  pluralRu,
  serializeExerciseNote,
  serializeRoutine,
  serializeWorkout,
  setsSummary,
  weeklyBuckets,
  workoutFromRoutine,
  workoutVolume,
} from "../src/format.ts";
import type { Exercise, Routine, Workout } from "../src/types.ts";

const yaml = { parse: (s: string) => jsyaml.load(s), stringify: (o: unknown) => jsyaml.dump(o) };

const workout: Workout = {
  name: "Full Body 1",
  routine: "Full Body 1",
  start: "2026-09-27T19:13:00",
  end: "2026-09-27T20:05:30",
  status: "done",
  exercises: [
    { id: "Dumbbell_Bench_Press", name: "Жим лёжа", track: "weight_reps", rest: 90, sets: [{ kg: 40, reps: 20, done: true }, { kg: 40, reps: 18, done: true }] },
    { id: "Plank", name: "Планка", track: "time", sets: [{ sec: 60, done: true }] },
  ],
};

test("workout round-trips through markdown", () => {
  const md = serializeWorkout(workout, yaml);
  assert.match(md, /^---\n/);
  assert.match(md, /volume_kg: 1520/);
  assert.match(md, /routine: '\[\[Full Body 1\]\]'/);
  assert.match(md, /```training-workout\n/);
  const back = parseWorkout(md, yaml);
  assert.deepEqual(back, workout);
});

test("hand-edited workout with loose values still parses", () => {
  const md = "```training-workout\nname: X\nstart: 2026-01-01T10:00:00\nexercises:\n  - id: a\n    sets:\n      - {kg: '42,5', reps: 8, done: true}\n      - {}\n  - name: no id\n```\n";
  const w = parseWorkout(md, yaml)!;
  assert.equal(w.status, "done");
  assert.equal(w.exercises.length, 1);
  assert.deepEqual(w.exercises[0].sets, [{ kg: 42.5, reps: 8, done: true }, {}]);
  assert.equal(w.exercises[0].track, "weight_reps");
});

test("routine round-trips and drops done flags", () => {
  const r: Routine = { name: "Full Body 1", color: "#f5793b", exercises: [{ ...workout.exercises[0] }] };
  const back = parseRoutine(serializeRoutine(r, yaml), "Full Body 1", yaml)!;
  assert.equal(back.color, "#f5793b");
  assert.deepEqual(back.exercises[0].sets, [{ kg: 40, reps: 20 }, { kg: 40, reps: 18 }]);
});

test("workoutFromRoutine copies values, nothing done", () => {
  const r: Routine = { name: "R", exercises: [{ id: "a", name: "A", track: "reps", sets: [{ reps: 10, done: true }] }] };
  const w = workoutFromRoutine(r, "2026-01-01T00:00:00");
  assert.equal(w.status, "in-progress");
  assert.equal(w.routine, "R");
  assert.deepEqual(w.exercises[0].sets, [{ reps: 10 }]);
});

test("exercise note: custom and override", () => {
  const note = "---\nname: Жим лёжа · гантели\nmuscles: [chest]\nequipment: dumbbell\nimages: ['[[bench.gif]]']\n---\n1. Лечь на скамью\n2. Выжать\n";
  const p = parseExerciseNote(note, "Жим", yaml);
  assert.equal(p.exercise.id, "custom/Жим");
  assert.deepEqual(p.exercise.instructions, ["Лечь на скамью", "Выжать"]);
  assert.equal(p.exercise.track, "weight_reps");

  const base: Exercise = {
    id: "Dumbbell_Bench_Press", name: "Dumbbell Bench Press", primaryMuscles: ["chest"], secondaryMuscles: ["triceps"],
    instructions: ["Lie down"], images: ["Dumbbell_Bench_Press/0.jpg"], track: "weight_reps", source: "library",
  };
  const over = parseExerciseNote("---\nid: Dumbbell_Bench_Press\nname: Жим гантелей\n---\n", "x", yaml);
  const merged = mergeOverride(base, over);
  assert.equal(merged.name, "Жим гантелей");
  assert.deepEqual(merged.images, base.images);
  assert.deepEqual(merged.instructions, base.instructions);
  assert.equal(merged.source, "library");

  const again = parseExerciseNote(serializeExerciseNote({ ...merged, file: "x" }, yaml, true), "x", yaml);
  assert.equal(again.exercise.id, "Dumbbell_Bench_Press");
  assert.deepEqual(again.exercise.images, base.images);
});

test("stats", () => {
  assert.equal(workoutVolume(workout), 40 * 20 + 40 * 18);
  assert.equal(Math.round(e1rm(100, 5)), 117);
  assert.equal(e1rm(100, 1), 100);
  const other: Workout = { ...workout, start: "2026-09-20T10:00:00", exercises: [{ ...workout.exercises[0], sets: [{ kg: 35, reps: 20, done: true }] }] };
  const prev = lastPerformance([other, workout], "Dumbbell_Bench_Press", workout.start);
  assert.equal(prev?.workout.start, other.start);
  const hist = exerciseHistory([workout, other], "Dumbbell_Bench_Press");
  assert.deepEqual(hist.map((h) => h.bestKg), [35, 40]);
  const weeks = weeklyBuckets([workout, other], 3, new Date("2026-09-28T12:00:00"));
  // 2026-09-28 is a Monday: Sep 27 falls in the previous week, Sep 20 two weeks back
  assert.deepEqual(weeks.map((w) => w.workouts), [1, 1, 0]);
});

test("formatting helpers", () => {
  assert.equal(fmtClock(75), "01:15");
  assert.equal(fmtClock(3725), "1:02:05");
  assert.equal(parseClock("1:30"), 90);
  assert.equal(parseClock("90"), 90);
  assert.equal(parseClock("abc"), undefined);
  assert.equal(setsSummary(workout.exercises[0]), "2 × 18–20");
  assert.equal(setsSummary({ id: "p", name: "p", track: "time", sets: [{ sec: 30 }, { sec: 30 }, { sec: 30 }] }), "3 × 00:30");
  assert.equal(initials("Full Body 2"), "FB");
  assert.equal(pluralRu(21, "раз", "раза", "раз"), "раз");
  assert.equal(pluralRu(3, "подход", "подхода", "подходов"), "подхода");
  assert.deepEqual(nextSet({ id: "x", name: "x", track: "time", sets: [] }), { sec: 60 });
});

test("search matches russian and english, ё-insensitive", () => {
  const ex: Exercise = { id: "a", name: "Жим лёжа", nameEn: "Bench Press", equipment: "barbell", primaryMuscles: ["chest"], secondaryMuscles: [], instructions: [], images: [], track: "weight_reps", source: "library" };
  assert.ok(matchesQuery(ex, "жим леж"));
  assert.ok(matchesQuery(ex, "bench"));
  assert.ok(matchesQuery(ex, "грудь штанга"));
  assert.ok(!matchesQuery(ex, "присед"));
});
