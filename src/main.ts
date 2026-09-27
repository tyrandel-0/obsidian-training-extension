import { MarkdownRenderChild, parseYaml, Plugin, type WorkspaceLeaf } from "obsidian";
import { fmtDuration, fmtKg, fmtSet, setsSummary, workoutDuration, workoutVolume, ROUTINE_BLOCK, WORKOUT_BLOCK } from "./format";
import { TrainingSettingTab } from "./settings";
import { TrainingStore } from "./store";
import { DEFAULT_SETTINGS, type Settings, type Workout, type WorkoutExercise } from "./types";
import type { Route } from "./ui/context";
import { TrainingView, VIEW_TYPE } from "./view";

export default class TrainingPlugin extends Plugin {
  settings: Settings = { ...DEFAULT_SETTINGS };
  store!: TrainingStore;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.store = new TrainingStore(this.app, () => this.settings);
    this.registerView(VIEW_TYPE, (leaf) => new TrainingView(leaf, this));

    this.addRibbonIcon("dumbbell", "Тренировки", () => void this.activate());
    this.addCommand({ id: "open", name: "Открыть трекер", callback: () => void this.activate() });
    this.addCommand({
      id: "open-workout",
      name: "Текущая тренировка (или начать пустую)",
      callback: async () => {
        if (!this.store.active) await this.store.startWorkout();
        await this.activate({ kind: "workout" });
      },
    });
    this.addSettingTab(new TrainingSettingTab(this.app, this));

    this.registerMarkdownCodeBlockProcessor(WORKOUT_BLOCK, (src, el, ctx) => {
      ctx.addChild(new MarkdownRenderChild(el));
      renderWorkoutBlock(src, el);
    });
    this.registerMarkdownCodeBlockProcessor(ROUTINE_BLOCK, (src, el) => renderRoutineBlock(src, el));

    this.app.workspace.onLayoutReady(async () => {
      await this.store.load();
      this.registerEvent(this.app.vault.on("create", this.store.onVaultChange));
      this.registerEvent(this.app.vault.on("modify", this.store.onVaultChange));
      this.registerEvent(this.app.vault.on("delete", this.store.onVaultDelete));
      this.registerEvent(this.app.vault.on("rename", this.store.onVaultRename));
    });
    // iOS may kill a backgrounded app without warning — persist the running workout when we lose focus.
    this.registerDomEvent(document, "visibilitychange", () => {
      if (document.visibilityState === "hidden") void this.store.flushActive();
    });
  }

  async onunload(): Promise<void> {
    await this.store.flushActive();
    this.store.images.clear();
  }

  async activate(route?: Route): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | undefined = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getLeaf("tab");
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    await workspace.revealLeaf(leaf);
    if (route && leaf.view instanceof TrainingView) leaf.view.show(route);
  }

  async loadSettings(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) ?? {}) };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}

// Reading-view rendering of the data blocks inside workout / routine notes.

function renderExercises(el: HTMLElement, exercises: WorkoutExercise[], onlyDone: boolean): void {
  const table = el.createEl("table", { cls: "tt-md-table" });
  const head = table.createEl("thead").createEl("tr");
  head.createEl("th", { text: "Упражнение" });
  head.createEl("th", { text: "Подходы" });
  const body = table.createEl("tbody");
  for (const e of exercises) {
    const tr = body.createEl("tr");
    tr.createEl("td", { text: e.name });
    const sets = onlyDone ? e.sets.filter((s) => s.done) : e.sets;
    tr.createEl("td", { text: sets.map((s) => fmtSet(s, e.track)).join(", ") || setsSummary(e) });
  }
}

function renderWorkoutBlock(src: string, el: HTMLElement): void {
  try {
    const w = parseYaml(src) as Workout;
    const box = el.createDiv({ cls: "tt-md-block" });
    const meta = box.createDiv({ cls: "tt-md-meta" });
    meta.createEl("b", { text: w.name ?? "Тренировка" });
    if (w.status === "in-progress") meta.createSpan({ text: " · идёт сейчас" });
    else meta.createSpan({ text: ` · ${fmtDuration(workoutDuration(w))} · ${fmtKg(workoutVolume(w))} кг` });
    renderExercises(box, w.exercises ?? [], w.status !== "in-progress");
    if (w.note) box.createEl("p", { text: w.note });
  } catch (e) {
    el.createEl("pre", { text: `Ошибка в данных тренировки: ${e}` });
  }
}

function renderRoutineBlock(src: string, el: HTMLElement): void {
  try {
    const r = parseYaml(src) as { exercises?: WorkoutExercise[] };
    renderExercises(el.createDiv({ cls: "tt-md-block" }), r.exercises ?? [], false);
  } catch (e) {
    el.createEl("pre", { text: `Ошибка в данных программы: ${e}` });
  }
}
