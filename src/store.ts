import { App, normalizePath, Notice, parseYaml, stringifyYaml, TAbstractFile, TFile, TFolder } from "obsidian";
import {
  localIso,
  mergeOverride,
  parseExerciseNote,
  parseRoutine,
  parseWorkout,
  routineFromWorkout,
  safeFileName,
  serializeExerciseNote,
  serializeRoutine,
  serializeWorkout,
  workoutFileName,
  workoutFromRoutine,
  type ParsedExerciseNote,
  type Yaml,
} from "./format";
import { downloadLibrary, ImageResolver, libraryToExercise, readLibrary, type LibraryEntry } from "./library";
import ruNames from "./data/ru-names.json";
import type { Exercise, Routine, Settings, Workout } from "./types";

export const yaml: Yaml = { parse: parseYaml, stringify: stringifyYaml };

type Listener = () => void;

/**
 * In-memory model of everything under the training folder, kept in sync with the vault.
 * The vault (synced by iCloud or anything else) is the database; this is just a cache.
 */
export class TrainingStore {
  library: LibraryEntry[] = [];
  libraryLoaded = false;
  exercises = new Map<string, Exercise>();
  exerciseList: Exercise[] = [];
  routines: Routine[] = [];
  workouts: Workout[] = [];
  active: Workout | undefined;
  images: ImageResolver;
  version = 0;
  /** Running rest countdown (wall-clock based, so it survives the app being backgrounded). */
  rest: { until: number; total: number } | undefined;

  private customNotes = new Map<string, ParsedExerciseNote>();
  private listeners = new Set<Listener>();
  private selfWrites = new Map<string, string>();
  private saveTimer: number | undefined;
  private reloadTimers = new Map<string, number>();

  constructor(private app: App, private settings: () => Settings) {
    this.images = new ImageResolver(app, settings);
  }

  // --- paths -------------------------------------------------------------

  get root(): string {
    return normalizePath(this.settings().rootFolder);
  }
  get workoutsDir(): string {
    return `${this.root}/Workouts`;
  }
  get routinesDir(): string {
    return `${this.root}/Routines`;
  }
  get exercisesDir(): string {
    return `${this.root}/Exercises`;
  }

  private under(path: string, dir: string): boolean {
    return path.startsWith(dir + "/") && path.endsWith(".md");
  }

  // --- subscription ------------------------------------------------------

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  // --- loading -----------------------------------------------------------

