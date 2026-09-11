type OpenPickerWindow = Window & {
  showOpenFilePicker?: (options: {
    id?: string;
    multiple?: boolean;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle[]>;
};

type PermissionAwareFileHandle = FileSystemFileHandle & {
  queryPermission?: (descriptor?: { mode?: "read" }) => Promise<PermissionState>;
};

const RECENT_DATASET_DATABASE = "controltree-local-files";
const RECENT_DATASET_STORE = "handles";
const RECENT_DATASET_KEY = "most-recent-dataset";

function isLocalControlTree(): boolean {
  return location.hostname === "127.0.0.1" || location.hostname === "localhost";
}

function openRecentFilesDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(RECENT_DATASET_DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(RECENT_DATASET_STORE)) {
        request.result.createObjectStore(RECENT_DATASET_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function rememberDatasetHandle(handle: FileSystemFileHandle): Promise<void> {
  if (!isLocalControlTree() || !("indexedDB" in window)) return;
  try {
    const database = await openRecentFilesDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(RECENT_DATASET_STORE, "readwrite");
      transaction.objectStore(RECENT_DATASET_STORE).put(handle, RECENT_DATASET_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  } catch {
    // Remembering a handle is an optional convenience. File selection still works without it.
  }
}

async function recentDatasetHandle(): Promise<PermissionAwareFileHandle | null> {
  if (!isLocalControlTree() || !("indexedDB" in window)) return null;
  try {
    const database = await openRecentFilesDatabase();
    const handle = await new Promise<PermissionAwareFileHandle | undefined>((resolve, reject) => {
      const request = database.transaction(RECENT_DATASET_STORE, "readonly")
        .objectStore(RECENT_DATASET_STORE)
        .get(RECENT_DATASET_KEY);
      request.onsuccess = () => resolve(request.result as PermissionAwareFileHandle | undefined);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return handle ?? null;
  } catch {
    return null;
  }
}

export async function rememberedDatasetFile(expected?: { sourceFileName?: string; sourceFileSize?: number; sourceFileLastModified?: number }): Promise<File | null> {
  const handle = await recentDatasetHandle();
  if (!handle) return null;
  try {
    if (handle.queryPermission && await handle.queryPermission({ mode: "read" }) !== "granted") return null;
    const file = await handle.getFile();
    if (expected?.sourceFileName && file.name !== expected.sourceFileName) return null;
    if (typeof expected?.sourceFileSize === "number" && file.size !== expected.sourceFileSize) return null;
    if (typeof expected?.sourceFileLastModified === "number" && file.lastModified !== expected.sourceFileLastModified) return null;
    return file;
  } catch {
    return null;
  }
}

export async function pickDatasetFile(): Promise<File | null | undefined> {
  const picker = (window as OpenPickerWindow).showOpenFilePicker;
  if (!picker) return undefined;
  try {
    const [handle] = await picker.call(window, {
      id: "controltree-data-sources",
      multiple: false,
      types: [{
        description: "CSV or Excel dataset",
        accept: {
          "text/csv": [".csv"],
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
        },
      }],
    });
    if (!handle) return null;
    await rememberDatasetHandle(handle);
    return await handle.getFile();
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === "AbortError") return null;
    throw reason;
  }
}
