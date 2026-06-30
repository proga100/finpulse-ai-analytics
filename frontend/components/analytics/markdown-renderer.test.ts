import { describe, it, expect } from "vitest";
import { parseMarkdown, parseBoldText } from "./markdown-parser";

describe("parseBoldText", () => {
  it("parses text without bold tags", () => {
    const result = parseBoldText("Hello world");
    expect(result).toEqual(["Hello world"]);
  });

  it("parses single bold word", () => {
    const result = parseBoldText("Hello **world**!");
    expect(result).toHaveLength(3);
    expect(result[0]).toBe("Hello ");
    expect(result[1]).toEqual({ type: "strong", content: "world" });
    expect(result[2]).toBe("!");
  });

  it("parses multiple bold blocks", () => {
    const result = parseBoldText("**First** and **second**");
    expect(result).toHaveLength(3); // ["First" bold, " and ", "second" bold]
    expect(result[0]).toEqual({ type: "strong", content: "First" });
    expect(result[1]).toBe(" and ");
    expect(result[2]).toEqual({ type: "strong", content: "second" });
  });
});

describe("parseMarkdown", () => {
  it("renders empty list for empty text", () => {
    const result = parseMarkdown("");
    expect(result).toEqual([]);
  });

  it("splits paragraphs on newlines", () => {
    const result = parseMarkdown("Paragraph 1\nParagraph 2");
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("p");
    expect(result[0].children[0]).toBe("Paragraph 1");
    expect(result[1].type).toBe("p");
    expect(result[1].children[0]).toBe("Paragraph 2");
  });

  it("renders bulleted lists", () => {
    const result = parseMarkdown("* item one\n- item two");
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("bullet");
    expect(result[0].children[0]).toBe("item one");
    expect(result[1].type).toBe("bullet");
    expect(result[1].children[0]).toBe("item two");
  });

  it("renders numbered lists", () => {
    const result = parseMarkdown("1. first step\n2. second step");
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("number");
    expect((result[0] as any).prefix).toBe("1.");
    expect(result[0].children[0]).toBe("first step");
    expect(result[1].type).toBe("number");
    expect((result[1] as any).prefix).toBe("2.");
    expect(result[1].children[0]).toBe("second step");
  });
});
