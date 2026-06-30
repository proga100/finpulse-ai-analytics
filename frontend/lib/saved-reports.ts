import type { AnalyticsChatResponse } from "@/lib/types";

/** localStorage key holding the saved-reports list. */
export const SAVED_REPORTS_KEY = "finpulse_analytics_saved_reports";

export type SavedReport = {
  id: string;
  name: string;
  question: string;
  savedAt: number;
  response: AnalyticsChatResponse;
};

export function loadSavedReports(): SavedReport[] {
  try {
    const raw = localStorage.getItem(SAVED_REPORTS_KEY);
    return raw ? (JSON.parse(raw) as SavedReport[]) : [];
  } catch {
    return [];
  }
}

export function saveSavedReports(list: SavedReport[]): void {
  try {
    localStorage.setItem(SAVED_REPORTS_KEY, JSON.stringify(list.slice(0, 100)));
  } catch {}
}
