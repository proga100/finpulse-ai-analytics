import { describe, it, expect } from "vitest";
import { OTHER_ID, collectAnswers, toggleSelection } from "./clarification";
import type { ClarificationOption } from "./types";

const OPTIONS: ClarificationOption[] = [
  { id: "opt-0", label: "Last 7 days" },
  { id: "opt-1", label: "Last 30 days" },
  { id: "opt-2", label: "All time" }
];

describe("collectAnswers", () => {
  it("returns labels of selected options in option order", () => {
    const selected = new Set(["opt-2", "opt-0"]);
    expect(collectAnswers(OPTIONS, selected, "")).toEqual(["Last 7 days", "All time"]);
  });

  it("returns an empty array when nothing is selected", () => {
    expect(collectAnswers(OPTIONS, new Set(), "")).toEqual([]);
  });

  it("appends trimmed other text when the Other choice is active", () => {
    const selected = new Set(["opt-1", OTHER_ID]);
    expect(collectAnswers(OPTIONS, selected, "  this quarter  ")).toEqual([
      "Last 30 days",
      "this quarter"
    ]);
  });

  it("ignores Other text when the Other choice is not active", () => {
    expect(collectAnswers(OPTIONS, new Set(["opt-0"]), "ignored")).toEqual(["Last 7 days"]);
  });

  it("ignores Other when active but the text is blank", () => {
    expect(collectAnswers(OPTIONS, new Set([OTHER_ID]), "   ")).toEqual([]);
  });

  it("supports a free-text-only answer", () => {
    expect(collectAnswers(OPTIONS, new Set([OTHER_ID]), "custom")).toEqual(["custom"]);
  });
});

describe("toggleSelection", () => {
  it("adds and removes ids in multi-select mode", () => {
    let s = toggleSelection(new Set<string>(), "opt-0", true);
    expect([...s]).toEqual(["opt-0"]);
    s = toggleSelection(s, "opt-1", true);
    expect(s.has("opt-0") && s.has("opt-1")).toBe(true);
    s = toggleSelection(s, "opt-0", true);
    expect(s.has("opt-0")).toBe(false);
    expect(s.has("opt-1")).toBe(true);
  });

  it("replaces the selection in single-select mode", () => {
    let s = toggleSelection(new Set(["opt-0"]), "opt-1", false);
    expect([...s]).toEqual(["opt-1"]);
  });

  it("does not mutate the input set", () => {
    const original = new Set(["opt-0"]);
    toggleSelection(original, "opt-1", true);
    expect([...original]).toEqual(["opt-0"]);
  });
});
