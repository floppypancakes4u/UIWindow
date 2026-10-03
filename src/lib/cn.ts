/**
 * Joins truthy class name fragments for Tailwind (no tailwind-merge).
 */
export function cn(...parts: Array<string | undefined | null | false>): string {
  return parts.filter(Boolean).join(" ");
}
