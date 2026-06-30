import type { ChatHistoryItem, ChatMessage, ClarificationAnswer } from "@/lib/types";

/** localStorage key holding the recent-queries list. */
export const HISTORY_KEY = "finpulse_analytics_chat_history";

/** Max number of history entries kept. */
export const HISTORY_CAP = 100;

let _idCounter = 0;

/** Stable unique id for a history entry / React key. */
export function genHistoryId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  _idCounter += 1;
  return `h-${_idCounter}`;
}

/**
 * Resolved prompt = original question folded with any clarification answers,
 * in the same "question | clarifyingQ: answer | ..." shape sent to the LLM.
 */
export function buildResolvedQuestion(
  question: string,
  clarificationHistory?: ClarificationAnswer[]
): string {
  const parts = [question];
  for (const h of clarificationHistory ?? []) {
    const ans = h.answers.join(", ");
    if (ans) parts.push(`${h.question}: ${ans}`);
  }
  return parts.join(" | ");
}

export type MakeHistoryEntryParams = {
  question: string;
  /** Self-contained rewrite returned by the backend for a follow-up turn. */
  standaloneQuestion?: string | null;
  clarificationHistory?: ClarificationAnswer[];
  sql?: string | null;
  /** A direct SQL replay does not create a new history entry. */
  isReplay?: boolean;
  /** Injected for deterministic tests; defaults to Date.now(). */
  now?: number;
  id?: string;
};

/**
 * Decide what (if anything) to persist to history for a completed result.
 *
 * Priority:
 *  1. A follow-up's self-contained `standaloneQuestion` (so it replays alone).
 *  2. A clarified question -> its resolved "question | answer" form.
 *  3. Otherwise the raw question.
 * Returns null for a SQL replay (nothing new to save).
 */
export function makeHistoryEntry(p: MakeHistoryEntryParams): ChatHistoryItem | null {
  if (p.isReplay) return null;

  const sql = p.sql || undefined;
  const id = p.id ?? genHistoryId();
  const timestamp = p.now ?? Date.now();
  const standalone = p.standaloneQuestion?.trim() || null;

  if (standalone) {
    return { id, question: standalone, label: standalone, sql, timestamp };
  }
  if (p.clarificationHistory && p.clarificationHistory.length > 0) {
    return {
      id,
      question: p.question,
      label: buildResolvedQuestion(p.question, p.clarificationHistory),
      clarificationHistory: p.clarificationHistory,
      sql,
      timestamp
    };
  }
  return { id, question: p.question, sql, timestamp };
}

/**
 * Insert `entry` at the front of `list`, removing any existing item that
 * resolves to the same query (by label||question), and cap the length.
 *
 * Distinct prompts (distinct standalone text) are all kept; only truly
 * equivalent queries collapse into a single, most-recent entry.
 */
export function dedupeHistory(
  list: ChatHistoryItem[],
  entry: ChatHistoryItem,
  cap = HISTORY_CAP
): ChatHistoryItem[] {
  const key = (it: ChatHistoryItem) => it.label || it.question;
  const deduped = list.filter((it) => key(it) !== key(entry));
  deduped.unshift(entry);
  return deduped.slice(0, cap);
}

/**
 * Build the follow-up context (recent question -> SQL turns) from the
 * transcript, preferring each result's resolved/standalone question over the
 * raw last user bubble (which may be a clarification-answer echo). Only turns
 * that produced SQL are included, capped to the most recent `limit`.
 */
export function buildConversationHistory(
  messages: ChatMessage[],
  limit = 3
): { question: string; sql: string | null }[] {
  const turns: { question: string; sql: string | null }[] = [];
  let lastUser = "";
  for (const m of messages) {
    if (m.role === "user") {
      lastUser = m.content;
    } else if (m.analytics?.sql) {
      turns.push({ question: m.resolvedQuestion || lastUser, sql: m.analytics.sql });
    }
  }
  return turns.slice(-limit);
}
