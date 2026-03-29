export function formatCategoryLabel(
  domain: string | null | undefined,
  fn: string | null | undefined,
): string;
export function formatCategoryLabel(
  domain: string | null | undefined,
  fn: string | null | undefined,
  fallback: null,
): string | null;
export function formatCategoryLabel(
  domain: string | null | undefined,
  fn: string | null | undefined,
  fallback: string,
): string;
export function formatCategoryLabel(
  domain: string | null | undefined,
  fn: string | null | undefined,
  fallback: string | null = "uncategorized"
): string | null {
  return domain && fn ? `${domain}/${fn}` : fallback;
}
