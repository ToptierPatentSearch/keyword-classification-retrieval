import type { SearchDatabaseId } from "./searchQuery";

/**
 * Applies database-specific output escaping immediately before a generated
 * query is displayed or copied. The search strategy generator remains
 * database-focused, while syntax-sensitive literal characters are protected
 * in one testable boundary.
 */
export function databaseSafeQuery(
  databaseId: SearchDatabaseId,
  value: string,
): string {
  if (databaseId !== "j_platpat") {
    return value;
  }

  // J-PlatPat Logical Expression Input treats the half-width hyphen/minus as
  // the NOT operator. When the same character is literal keyword text, use
  // the full-width form so phrases such as "private-data" are not parsed as
  // logical expressions.
  return value.replace(/-/g, "－");
}
