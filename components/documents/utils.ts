/**
 * Shared client-side helpers for the Documents module.
 */

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const ICON_BY_PREFIX: Array<[RegExp, string]> = [
  [/^image\//, "🖼️"],
  [/^video\//, "🎬"],
  [/^audio\//, "🎧"],
  [/^application\/pdf$/, "📄"],
  [/spreadsheet|excel|csv/, "📊"],
  [/word|document|presentation|powerpoint/, "📝"],
  [/zip|compressed|tar|gzip/, "🗜️"],
];

export function fileIconFor(fileType: string): string {
  for (const [pattern, icon] of ICON_BY_PREFIX) {
    if (pattern.test(fileType)) return icon;
  }
  return "📎";
}
