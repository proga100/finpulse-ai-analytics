export type AnalyticsRow = Record<string, string | number | boolean | null>;

export type AnalyticsChatResponse = {
  summary: string;
  sql: string | null;
  columns: string[];
  rows: AnalyticsRow[];
  chart: {
    type: "none" | "bar" | "line" | "pie";
    x: string | null;
    y: string | null;
  };
  show_table: boolean;
  metadata: {
    execution_time_ms: number;
    row_count: number;
    safe: boolean;
  };
  // Follow-up turns: self-contained rewrite that reproduces this result alone.
  standalone_question?: string | null;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  analytics?: AnalyticsChatResponse;
  isProgress?: boolean;
  summaryPending?: boolean;
  // The fully resolved question that produced this result, used as follow-up context.
  resolvedQuestion?: string;
};

export type ClarificationOption = {
  id: string;
  label: string;
};

export type ClarificationQuestion = {
  question: string;
  options: ClarificationOption[];
  allow_multi: boolean;
  allow_other: boolean;
  round: number;
  max_rounds: number;
};

export type ClarificationAnswer = {
  question: string;
  answers: string[];
};

export type ChatHistoryItem = {
  id?: string;
  question: string;
  label?: string;
  clarificationHistory?: ClarificationAnswer[];
  sql?: string;
  timestamp: number;
};

// Demo gate: server-authoritative quota status streamed over SSE.
export type DemoStatus = {
  used: number;
  limit: number;
  remaining: number;
};
