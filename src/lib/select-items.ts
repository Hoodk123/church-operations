export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

/**
 * Resolve the display label for a record-backed value. Pass the same array to a
 * Base UI `Select.Root`'s `items` prop so the trigger renders the label instead
 * of the raw id, and use this helper when the label is needed as plain text.
 */
export function labelFor<T extends string>(
  items: readonly SelectOption<T>[],
  value: T | null | undefined
): string {
  if (value == null) return '';
  return items.find((item) => item.value === value)?.label ?? '';
}
