import { describe, it, expect } from "vitest";
import { shouldScrollToBottom } from "./scroll-helper";

describe("shouldScrollToBottom", () => {
  it("returns true when exactly at the bottom", () => {
    // scrollHeight = 1000, clientHeight = 400, scrollTop = 600 (at bottom)
    const result = shouldScrollToBottom(1000, 600, 400);
    expect(result).toBe(true);
  });

  it("returns true when close to the bottom (within default 150px threshold)", () => {
    // scrollHeight = 1000, clientHeight = 400, scrollTop = 500 (100px from bottom)
    const result = shouldScrollToBottom(1000, 500, 400);
    expect(result).toBe(true);
  });

  it("returns false when scrolled far above the bottom (e.g. user reading history)", () => {
    // scrollHeight = 1000, clientHeight = 400, scrollTop = 300 (300px from bottom)
    const result = shouldScrollToBottom(1000, 300, 400);
    expect(result).toBe(false);
  });

  it("respects a custom threshold", () => {
    // scrollHeight = 1000, clientHeight = 400, scrollTop = 500 (100px from bottom)
    // with 50px threshold, it should return false
    const result = shouldScrollToBottom(1000, 500, 400, 50);
    expect(result).toBe(false);

    // with 120px threshold, it should return true
    const result2 = shouldScrollToBottom(1000, 500, 400, 120);
    expect(result2).toBe(true);
  });

  it("returns true if scroll heights are invalid or zero to default safe-scrolling", () => {
    const result = shouldScrollToBottom(0, 0, 0);
    expect(result).toBe(true);
  });
});
