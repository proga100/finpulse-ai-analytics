"use client";

import { useEffect, useRef, useState } from "react";
import { Github, Moon, Sun, Zap } from "lucide-react";

import { AnalyticsAnswerCard } from "@/components/analytics/analytics-answer-card";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatMessageList } from "@/components/chat/chat-message-list";
import { ClarificationPanel } from "@/components/chat/clarification-panel";
import { SuggestedQuestionGrid } from "@/components/analytics/suggested-question-grid";
import { DemoLimitModal } from "@/components/demo/demo-limit-modal";
import type {
  AnalyticsChatResponse,
  ChatMessage,
  ClarificationAnswer,
  ClarificationQuestion
} from "@/lib/types";
import { askAnalyticsQuestion } from "@/lib/api";
import { buildConversationHistory, buildResolvedQuestion } from "@/lib/history";

const CONTACT_EMAIL = "info@betterfuture.uz";
const SITE_URL = "https://betterfuture.uz";
const GITHUB_URL = "https://github.com/proga100/finpulse-ai-analytics";
const DEMO_LIMIT = 5;

const SUGGESTED = [
  "What is the total transaction volume?",
  "Show transaction volume by month",
  "Top merchant categories by spend",
  "Fraud rate by channel",
  "New customers per month",
  "Average balance by customer segment",
  "Loan default rate by product",
  "Top 10 customers by spend",
  "Cards by network"
];

