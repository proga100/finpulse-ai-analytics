import type { ClarificationOption } from "@/lib/types";

/** Sentinel id for the free-text "Other…" choice in a clarifying question. */
export const OTHER_ID = "__other__";

/**
 * Build the list of answer strings for a clarifying question from the user's
 * selected option ids plus any free-text typed into the "Other" field.
 * Selected option labels come first (in option order); the trimmed other-text
 * is appended only when the Other choice is active and non-empty.
 */
export function collectAnswers(
  options: ClarificationOption[],
  selected: Set<string>,
  otherText: string
): string[] {
  const answers: string[] = [];
  for (const opt of options) {
    if (selected.has(opt.id)) answers.push(opt.label);
  }
  if (selected.has(OTHER_ID) && otherText.trim()) {
    answers.push(otherText.trim());
  }
  return answers;
}

/**
 * Apply a single/multi-select toggle to the current selection set and return a
 * new set. In single-select mode picking an option replaces the selection.
 */
export function toggleSelection(
  selected: Set<string>,
  id: string,
  allowMulti: boolean
): Set<string> {
  const next = new Set(selected);
  if (allowMulti) {
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
  } else {
    next.clear();
    next.add(id);
  }
  return next;
}
