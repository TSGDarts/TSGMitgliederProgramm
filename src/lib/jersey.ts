export const JERSEY_SIZES = [
  "2XS",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
  "6XL",
  "7XL",
  "8XL",
  "9XL",
] as const;

export type JerseySize = (typeof JERSEY_SIZES)[number];

export function isJerseySize(value: string): value is JerseySize {
  return (JERSEY_SIZES as readonly string[]).includes(value);
}

/** Der Hersteller bezeichnet 2XS in seiner Maßtabelle als XXS. */
export function jerseySizeLabel(size: JerseySize): string {
  return size === "2XS" ? "2XS (XXS)" : size;
}