export default function FinPulsePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [clarification, setClarification] = useState<ClarificationQuestion | null>(null);
  const [clarificationHistory, setClarificationHistory] = useState<ClarificationAnswer[]>([]);
  const [remaining, setRemaining] = useState(DEMO_LIMIT);
  const [limitOpen, setLimitOpen] = useState(false);

  const activeQuestionRef = useRef<string>("");
  const currentResultIdRef = useRef<string>("");
  const messagesRef = useRef<ChatMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Theme: default dark (set on <html> in layout); honor stored preference.
  useEffect(() => {
    try {
      const stored = localStorage.getItem("finpulse_theme");
      const t = stored === "light" ? "light" : "dark";
      setTheme(t);
      document.documentElement.classList.toggle("dark", t === "dark");
    } catch {}
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("finpulse_theme", next);
    } catch {}
    document.documentElement.classList.toggle("dark", next === "dark");
  }

  async function streamAnswer(
    question: string,
    opts: { round: number; history: ClarificationAnswer[]; skip: boolean }
  ) {
    const progressMsgId = crypto.randomUUID();
    setIsLoading(true);
    setMessages((cur) => [
      ...cur,
      { id: progressMsgId, role: "assistant", content: "🔍 Understanding your question…", isProgress: true }
    ]);

    const conversationHistory = buildConversationHistory(messagesRef.current);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await askAnalyticsQuestion(question, "en", {
        clarificationRound: opts.round,
        clarificationHistory: opts.history,
        skipClarification: opts.skip,
        includeSummary: true,
        conversationHistory,
        signal: controller.signal
      });
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No readable stream response received.");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let payload: any;
          try {
            payload = JSON.parse(line.slice(6).trim());
          } catch {
            continue;
          }

          if (payload.event === "progress") {
            setMessages((cur) =>
              cur.map((m) => (m.id === progressMsgId ? { ...m, content: payload.message } : m))
            );
          } else if (payload.event === "clarification") {
            setMessages((cur) => cur.filter((m) => m.id !== progressMsgId));
            setClarification(payload.data as ClarificationQuestion);
          } else if (payload.event === "limit_reached") {
            setMessages((cur) => cur.filter((m) => m.id !== progressMsgId));
            setRemaining(0);
            setLimitOpen(true);
          } else if (payload.event === "demo_status") {
            setRemaining(payload.data.remaining);
            if (payload.data.remaining <= 0) setLimitOpen(true);
          } else if (payload.event === "result") {
            const data = payload.data as AnalyticsChatResponse;
            const pending = payload.summary_pending === true;
            const resultId = crypto.randomUUID();
            currentResultIdRef.current = resultId;
            const standalone = data.standalone_question?.trim() || null;
            const resolvedQuestion = standalone || buildResolvedQuestion(question, opts.history);
            setMessages((cur) =>
              cur.map((m) =>
                m.id === progressMsgId
                  ? {
                      id: resultId,
                      role: "assistant",
                      content: data.summary,
                      analytics: data,
                      summaryPending: pending,
                      resolvedQuestion
                    }
                  : m
              )
            );
          } else if (payload.event === "summary") {
            const text = payload.data?.summary ?? "";
            const targetId = currentResultIdRef.current;
            setMessages((cur) =>
              cur.map((m) =>
                m.id === targetId
                  ? {
                      ...m,
                      content: text,
                      analytics: m.analytics ? { ...m.analytics, summary: text } : m.analytics,
                      summaryPending: false
                    }
                  : m
              )
            );
          }
        }
      }
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === "AbortError";
      setMessages((cur) =>
        cur.map((m) =>
          m.id === progressMsgId
            ? {
                id: crypto.randomUUID(),
                role: "assistant",
                content: aborted ? "⏹ Request stopped." : "Something went wrong. Please try again."
              }
            : m
        )
      );
    } finally {
      abortRef.current = null;
      setIsLoading(false);
    }
  }

  function stopRequest() {
    abortRef.current?.abort();
  }

  async function submitQuestion(question: string) {
    const trimmed = question.trim();
    if (!trimmed || isLoading) return;
    if (remaining <= 0) {
      setLimitOpen(true);
      return;
    }
    setClarification(null);
    setClarificationHistory([]);
    activeQuestionRef.current = trimmed;
    setMessages((cur) => [...cur, { id: crypto.randomUUID(), role: "user", content: trimmed }]);
    await streamAnswer(trimmed, { round: 0, history: [], skip: false });
  }

  async function handleClarificationSubmit(answer: ClarificationAnswer) {
    if (isLoading || !clarification) return;
    const nextRound = clarification.round + 1;
    const nextHistory = [...clarificationHistory, answer];
    setMessages((cur) => [
      ...cur,
      { id: crypto.randomUUID(), role: "user", content: answer.answers.join(", ") }
    ]);
    setClarification(null);
    setClarificationHistory(nextHistory);
    await streamAnswer(activeQuestionRef.current, { round: nextRound, history: nextHistory, skip: false });
  }

  async function handleClarificationSkip() {
    if (isLoading || !clarification) return;
    setClarification(null);
    await streamAnswer(activeQuestionRef.current, {
      round: clarification.round,
      history: clarificationHistory,
      skip: true
    });
  }

  const atLimit = remaining <= 0;
  const empty = messages.length === 0;

  return (
    <main className="finpulse-aura flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* Header */}
      <header className="z-20 border-b border-border bg-background/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Zap className="h-5 w-5" />
            </span>
            <div className="leading-tight">
              <div className="text-sm font-semibold">
                Fin<span className="brand-gradient-text">Pulse</span>
              </div>
              <div className="text-[11px] text-muted-foreground">AI analytics copilot</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`hidden rounded-full border px-2.5 py-1 text-[11px] font-medium sm:inline-flex ${
                atLimit
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-border bg-card text-muted-foreground"
              }`}
              title="This is a demo with a per-session question limit"
            >
              {atLimit ? "Demo limit reached" : `${remaining} of ${DEMO_LIMIT} free questions`}
            </span>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:text-foreground"
              aria-label="Source on GitHub"
            >
              <Github className="h-4 w-4" />
            </a>
            <button
              onClick={toggleTheme}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:text-foreground"
              aria-label="Toggle theme"
              type="button"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-4 py-6 pb-40">
          {empty ? (
            <section className="pt-6">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Synthetic data · live demo
              </div>
              <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                Ask a fintech database <span className="brand-gradient-text">anything</span>.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                FinPulse turns plain-English questions into safe, read-only SQL over a synthetic neobank
                dataset — and streams back tables, charts, and an AI summary. Try a question:
              </p>
              <div className="mt-6">
                <SuggestedQuestionGrid questions={SUGGESTED} onSelect={submitQuestion} disabled={atLimit} />
              </div>
            </section>
          ) : (
            <ChatMessageList
              messages={messages}
              renderAnalytics={(analytics, index, summaryPending) => {
                let q = "";
                for (let i = index - 1; i >= 0; i--) {
                  if (messages[i].role === "user") {
                    q = messages[i].content;
                    break;
                  }
                }
                return <AnalyticsAnswerCard response={analytics} question={q} summaryPending={summaryPending} />;
              }}
            />
          )}
        </div>
      </div>

      {/* Composer dock */}
      <div className="absolute inset-x-0 bottom-0 z-10 border-t border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-2.5 px-4 py-3">
          {clarification && (
            <ClarificationPanel
              clarification={clarification}
              language="en"
              isLoading={isLoading}
              onSubmit={handleClarificationSubmit}
              onSkip={handleClarificationSkip}
            />
          )}
          <ChatComposer
            isLoading={isLoading}
            disabled={atLimit}
            onSubmit={submitQuestion}
            onStop={stopRequest}
          />
          <p className="text-center text-[11px] text-muted-foreground">
            Synthetic data · read-only · built by{" "}
            <a href={SITE_URL} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
              betterfuture.uz
            </a>{" "}
            · powered by Gemini
          </p>
        </div>
      </div>

      <DemoLimitModal
        open={limitOpen}
        used={DEMO_LIMIT}
        limit={DEMO_LIMIT}
        contactEmail={CONTACT_EMAIL}
        siteUrl={SITE_URL}
        githubUrl={GITHUB_URL}
        onClose={() => setLimitOpen(false)}
      />
    </main>
  );
}
