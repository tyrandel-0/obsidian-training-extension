import { ItemView, type WorkspaceLeaf } from "obsidian";
import { render } from "preact";
import type TrainingPlugin from "./main";
import { App } from "./ui/App";
import type { Nav, Route } from "./ui/context";
import { watchBottomInset } from "./ui/insets";

export const VIEW_TYPE = "training-tracker";

export class TrainingView extends ItemView {
  nav: Nav | undefined;
  private pending: Route | undefined;
  private stopInsets: (() => void) | undefined;

  constructor(leaf: WorkspaceLeaf, private plugin: TrainingPlugin) {
    super(leaf);
    this.navigation = false;
  }

  getViewType(): string {
    return VIEW_TYPE;
  }
  getDisplayText(): string {
    return "Тренировки";
  }
  getIcon(): string {
    return "dumbbell";
  }

  /** Open a screen, e.g. the running workout from a command. */
  show(route: Route): void {
    if (this.nav) {
      this.nav.reset();
      this.nav.push(route);
    } else this.pending = route;
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("tt-root");
    this.stopInsets = watchBottomInset(this.contentEl);
    const plugin = this.plugin;
    const ctx = {
      app: this.app,
      store: plugin.store,
      settings: () => plugin.settings,
      openFile: (path: string) => void this.app.workspace.openLinkText(path, "", true),
    };
    render(
      <App
        ctx={ctx}
        initial={this.pending ?? (plugin.store.active ? { kind: "workout" } : undefined)}
        bindNav={(nav) => {
          this.nav = nav;
          this.pending = undefined;
        }}
      />,
      this.contentEl,
    );
  }

  async onClose(): Promise<void> {
    this.stopInsets?.();
    await this.plugin.store.flushActive();
    render(null, this.contentEl);
  }
}
