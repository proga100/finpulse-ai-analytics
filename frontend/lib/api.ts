import type { ClarificationAnswer } from "@/lib/types";

const SESSION_KEY = "finpulse_session_id";

/** Stable per-browser id used by the server-side demo quota (with an IP backstop). */
export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

export async function askAnalyticsQuestion(
  question: string,
  language: string = "en",
  options: {
    clarificationRound?: number;
    clarificationHistory?: ClarificationAnswer[];
    skipClarification?: boolean;
    includeSummary?: boolean;
    conversationHistory?: { question: string; sql: string | null }[];
    signal?: AbortSignal;
  } = {}
): Promise<Response> {
  const response = await fetch("/api/analytics-chat", {
    method: "POST",
    signal: options.signal,
    headers: {
      "Content-Type": "application/json",
      "X-Demo-Session": getSessionId()
    },
    body: JSON.stringify({
      question,
      language,
      user_id: "demo-user",
      role: "ADMIN",
      clarification_round: options.clarificationRound ?? 0,
      clarification_history: options.clarificationHistory ?? [],
      skip_clarification: options.skipClarification ?? false,
      include_summary: options.includeSummary ?? null,
      conversation_history: options.conversationHistory ?? []
    })
  });

  if (!response.ok) {
    throw new Error("The analytics backend rejected the request.");
  }

  return response;
}
