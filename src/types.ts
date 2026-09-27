/** How a set of an exercise is measured. */
export type TrackType = "weight_reps" | "reps" | "time" | "distance_time";

export interface Exercise {
  /** Stable id. Library ids look like "Barbell_Squat", custom ones "custom/<name>". */
  id: string;
  /** Display name (already localized / overridden). */
  name: string;
  /** Original English name from the library, used for search. */
  nameEn?: string;
  category?: string;
  equipment?: string;
  level?: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  /** Image references: library-relative paths ("Air_Bike/0.jpg"), vault paths or http(s) URLs. */
  images: string[];
  track: TrackType;
  source: "library" | "custom";
  /** Vault path of the markdown file that defines/overrides this exercise. */
  file?: string;
}

export interface SetEntry {
  kg?: number;
  reps?: number;
  /** Duration in seconds. */
  sec?: number;
  km?: number;
  done?: boolean;
}

export interface WorkoutExercise {
  id: string;
  /** Name snapshot so history stays readable even if the exercise disappears. */
  name: string;
  track: TrackType;
  /** Rest between sets in seconds. */
  rest?: number;
  note?: string;
  sets: SetEntry[];
}

export interface Routine {
  name: string;
  color?: string;
  exercises: WorkoutExercise[];
  file?: string;
}

export interface Workout {
  name: string;
  routine?: string;
  /** ISO timestamp. */
  start: string;
  /** ISO timestamp, absent while in progress. */
  end?: string;
  /** Duration in seconds; when absent it is derived from start/end. */
  duration?: number;
  status: "in-progress" | "done";
  exercises: WorkoutExercise[];
  note?: string;
  file?: string;
}

export interface Settings {
  rootFolder: string;
  defaultRest: number;
  restTimer: boolean;
  restSound: boolean;
  weightStep: number;
  useRussianNames: boolean;
  libraryUrl: string;
  libraryImageBase: string;
}

export const DEFAULT_SETTINGS: Settings = {
  rootFolder: "Training",
  defaultRest: 90,
  restTimer: true,
  restSound: true,
  weightStep: 2.5,
  useRussianNames: true,
  libraryUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json",
  libraryImageBase: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/",
};
