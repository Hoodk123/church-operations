export function initials(...parts: string[]): string {
  return parts
    .map((part) => part.trim()[0] ?? '')
    .join('')
    .toUpperCase();
}
