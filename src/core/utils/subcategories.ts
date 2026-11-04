import type { Category, Subcategory } from '@/shared/models';

/** The buttons to offer on a transaction: active subcategories, plus a hidden one it already uses. */
export function pickableSubcategories(category: Category | undefined, selectedId?: string): Subcategory[] {
  return (category?.subcategories ?? []).filter((s) => !s.archived || s.id === selectedId);
}

/** A subcategory with transactions is hidden, not removed, so they keep their label. */
export function withoutSubcategory(list: Subcategory[], id: string, used: number): Subcategory[] {
  return used ? list.map((s) => (s.id === id ? { ...s, archived: true } : s)) : list.filter((s) => s.id !== id);
}

/** What gets saved: names trimmed, and any left blank dropped, unless already saved with a name. */
export function cleanSubcategories(list: Subcategory[], saved: Subcategory[] = []): Subcategory[] {
  return list
    .map((s) => ({ ...s, name: s.name.trim() || saved.find((x) => x.id === s.id)?.name || '' }))
    .filter((s) => s.name);
}

/** The name of a transaction's subcategory, or '' when it has none or it no longer exists. */
export function subcategoryName(category: Category | undefined, id: string | undefined): string {
  return category?.subcategories?.find((s) => s.id === id)?.name ?? '';
}
