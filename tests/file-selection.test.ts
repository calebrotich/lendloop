import { describe, expect, it } from "vitest";

import { snapshotFileSelection } from "../lib/file-selection";

function file(name: string): File {
  return new File([new Uint8Array([1])], name, { type: "image/jpeg" });
}

describe("snapshotFileSelection", () => {
  it("keeps the selected files when resetting the input empties the live list", () => {
    const selected = [file("one.jpg"), file("two.jpg")];
    const input = {
      files: selected as unknown as ArrayLike<File>,
      value: "selected",
    };

    // Simulate Chromium/Safari: clearing value empties the captured FileList.
    Object.defineProperty(input, "value", {
      get: () => "selected",
      set: (next: string) => {
        if (next === "") selected.length = 0;
      },
    });

    const snapshot = snapshotFileSelection(input);

    expect(snapshot.map((item) => item.name)).toEqual(["one.jpg", "two.jpg"]);
    expect(selected).toHaveLength(0);
  });

  it("handles a cleared input", () => {
    expect(snapshotFileSelection({ files: null, value: "" })).toEqual([]);
  });
});
