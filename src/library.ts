import { App, normalizePath, requestUrl, TFile } from "obsidian";
import { defaultTrack } from "./format";
import type { Exercise, Settings } from "./types";

/** Raw entry of free-exercise-db (https://github.com/yuhonas/free-exercise-db, public domain). */
export interface LibraryEntry {
  id: string;
  name: string;
  force?: string | null;
  level?: string;
  mechanic?: string | null;
  equipment?: string | null;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  instructions?: string[];
  category?: string;
  images?: string[];
}

export function libraryDir(settings: Settings): string {
  return normalizePath(`${settings.rootFolder}/.library`);
}

export function libraryToExercise(e: LibraryEntry, ruNames: Record<string, string>, useRu: boolean): Exercise {
  return {
    id: e.id,
    name: (useRu && ruNames[e.id]) || e.name,
    nameEn: e.name,
    category: e.category,
    equipment: e.equipment ?? undefined,
    level: e.level,
    primaryMuscles: e.primaryMuscles ?? [],
    secondaryMuscles: e.secondaryMuscles ?? [],
    instructions: e.instructions ?? [],
    images: e.images ?? [],
    track: defaultTrack(e.category, e.equipment),
    source: "library",
  };
}

async function ensureFolder(app: App, path: string): Promise<void> {
  const parts = normalizePath(path).split("/");
  let cur = "";
  for (const p of parts) {
    cur = cur ? `${cur}/${p}` : p;
    if (!(await app.vault.adapter.exists(cur))) await app.vault.adapter.mkdir(cur);
  }
}

export async function readLibrary(app: App, settings: Settings): Promise<LibraryEntry[] | undefined> {
  const path = `${libraryDir(settings)}/exercises.json`;
  if (!(await app.vault.adapter.exists(path))) return undefined;
  try {
    const data = JSON.parse(await app.vault.adapter.read(path));
    return Array.isArray(data) ? data : undefined;
  } catch (e) {
    console.error("[training] failed to read library", e);
    return undefined;
  }
}

export async function downloadLibrary(app: App, settings: Settings): Promise<LibraryEntry[]> {
  const res = await requestUrl({ url: settings.libraryUrl });
  const data = res.json as unknown;
  if (!Array.isArray(data)) throw new Error("Ожидался JSON-массив упражнений");
  const entries = (data as LibraryEntry[]).filter((e) => e && typeof e.id === "string" && typeof e.name === "string");
  if (!entries.length) throw new Error("В базе нет упражнений");
  await ensureFolder(app, libraryDir(settings));
  await app.vault.adapter.write(`${libraryDir(settings)}/exercises.json`, JSON.stringify(entries));
  return entries;
}

const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" };

/**
 * Turns image references into something an <img> can show:
 *  - http(s) URLs are used as-is;
 *  - "[[wikilinks]]" and vault paths resolve to vault resources (so any GIF you drop into the vault works);
 *  - library-relative paths ("Air_Bike/0.jpg") are downloaded once into `<root>/.library/images` and
 *    served from there afterwards, so the gym without internet is fine.
 */
export class ImageResolver {
  private urls = new Map<string, string>();
  private inflight = new Map<string, Promise<string | undefined>>();

  constructor(private app: App, private settings: () => Settings) {}

  cached(ref: string): string | undefined {
    return this.urls.get(ref);
  }

  resolve(ref: string, sourcePath = ""): Promise<string | undefined> {
    const hit = this.urls.get(ref);
    if (hit) return Promise.resolve(hit);
    let p = this.inflight.get(ref);
    if (!p) {
      p = this.doResolve(ref, sourcePath).then((url) => {
        this.inflight.delete(ref);
        if (url) this.urls.set(ref, url);
        return url;
      });
      this.inflight.set(ref, p);
    }
    return p;
  }

  private async doResolve(ref: string, sourcePath: string): Promise<string | undefined> {
    if (/^(https?:|data:|app:|capacitor:)/.test(ref)) return ref;
    const link = ref.match(/^!?\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]$/)?.[1];
    if (link) {
      const f = this.app.metadataCache.getFirstLinkpathDest(link, sourcePath);
      return f ? this.app.vault.getResourcePath(f) : undefined;
    }
    const vaultFile = this.app.vault.getAbstractFileByPath(normalizePath(ref));
    if (vaultFile instanceof TFile) return this.app.vault.getResourcePath(vaultFile);
    return this.libraryImage(ref);
  }

  private cachePath(rel: string): string {
    return normalizePath(`${libraryDir(this.settings())}/images/${rel}`);
  }

  private toBlobUrl(data: ArrayBuffer, rel: string): string {
    const ext = rel.split(".").pop()?.toLowerCase() ?? "jpg";
    return URL.createObjectURL(new Blob([data], { type: MIME[ext] ?? "image/jpeg" }));
  }

  private async libraryImage(rel: string): Promise<string | undefined> {
    if (rel.split("/").includes("..")) return undefined;
    const adapter = this.app.vault.adapter;
    const path = this.cachePath(rel);
    try {
      if (await adapter.exists(path)) return this.toBlobUrl(await adapter.readBinary(path), rel);
    } catch (e) {
      console.warn("[training] cached image unreadable", path, e);
    }
    const remote = this.settings().libraryImageBase + rel;
    try {
      const data = await this.download(rel);
      return this.toBlobUrl(data, rel);
    } catch (e) {
      console.warn("[training] image download failed", remote, e);
      return remote;
    }
  }

  private async download(rel: string): Promise<ArrayBuffer> {
    const res = await requestUrl({ url: this.settings().libraryImageBase + rel });
    const path = this.cachePath(rel);
    await ensureFolder(this.app, path.slice(0, path.lastIndexOf("/")));
    await this.app.vault.adapter.writeBinary(path, res.arrayBuffer);
    return res.arrayBuffer;
  }

  /** Pre-download every library image (optional, ~100 MB). */
  async downloadAll(refs: string[], onProgress: (done: number, total: number) => void, signal: { cancelled: boolean }): Promise<number> {
    const adapter = this.app.vault.adapter;
    let done = 0;
    let failed = 0;
    const queue = [...refs];
    const worker = async () => {
      while (queue.length && !signal.cancelled) {
        const rel = queue.shift()!;
        try {
          if (!(await adapter.exists(this.cachePath(rel)))) await this.download(rel);
        } catch {
          failed++;
        }
        onProgress(++done, refs.length);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    return failed;
  }

  clear(): void {
    for (const url of this.urls.values()) if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    this.urls.clear();
  }
}
