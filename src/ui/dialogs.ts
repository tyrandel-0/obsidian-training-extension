import { App, FuzzySuggestModal, Menu, Modal, Setting, TFile } from "obsidian";

export interface MenuEntry {
  title: string;
  icon?: string;
  warning?: boolean;
  onClick: () => void;
}

/** Native Obsidian menu (looks right on iOS too). `null` entries become separators. */
export function showMenu(evt: MouseEvent, entries: (MenuEntry | null)[]): void {
  const menu = new Menu();
  for (const e of entries) {
    if (!e) {
      menu.addSeparator();
      continue;
    }
    menu.addItem((item) => {
      item.setTitle(e.title).onClick(e.onClick);
      if (e.icon) item.setIcon(e.icon);
      if (e.warning) item.setWarning(true);
    });
  }
  menu.showAtMouseEvent(evt);
}

export function confirm(app: App, title: string, text: string, ok = "Да", danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false;
    const m = new Modal(app);
    m.titleEl.setText(title);
    if (text) m.contentEl.createEl("p", { text });
    new Setting(m.contentEl)
      .addButton((b) => b.setButtonText("Отмена").onClick(() => m.close()))
      .addButton((b) => {
        b.setButtonText(ok).onClick(() => {
          result = true;
          m.close();
        });
        if (danger) b.setWarning();
        else b.setCta();
      });
    m.onClose = () => resolve(result);
    m.open();
  });
}

export function prompt(app: App, title: string, value = "", placeholder = "", inputMode = "text"): Promise<string | undefined> {
  return new Promise((resolve) => {
    let result: string | undefined;
    const m = new Modal(app);
    m.titleEl.setText(title);
    const input = m.contentEl.createEl("input", { type: "text", value, placeholder, cls: "tt-prompt-input" });
    input.setAttr("inputmode", inputMode);
    const submit = () => {
      result = input.value;
      m.close();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
    new Setting(m.contentEl)
      .addButton((b) => b.setButtonText("Отмена").onClick(() => m.close()))
      .addButton((b) => b.setButtonText("OK").setCta().onClick(submit));
    m.onClose = () => resolve(result);
    m.open();
    window.setTimeout(() => {
      input.focus();
      input.select();
    }, 50);
  });
}

const IMAGE_EXT = ["gif", "png", "jpg", "jpeg", "webp", "svg"];

class ImagePicker extends FuzzySuggestModal<TFile> {
  constructor(app: App, private done: (f: TFile | undefined) => void) {
    super(app);
    this.setPlaceholder("Картинка или GIF из хранилища…");
  }
  private picked = false;
  getItems(): TFile[] {
    return this.app.vault.getFiles().filter((f) => IMAGE_EXT.includes(f.extension.toLowerCase()) && !f.path.includes("/.library/"));
  }
  getItemText(f: TFile): string {
    return f.path;
  }
  onChooseItem(f: TFile): void {
    this.picked = true;
    this.done(f);
  }
  onClose(): void {
    super.onClose();
    // onChooseItem fires after onClose on some platforms; defer the "nothing picked" signal.
    window.setTimeout(() => {
      if (!this.picked) this.done(undefined);
    }, 100);
  }
}

export function pickVaultImage(app: App): Promise<TFile | undefined> {
  return new Promise((resolve) => new ImagePicker(app, resolve).open());
}
