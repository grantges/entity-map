/** Format an ISO date string for display. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

/** Format a byte count as a human-readable size (B / KB / MB). */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
