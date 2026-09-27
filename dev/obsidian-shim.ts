// Minimal in-browser stand-in for the `obsidian` module, enough to run the tracker UI
// in a normal browser (`npm run preview`). Not shipped with the plugin.
import * as jsyaml from "js-yaml";
import { createElement, icons } from "lucide";

// ---- DOM helpers Obsidian adds to HTMLElement ------------------------------
type ElOpts = { cls?: string; text?: string; type?: string; value?: string; placeholder?: string; attr?: Record<string, string> };
const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
proto.empty = function (this: HTMLElement) {
  this.innerHTML = "";
};
proto.setText = function (this: HTMLElement, t: string) {
  this.textContent = t;
};
proto.addClass = function (this: HTMLElement, ...c: string[]) {
  this.classList.add(...c);
};
proto.setAttr = function (this: HTMLElement, k: string, v: string) {
  this.setAttribute(k, v);
};
proto.createEl = function (this: HTMLElement, tag: string, o: ElOpts = {}) {
  const el = document.createElement(tag) as HTMLInputElement;
  if (o.cls) el.className = o.cls;
  if (o.text) el.textContent = o.text;
  if (o.type) el.type = o.type;
  if (o.value !== undefined) el.value = o.value;
  if (o.placeholder) el.placeholder = o.placeholder;
  this.appendChild(el);
  return el;
};
proto.createDiv = function (this: HTMLElement & { createEl: (t: string, o?: ElOpts) => HTMLElement }, o: ElOpts = {}) {
  return this.createEl("div", o);
};
proto.createSpan = function (this: HTMLElement & { createEl: (t: string, o?: ElOpts) => HTMLElement }, o: ElOpts = {}) {
  return this.createEl("span", o);
};

const pascal = (s: string) => s.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase());
export function setIcon(el: HTMLElement, name: string): void {
  const node = (icons as Record<string, unknown>)[pascal(name)] ?? (icons as Record<string, unknown>).Circle;
  el.appendChild(createElement(node as Parameters<typeof createElement>[0]));
}

export const parseYaml = (s: string) => jsyaml.load(s);
export const stringifyYaml = (o: unknown) => jsyaml.dump(o);
export const normalizePath = (p: string) => p.replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
export const Platform = { isMobile: true, isDesktop: false };

export async function requestUrl(req: string | { url: string }) {
  const url = typeof req === "string" ? req : req.url;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  return {
    arrayBuffer: buf,
    get json() {
      return JSON.parse(new TextDecoder().decode(buf));
    },
    get text() {
      return new TextDecoder().decode(buf);
    },
  };
}

export class Notice {
  constructor(msg: string) {
    const d = document.createElement("div");
    d.className = "shim-notice";
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 2500);
  }
}

// ---- vault -----------------------------------------------------------------

export class TAbstractFile {
  constructor(public path: string) {}
  get name() {
    return this.path.split("/").pop()!;
  }
}
export class TFolder extends TAbstractFile {}
export class TFile extends TAbstractFile {
  get basename() {
    return this.name.replace(/\.[^.]+$/, "");
  }
  get extension() {
    return this.name.split(".").pop()!;
  }
}

export class MemoryVault {
  text = new Map<string, string>();
  bin = new Map<string, ArrayBuffer>();
  folders = new Set<string>();
  private handlers: Record<string, ((...a: unknown[]) => void)[]> = {};

  on(ev: string, fn: (...a: unknown[]) => void) {
    (this.handlers[ev] ??= []).push(fn);
    return {};
  }
  private fire(ev: string, ...a: unknown[]) {
    for (const fn of this.handlers[ev] ?? []) fn(...a);
  }
  getMarkdownFiles() {
    return [...this.text.keys()].filter((p) => p.endsWith(".md")).map((p) => new TFile(p));
  }
  getFiles() {
    return [...this.text.keys(), ...this.bin.keys()].map((p) => new TFile(p));
  }
  getAbstractFileByPath(p: string) {
    if (this.text.has(p) || this.bin.has(p)) return new TFile(p);
    if (this.folders.has(p)) return new TFolder(p);
    return null;
  }
  async cachedRead(f: TFile) {
    return this.text.get(f.path) ?? "";
  }
  async read(f: TFile) {
    return this.text.get(f.path) ?? "";
  }
  async modify(f: TFile, c: string) {
    this.text.set(f.path, c);
    this.fire("modify", f);
  }
  async create(p: string, c: string) {
    this.text.set(p, c);
    const f = new TFile(p);
    this.fire("create", f);
    return f;
  }
  async createBinary(p: string, d: ArrayBuffer) {
    this.bin.set(p, d);
    return new TFile(p);
  }
  async createFolder(p: string) {
    this.folders.add(p);
  }
  getResourcePath(f: TFile) {
    const d = this.bin.get(f.path);
    return d ? URL.createObjectURL(new Blob([d])) : "";
  }
  adapter = {
    exists: async (p: string) => this.text.has(p) || this.bin.has(p) || this.folders.has(p),
    read: async (p: string) => this.text.get(p) ?? "",
    write: async (p: string, c: string) => void this.text.set(p, c),
    readBinary: async (p: string) => this.bin.get(p)!,
    writeBinary: async (p: string, d: ArrayBuffer) => void this.bin.set(p, d),
    mkdir: async (p: string) => void this.folders.add(p),
  };
  async rename(f: TFile, to: string) {
    const c = this.text.get(f.path)!;
    this.text.delete(f.path);
    this.text.set(to, c);
    this.fire("rename", new TFile(to), f.path);
  }
  async trash(f: TFile) {
    this.text.delete(f.path);
    this.fire("delete", f);
  }
}

