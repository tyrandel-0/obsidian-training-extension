import { AbstractInputSuggest, Notice, PluginSettingTab, Setting, TFolder, type App } from "obsidian";
import type TrainingPlugin from "./main";

class FolderSuggest extends AbstractInputSuggest<TFolder> {
  protected getSuggestions(query: string): TFolder[] {
    const q = query.toLowerCase();
    return this.app.vault
      .getAllLoadedFiles()
      .filter((f): f is TFolder => f instanceof TFolder && !f.isRoot() && f.path.toLowerCase().includes(q))
      .slice(0, 50);
  }
  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.setText(folder.path);
  }
}

export class TrainingSettingTab extends PluginSettingTab {
  private download: { cancelled: boolean } | undefined;

  constructor(app: App, private plugin: TrainingPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    const p = this.plugin;
    containerEl.empty();

    let folderDraft = p.settings.rootFolder;
    new Setting(containerEl)
      .setName("Папка с данными")
      .setDesc(
        "Путь внутри хранилища, можно вложенный: Training, Data/Training… Здесь лежат тренировки (Workouts), программы (Routines), " +
          "свои упражнения (Exercises) и кэш базы (.library). При смене папки данные можно перенести.",
      )
      .addText((t) => {
        t.setPlaceholder("Training")
          .setValue(p.settings.rootFolder)
          .onChange((v) => (folderDraft = v));
        new FolderSuggest(this.app, t.inputEl).onSelect((f) => {
          folderDraft = f.path;
          t.setValue(f.path);
        });
      })
      .addButton((b) =>
        b
          .setButtonText("Применить")
          .setCta()
          .onClick(async () => {
            await p.changeRootFolder(folderDraft);
            this.display();
          }),
      );

    new Setting(containerEl).setName("Тренировка").setHeading();
    new Setting(containerEl)
      .setName("Отдых по умолчанию, секунд")
      .setDesc("Для новых упражнений. У каждого упражнения можно задать своё время в меню ⋮.")
      .addText((t) => {
        t.inputEl.inputMode = "numeric";
        t.setValue(String(p.settings.defaultRest)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (Number.isFinite(n) && n >= 0) {
            p.settings.defaultRest = n;
            await p.saveSettings();
          }
        });
      });
    new Setting(containerEl)
      .setName("Таймер отдыха")
      .setDesc("Запускать обратный отсчёт после отметки подхода.")
      .addToggle((t) =>
        t.setValue(p.settings.restTimer).onChange(async (v) => {
          p.settings.restTimer = v;
          await p.saveSettings();
        }),
      );
    new Setting(containerEl)
      .setName("Звук в конце отдыха")
      .addToggle((t) =>
        t.setValue(p.settings.restSound).onChange(async (v) => {
          p.settings.restSound = v;
          await p.saveSettings();
        }),
      );

    new Setting(containerEl).setName("База упражнений").setHeading();
    const count = p.store.library.length;
    new Setting(containerEl)
      .setName("Загрузить / обновить базу")
      .setDesc(count ? `Сейчас в базе ${count} упражнений.` : "База ещё не загружена.")
      .addButton((b) =>
        b
          .setButtonText(count ? "Обновить" : "Загрузить")
          .setCta()
          .onClick(async () => {
            b.setDisabled(true).setButtonText("Загружаю…");
            try {
              const n = await p.store.importLibrary();
              new Notice(`Загружено упражнений: ${n}`);
            } catch (e) {
              p.store.notifyError(e, "Не удалось загрузить базу");
            }
            this.display();
          }),
      );
    new Setting(containerEl)
      .setName("Русские названия")
      .setDesc("Показывать переведённые названия упражнений из базы (поиск работает на обоих языках).")
      .addToggle((t) =>
        t.setValue(p.settings.useRussianNames).onChange(async (v) => {
          p.settings.useRussianNames = v;
          await p.saveSettings();
          await p.store.load();
        }),
      );
    const images = p.store.library.flatMap((e) => e.images ?? []);
    const dl = new Setting(containerEl)
      .setName("Скачать все картинки для офлайна")
      .setDesc(`${images.length} файлов, примерно ${Math.round((images.length * 55) / 1024)} МБ. Без этого картинки скачиваются по мере просмотра.`);
    dl.addButton((b) =>
      b
        .setButtonText(this.download ? "Остановить" : "Скачать")
        .setDisabled(!images.length)
        .onClick(async () => {
          if (this.download) {
            this.download.cancelled = true;
            return;
          }
          const signal = { cancelled: false };
          this.download = signal;
          b.setButtonText("Остановить");
          const failed = await p.store.images.downloadAll(images, (d, total) => dl.setDesc(`Скачано ${d} из ${total}…`), signal);
          this.download = undefined;
          new Notice(signal.cancelled ? "Скачивание остановлено" : failed ? `Готово, с ошибками: ${failed}` : "Все картинки скачаны");
          this.display();
        }),
    );
    new Setting(containerEl)
      .setName("Адрес базы (JSON)")
      .setDesc("Можно подставить свою базу в формате free-exercise-db.")
      .addText((t) =>
        t.setValue(p.settings.libraryUrl).onChange(async (v) => {
          p.settings.libraryUrl = v.trim();
          await p.saveSettings();
        }),
      );
    new Setting(containerEl)
      .setName("Адрес картинок")
      .setDesc("Префикс, к которому добавляется путь картинки из базы.")
      .addText((t) =>
        t.setValue(p.settings.libraryImageBase).onChange(async (v) => {
          p.settings.libraryImageBase = v.trim();
          await p.saveSettings();
        }),
      );
  }
}