  async load(): Promise<void> {
    await this.flushActive();
    const lib = await readLibrary(this.app, this.settings());
    this.library = lib ?? [];
    this.libraryLoaded = !!lib;

    this.customNotes.clear();
    this.routines = [];
    this.workouts = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!file.path.startsWith(this.root + "/")) continue;
      await this.loadFile(file, false);
    }
    this.rebuildExercises();
    const inProgress = this.workouts.filter((w) => w.status === "in-progress").sort((a, b) => b.start.localeCompare(a.start));
    this.active = inProgress[0];
    this.emit();
  }

  async importLibrary(): Promise<number> {
    this.library = await downloadLibrary(this.app, this.settings());
    this.libraryLoaded = true;
    this.rebuildExercises();
    this.emit();
    return this.library.length;
  }

  rebuildExercises(): void {
    const s = this.settings();
    const map = new Map<string, Exercise>();
    for (const e of this.library) map.set(e.id, libraryToExercise(e, ruNames as Record<string, string>, s.useRussianNames));
    for (const [file, parsed] of this.customNotes) {
      const ex = { ...parsed.exercise, file };
      const base = map.get(ex.id);
      map.set(ex.id, base ? mergeOverride(base, { ...parsed, exercise: ex }) : ex);
    }
    this.exercises = map;
    this.exerciseList = [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }

  private async loadFile(file: TFile, rebuild = true): Promise<void> {
    const content = await this.app.vault.cachedRead(file);
    this.removeFile(file.path);
    try {
      if (this.under(file.path, this.workoutsDir)) {
        const w = parseWorkout(content, yaml);
        if (w) this.workouts.push({ ...w, file: file.path });
      } else if (this.under(file.path, this.routinesDir)) {
        const r = parseRoutine(content, file.basename, yaml);
        if (r) this.routines.push({ ...r, file: file.path });
        this.routines.sort((a, b) => a.name.localeCompare(b.name, "ru"));
      } else if (this.under(file.path, this.exercisesDir)) {
        this.customNotes.set(file.path, parseExerciseNote(content, file.basename, yaml));
        if (rebuild) this.rebuildExercises();
      }
    } catch (e) {
      console.warn("[training] cannot parse", file.path, e);
    }
  }

  private removeFile(path: string): boolean {
    const nW = this.workouts.length;
    const nR = this.routines.length;
    this.workouts = this.workouts.filter((w) => w.file !== path);
    this.routines = this.routines.filter((r) => r.file !== path);
    const hadNote = this.customNotes.delete(path);
    if (hadNote) this.rebuildExercises();
    return hadNote || nW !== this.workouts.length || nR !== this.routines.length;
  }

  /** Vault event handlers: pick up edits made by hand or arriving via sync. */
  onVaultChange = (f: TAbstractFile): void => {
    if (!(f instanceof TFile) || !f.path.startsWith(this.root + "/") || f.extension !== "md") return;
    window.clearTimeout(this.reloadTimers.get(f.path));
    this.reloadTimers.set(
      f.path,
      window.setTimeout(async () => {
        this.reloadTimers.delete(f.path);
        const current = this.app.vault.getAbstractFileByPath(f.path);
        if (!(current instanceof TFile)) return;
        const content = await this.app.vault.read(current);
        if (this.selfWrites.get(f.path) === content) return;
        if (this.active?.file === f.path) {
          // Someone edited the running workout by hand (or sync delivered it) — accept their version.
          const w = parseWorkout(content, yaml);
          if (w) this.active = w.status === "in-progress" ? { ...w, file: f.path } : undefined;
        }
        await this.loadFile(current);
        this.emit();
      }, 300),
    );
  };

  onVaultDelete = (f: TAbstractFile): void => {
    if (f instanceof TFolder) return;
    if (this.active?.file === f.path) this.active = undefined;
    if (this.removeFile(f.path)) this.emit();
  };

  onVaultRename = (f: TAbstractFile, oldPath: string): void => {
    if (this.active?.file === oldPath) this.active = { ...this.active, file: f.path };
    this.removeFile(oldPath);
    this.onVaultChange(f);
    this.emit();
  };

  // --- writing -----------------------------------------------------------

  private async ensureFolder(path: string): Promise<void> {
    const parts = path.split("/");
    let cur = "";
    for (const p of parts) {
      cur = cur ? `${cur}/${p}` : p;
      const existing = this.app.vault.getAbstractFileByPath(cur);
      if (!existing) await this.app.vault.createFolder(cur);
    }
  }

  private async write(path: string, content: string): Promise<TFile> {
    path = normalizePath(path);
    this.selfWrites.set(path, content);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
      return existing;
    }
    await this.ensureFolder(path.slice(0, path.lastIndexOf("/")));
    return this.app.vault.create(path, content);
  }

  private uniquePath(dir: string, base: string): string {
    let path = normalizePath(`${dir}/${base}.md`);
    for (let i = 2; this.app.vault.getAbstractFileByPath(path); i++) path = normalizePath(`${dir}/${base} ${i}.md`);
    return path;
  }

  // routines

  async saveRoutine(r: Routine): Promise<Routine> {
    const name = safeFileName(r.name);
    let path = r.file;
    const wanted = normalizePath(`${this.routinesDir}/${name}.md`);
    if (path && path !== wanted && !this.app.vault.getAbstractFileByPath(wanted)) {
      const f = this.app.vault.getAbstractFileByPath(path);
      if (f instanceof TFile) await this.app.fileManager.renameFile(f, wanted);
      path = wanted;
    }
    if (!path) path = this.uniquePath(this.routinesDir, name);
    const saved: Routine = { ...r, name: path.slice(path.lastIndexOf("/") + 1, -3), file: path };
    await this.write(path, serializeRoutine(saved, yaml));
    this.routines = [...this.routines.filter((x) => x.file !== path && x.file !== r.file), saved].sort((a, b) =>
      a.name.localeCompare(b.name, "ru"),
    );
    this.emit();
    return saved;
  }

  async deleteRoutine(r: Routine): Promise<void> {
    const f = r.file && this.app.vault.getAbstractFileByPath(r.file);
    if (f instanceof TFile) await this.app.fileManager.trashFile(f);
    this.routines = this.routines.filter((x) => x.file !== r.file);
    this.emit();
  }

  // workouts

  async startWorkout(routine?: Routine): Promise<Workout> {
    if (this.active) return this.active;
    const start = localIso();
    const w: Workout = routine
      ? workoutFromRoutine(routine, start)
      : { name: "Тренировка", start, status: "in-progress", exercises: [] };
    const path = this.uniquePath(`${this.workoutsDir}/${start.slice(0, 4)}`, workoutFileName(w).slice(0, -3));
    w.file = path;
    this.active = w;
    this.workouts.push(w);
    await this.write(path, serializeWorkout(w, yaml));
    this.emit();
    return w;
  }

  /** Apply a change to the running workout; persisted to the vault shortly after. */
  updateActive(fn: (w: Workout) => Workout): void {
    if (!this.active) return;
    const next = fn(this.active);
    this.active = next;
    this.workouts = this.workouts.map((w) => (w.file === next.file ? next : w));
    this.emit();
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.flushActive(), 800);
  }

  async flushActive(): Promise<void> {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    const w = this.active;
    if (w?.file) await this.write(w.file, serializeWorkout(w, yaml));
  }

  async finishActive(opts: { updateRoutine: boolean }): Promise<Workout | undefined> {
    const w = this.active;
    if (!w) return;
    window.clearTimeout(this.saveTimer);
    // Sets that were never ticked off are dropped; exercises left without sets too.
    const exercises = w.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) })).filter((e) => e.sets.length);
    const finished: Workout = { ...w, exercises, status: "done", end: localIso() };
    if (opts.updateRoutine && w.routine) {
      const r = this.routines.find((x) => x.name === w.routine);
      if (r) await this.saveRoutine(routineFromWorkout(r, w));
    }
    this.active = undefined;
    this.rest = undefined;
    if (finished.file) await this.write(finished.file, serializeWorkout(finished, yaml));
    this.workouts = this.workouts.map((x) => (x.file === finished.file ? finished : x));
    this.emit();
    return finished;
  }

  async discardActive(): Promise<void> {
    const w = this.active;
    if (!w) return;
    window.clearTimeout(this.saveTimer);
    this.active = undefined;
    this.rest = undefined;
    await this.deleteWorkout(w);
  }

  async saveWorkout(w: Workout): Promise<void> {
    if (!w.file) return;
    await this.write(w.file, serializeWorkout(w, yaml));
    this.workouts = this.workouts.map((x) => (x.file === w.file ? w : x));
    this.emit();
  }

  async deleteWorkout(w: Workout): Promise<void> {
    const f = w.file && this.app.vault.getAbstractFileByPath(w.file);
    if (f instanceof TFile) await this.app.fileManager.trashFile(f);
    this.workouts = this.workouts.filter((x) => x.file !== w.file);
    this.emit();
  }

  startRest(seconds: number): void {
    this.rest = seconds > 0 ? { until: Date.now() + seconds * 1000, total: seconds } : undefined;
    this.emit();
  }

  adjustRest(delta: number): void {
    if (!this.rest) return;
    this.rest = { until: this.rest.until + delta * 1000, total: Math.max(1, this.rest.total + delta) };
    if (this.rest.until <= Date.now()) this.rest = undefined;
    this.emit();
  }

  stopRest(): void {
    this.rest = undefined;
    this.emit();
  }

  // exercises

  getExercise(id: string): Exercise | undefined {
    return this.exercises.get(id);
  }

  /** Save a custom exercise, or an override of a library one (same id → replaces name/images/etc.). */
  async saveExercise(ex: Exercise): Promise<Exercise> {
    const isOverride = ex.source === "library" || this.library.some((e) => e.id === ex.id);
    let path = ex.file;
    if (!path) path = this.uniquePath(this.exercisesDir, safeFileName(ex.name));
    const saved: Exercise = { ...ex, file: path };
    const content = serializeExerciseNote(saved, yaml, isOverride);
    await this.write(path, content);
    const basename = path.slice(path.lastIndexOf("/") + 1, -3);
    this.customNotes.set(path, parseExerciseNote(content, basename, yaml));
    this.rebuildExercises();
    this.emit();
    return this.exercises.get(isOverride ? ex.id : `custom/${basename}`) ?? saved;
  }

  async deleteExerciseNote(ex: Exercise): Promise<void> {
    const f = ex.file && this.app.vault.getAbstractFileByPath(ex.file);
    if (f instanceof TFile) await this.app.fileManager.trashFile(f);
    if (ex.file) this.customNotes.delete(ex.file);
    this.rebuildExercises();
    this.emit();
  }

  /** Download an image from the internet into the vault next to custom exercises; returns a wikilink. */
  async saveImageFromUrl(url: string, requestUrl: (u: string) => Promise<ArrayBuffer>): Promise<string> {
    const data = await requestUrl(url);
    const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
    const safeExt = ext && ["gif", "png", "jpg", "jpeg", "webp"].includes(ext) ? ext : "gif";
    const dir = `${this.exercisesDir}/media`;
    await this.ensureFolder(dir);
    let path = `${dir}/image-${Date.now()}.${safeExt}`;
    const f = await this.app.vault.createBinary(normalizePath(path), data);
    path = f.name;
    return `[[${path}]]`;
  }

  notifyError(e: unknown, what: string): void {
    console.error(`[training] ${what}`, e);
    new Notice(`${what}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
