/**
 * Generate a short, unique-enough ID for client-side use.
 * Combines a base-36 timestamp with random characters.
 */
export function generateId(len = 6): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 2 + len);
}