export function makeApp(vault: MemoryVault) {
  return {
    vault,
    metadataCache: {
      getFirstLinkpathDest: (link: string) => vault.getFiles().find((f) => f.path === link || f.name === link) ?? null,
    },
    fileManager: {
      renameFile: (f: TFile, to: string) => vault.rename(f, to),
      trashFile: (f: TFile) => vault.trash(f),
    },
    workspace: { openLinkText: (p: string) => console.log("open", p) },
  };
}
export type App = ReturnType<typeof makeApp>;

// ---- UI primitives -----------------------------------------------------------

export class Menu {
  private items: { title: string; warning: boolean; cb: () => void }[] = [];
  addItem(fn: (item: unknown) => void) {
    const it = { title: "", warning: false, cb: () => {} };
    const api = {
      setTitle: (t: string) => ((it.title = t), api),
      setIcon: () => api,
      setWarning: (w: boolean) => ((it.warning = w), api),
      onClick: (cb: () => void) => ((it.cb = cb), api),
    };
    fn(api);
    this.items.push(it);
    return this;
  }
  addSeparator() {
    return this;
  }
  showAtMouseEvent(e: MouseEvent) {
    const m = document.createElement("div");
    m.className = "shim-menu";
    m.style.top = `${e.clientY}px`;
    for (const it of this.items) {
      const b = document.createElement("div");
      b.textContent = it.title;
      if (it.warning) b.style.color = "#d33";
      b.onclick = () => {
        m.remove();
        it.cb();
      };
      m.appendChild(b);
    }
    document.body.appendChild(m);
    setTimeout(() => document.addEventListener("click", () => m.remove(), { once: true }), 0);
  }
}

export class Modal {
  modalEl = document.createElement("div");
  titleEl = document.createElement("h3");
  contentEl = document.createElement("div");
  onClose: () => void = () => {};
  constructor(public app: unknown) {
    this.modalEl.className = "shim-modal";
    this.modalEl.append(this.titleEl, this.contentEl);
  }
  open() {
    const bg = document.createElement("div");
    bg.className = "shim-modal-bg";
    bg.appendChild(this.modalEl);
    document.body.appendChild(bg);
    (this as unknown as { onOpen?: () => void }).onOpen?.();
  }
  close() {
    this.modalEl.parentElement?.remove();
    this.onClose();
  }
}

export abstract class FuzzySuggestModal<T> extends Modal {
  setPlaceholder(_: string) {}
  abstract getItems(): T[];
  abstract getItemText(t: T): string;
  abstract onChooseItem(t: T): void;
}

export class Setting {
  el = document.createElement("div");
  constructor(container: HTMLElement) {
    this.el.className = "shim-setting";
    container.appendChild(this.el);
  }
  setName(n: string) {
    const d = document.createElement("b");
    d.textContent = n;
    this.el.prepend(d);
    return this;
  }
  setDesc(t: string) {
    const d = document.createElement("div");
    d.textContent = t;
    d.style.opacity = "0.7";
    this.el.appendChild(d);
    return this;
  }
  setHeading() {
    return this;
  }
  addButton(fn: (b: unknown) => void) {
    const btn = document.createElement("button");
    const api = {
      setButtonText: (t: string) => ((btn.textContent = t), api),
      setCta: () => ((btn.style.background = "#3a4fe0"), (btn.style.color = "#fff"), api),
      setWarning: () => ((btn.style.color = "#d33"), api),
      setDisabled: (d: boolean) => ((btn.disabled = d), api),
      onClick: (cb: () => void) => ((btn.onclick = cb), api),
    };
    fn(api);
    this.el.appendChild(btn);
    return this;
  }
  addToggle(fn: (t: unknown) => void) {
    const cb = document.createElement("input");
    cb.type = "checkbox";
    const api = {
      setValue: (v: boolean) => ((cb.checked = v), api),
      onChange: (f: (v: boolean) => void) => ((cb.onchange = () => f(cb.checked)), api),
    };
    fn(api);
    this.el.appendChild(cb);
    return this;
  }
  addText() {
    return this;
  }
}

export class ItemView {}
export class Plugin {}
export class PluginSettingTab {}
export class MarkdownRenderChild {}
export function debounce<T extends unknown[]>(fn: (...a: T) => void, ms: number) {
  let t: number | undefined;
  return (...a: T) => {
    clearTimeout(t);
    t = window.setTimeout(() => fn(...a), ms);
  };
}
