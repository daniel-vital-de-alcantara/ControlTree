type OpenPickerWindow = Window & {
  showOpenFilePicker?: (options: {
    id?: string;
    multiple?: boolean;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle[]>;
};

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
    return handle ? await handle.getFile() : null;
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === "AbortError") return null;
    throw reason;
  }
}
