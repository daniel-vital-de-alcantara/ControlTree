/// <reference lib="webworker" />

import { readSheet } from "read-excel-file/web-worker";

self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
  try {
    const rows = await readSheet(event.data);
    self.postMessage({ rows });
  } catch (reason) {
    self.postMessage({
      error: reason instanceof Error ? reason.message : "The Excel workbook could not be read.",
    });
  }
};
