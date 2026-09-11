import { describe, expect, it } from "vitest";

import { normalizeTable } from "./dataset";
import { searchCategoryValues } from "./category-search";

describe("category search", () => {
  it("finds values beyond the old first-20 limit", async () => {
    const rows = [["id"], ...Array.from({ length: 80 }, (_, index) => [1000 + index])];
    const dataset = normalizeTable(rows, "ids.csv");
    expect(await searchCategoryValues(dataset, "id", undefined, "1079")).toEqual([1079]);
  });
});
