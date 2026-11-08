/**
 * Snapshot a file input's selection before resetting it.
 *
 * Order matters: in Chromium and Safari, assigning `input.value = ""` empties
 * the live `FileList` object. Holding the reference and converting it later
 * therefore produced an empty array, so selecting a file looked like a no-op.
 * Firefox keeps the reference populated, which made this browser-specific.
 */
export interface FileInputLike {
  files: ArrayLike<File> | null;
  value: string;
}

export function snapshotFileSelection(input: FileInputLike): File[] {
  const files = input.files === null ? [] : Array.from(input.files);
  input.value = "";
  return files;
}
