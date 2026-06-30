import { describe, it, expect } from "vitest";
import {
  buildConversationHistory,
  buildResolvedQuestion,
  dedupeHistory,
  makeHistoryEntry
} from "./history";
import type { ChatHistoryItem, ChatMessage } from "./types";

// Helper: build a ChatMessage quickly.
const userMsg = (content: string): ChatMessage => ({ id: content, role: "user", content });
const botMsg = (sql: string | null, resolvedQuestion?: string): ChatMessage => ({
  id: `bot-${sql}`,
  role: "assistant",
  content: "",
  analytics: {
    summary: "",
    sql,
    columns: [],
    rows: [],
    chart: { type: "none", x: null, y: null },
    show_table: true,
    metadata: { execution_time_ms: 0, row_count: 0, safe: true }
  },
  resolvedQuestion
});

describe("makeHistoryEntry", () => {
  it("saves a follow-up using its standalone question (so it replays alone)", () => {
    const e = makeHistoryEntry({
      question: "только имена",
      standaloneQuestion: "список пользователей только с именами",
      sql: "SELECT fullname FROM uz.tenant_users",
      now: 1,
      id: "a"
    });
    expect(e).toEqual({
      id: "a",
      question: "список пользователей только с именами",
      label: "список пользователей только с именами",
      sql: "SELECT fullname FROM uz.tenant_users",
      timestamp: 1
    });
  });

  it("saves a clarified question in resolved form", () => {
    const e = makeHistoryEntry({
      question: "list of users",
      clarificationHistory: [{ question: "Какой список?", answers: ["Активные"] }],
      sql: "SELECT 1",
      now: 2,
      id: "b"
    });
    expect(e?.label).toBe("list of users | Какой список?: Активные");
    expect(e?.question).toBe("list of users");
  });

  it("saves a plain first question as raw", () => {
    const e = makeHistoryEntry({ question: "список пользователей", sql: "SELECT 1", now: 3, id: "c" });
    expect(e).toEqual({ id: "c", question: "список пользователей", sql: "SELECT 1", timestamp: 3 });
  });

  it("returns null for a SQL replay (nothing new to save)", () => {
    expect(makeHistoryEntry({ question: "x", isReplay: true })).toBeNull();
  });

  it("ignores an empty/whitespace standalone and falls back to raw", () => {
    const e = makeHistoryEntry({ question: "только телефоны", standaloneQuestion: "   ", now: 4, id: "d" });
    expect(e?.question).toBe("только телефоны");
    expect(e?.label).toBeUndefined();
  });

  it("normalizes empty sql to undefined", () => {
    const e = makeHistoryEntry({ question: "q", sql: null, now: 5, id: "e" });
    expect(e?.sql).toBeUndefined();
  });
});

describe("dedupeHistory — distinct follow-ups all remain in history", () => {
  it("keeps two DIFFERENT standalone prompts as separate entries", () => {
    let list: ChatHistoryItem[] = [];
    list = dedupeHistory(
      list,
      makeHistoryEntry({ question: "только имена", standaloneQuestion: "пользователи только с именами", now: 1, id: "1" })!
    );
    list = dedupeHistory(
      list,
      makeHistoryEntry({ question: "только телефоны", standaloneQuestion: "пользователи только с телефонами", now: 2, id: "2" })!
    );
    expect(list).toHaveLength(2);
    expect(list.map((i) => i.label)).toEqual([
      "пользователи только с телефонами",
      "пользователи только с именами"
    ]);
  });

  it("collapses two EQUIVALENT prompts into one most-recent entry (no silent loss)", () => {
    let list: ChatHistoryItem[] = [];
    list = dedupeHistory(
      list,
      makeHistoryEntry({ question: "именами и телефонами", standaloneQuestion: "пользователи с именами и телефонами", now: 1, id: "1" })!
    );
    list = dedupeHistory(
      list,
      makeHistoryEntry({ question: "только именами и телефонами", standaloneQuestion: "пользователи с именами и телефонами", now: 2, id: "2" })!
    );
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("2"); // newest kept, on top
    expect(list[0].label).toBe("пользователи с именами и телефонами");
  });

  it("gives every entry a unique id even when saved in the same millisecond", () => {
    let list: ChatHistoryItem[] = [];
    const a = makeHistoryEntry({ question: "a", standaloneQuestion: "только имена", now: 100 })!;
    const b = makeHistoryEntry({ question: "b", standaloneQuestion: "только телефоны", now: 100 })!;
    list = dedupeHistory(dedupeHistory(list, a), b);
    expect(list[0].id).not.toEqual(list[1].id);
    expect(list[0].timestamp).toBe(list[1].timestamp);
  });

  it("caps the list length", () => {
    let list: ChatHistoryItem[] = [];
    for (let i = 0; i < 5; i++) {
      list = dedupeHistory(list, { id: `${i}`, question: `q${i}`, timestamp: i }, 3);
    }
    expect(list).toHaveLength(3);
    expect(list.map((i) => i.question)).toEqual(["q4", "q3", "q2"]);
  });
});

describe("buildResolvedQuestion", () => {
  it("returns the question unchanged without clarification", () => {
    expect(buildResolvedQuestion("list of users")).toBe("list of users");
  });
  it("folds clarification answers", () => {
    expect(
      buildResolvedQuestion("list of users", [{ question: "Какой?", answers: ["Активные", "Все"] }])
    ).toBe("list of users | Какой?: Активные, Все");
  });
});

describe("buildConversationHistory", () => {
  it("pairs each result's resolved question with its SQL, last 3, sql-only", () => {
    const messages: ChatMessage[] = [
      userMsg("list of users"),
      userMsg("Активные"), // clarification echo
      botMsg("SELECT * FROM users", "list of users | Какой?: Активные"),
      userMsg("только телефоны"),
      botMsg("SELECT phone FROM users", "пользователи только с телефонами"),
      userMsg("greeting"),
      botMsg(null) // chat response, no sql -> skipped
    ];
    const turns = buildConversationHistory(messages);
    expect(turns).toEqual([
      { question: "list of users | Какой?: Активные", sql: "SELECT * FROM users" },
      { question: "пользователи только с телефонами", sql: "SELECT phone FROM users" }
    ]);
  });

  it("falls back to the last user bubble when no resolvedQuestion", () => {
    const turns = buildConversationHistory([userMsg("raw q"), botMsg("SELECT 1")]);
    expect(turns).toEqual([{ question: "raw q", sql: "SELECT 1" }]);
  });

  it("keeps only the most recent `limit` turns", () => {
    const messages: ChatMessage[] = [];
    for (let i = 0; i < 5; i++) {
      messages.push(userMsg(`q${i}`), botMsg(`SELECT ${i}`, `q${i}`));
    }
    const turns = buildConversationHistory(messages, 2);
    expect(turns.map((t) => t.sql)).toEqual(["SELECT 3", "SELECT 4"]);
  });
});
