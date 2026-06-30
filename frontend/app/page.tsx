"use client";

import { useEffect, useRef, useState } from "react";
import { Bookmark, Github, History, MessageSquareText, Moon, Sun, Zap } from "lucide-react";

import { AnalyticsAnswerCard } from "@/components/analytics/analytics-answer-card";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatMessageList } from "@/components/chat/chat-message-list";
import { ClarificationPanel } from "@/components/chat/clarification-panel";
import { SuggestedQuestionGrid } from "@/components/analytics/suggested-question-grid";
import { HistoryView } from "@/components/chat/history-view";
import { SavedReportsView } from "@/components/analytics/saved-reports-view";
import { DemoLimitModal } from "@/components/demo/demo-limit-modal";
import type {
  AnalyticsChatResponse,
  ChatHistoryItem,
  ChatMessage,
  ClarificationAnswer,
  ClarificationQuestion
} from "@/lib/types";
import { askAnalyticsQuestion } from "@/lib/api";
import {
  HISTORY_KEY,
  buildConversationHistory,
  buildResolvedQuestion,
  dedupeHistory,
  makeHistoryEntry
} from "@/lib/history";

const CONTACT_EMAIL = "info@betterfuture.uz";
const SITE_URL = "https://betterfuture.uz";
const GITHUB_URL = "https://github.com/proga100/finpulse-ai-analytics";
const DEMO_LIMIT = 5;

type Lang = "en" | "ru";
type Tab = "chat" | "history" | "saved";

const SUGGESTED: Record<Lang, string[]> = {
  en: [
    "What is the total transaction volume?",
    "Show transaction volume by month",
    "Top merchant categories by spend",
    "Fraud rate by channel",
    "New customers per month",
    "Average balance by customer segment",
    "Loan default rate by product",
    "Top 10 customers by spend",
    "Cards by network"
  ],
  ru: [
    "Каков общий объём транзакций?",
    "Покажи объём транзакций по месяцам",
    "Топ категорий трат",
    "Доля мошенничества по каналам",
    "Новые клиенты по месяцам",
    "Средний баланс по сегментам",
    "Уровень дефолтов по кредитным продуктам",
    "Топ-10 клиентов по тратам",
    "Карты по платёжным системам"
  ]
};

const T: Record<Lang, Record<string, string>> = {
  en: {
    tagline: "AI analytics copilot",
    navChat: "Analytics Chat",
    navHistory: "Chat History",
    navSaved: "Saved Reports",
    freeQ: "free questions",
    of: "of",
    limitReached: "Demo limit reached",
    badge: "Synthetic data · live demo",
    heroPre: "Ask a fintech database",
    heroAccent: "anything",
    heroSub:
      "FinPulse turns plain-English questions into safe, read-only SQL over a synthetic neobank dataset — and streams back tables, charts, and an AI summary. Try a question:",
    composer: "Ask about transactions, fraud, customers, loans…",
    composerDisabled: "Demo limit reached — see options above ↑",
    footer: "Synthetic data · read-only · built by",
    poweredBy: "· powered by Gemini",
    thinking: "🔍 Understanding your question…",
    stopped: "⏹ Request stopped.",
    failed: "Something went wrong. Please try again."
  },
  ru: {
    tagline: "AI-аналитик",
    navChat: "Аналитический чат",
    navHistory: "История запросов",
    navSaved: "Сохранённые отчёты",
    freeQ: "вопросов",
    of: "из",
    limitReached: "Лимит демо исчерпан",
    badge: "Синтетические данные · демо",
    heroPre: "Спросите финтех-базу",
    heroAccent: "о чём угодно",
    heroSub:
      "FinPulse превращает вопросы на обычном языке в безопасный SQL только для чтения по синтетической базе необанка — и возвращает таблицы, графики и AI-ответ. Попробуйте:",
    composer: "Спросите про транзакции, мошенничество, клиентов, кредиты…",
    composerDisabled: "Лимит демо исчерпан — см. варианты выше ↑",
    footer: "Синтетические данные · только чтение · сделано",
    poweredBy: "· на базе Gemini",
    thinking: "🔍 Анализирую ваш вопрос…",
    stopped: "⏹ Запрос остановлен.",
    failed: "Что-то пошло не так. Попробуйте ещё раз."
  }
};

function saveToHistory(entry: ChatHistoryItem) {
  try {
    const raw = localStorage.getItem(HISTORY_KEY) || "[]";
    const list: ChatHistoryItem[] = JSON.parse(raw);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(dedupeHistory(list, entry)));
  } catch {}
}

export default function FinPulsePage() {
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [language, setLanguage] = useState<Lang>("en");
  const [clarification, setClarification] = useState<ClarificationQuestion | null>(null);
  const [clarificationHistory, setClarificationHistory] = useState<ClarificationAnswer[]>([]);
  const [remaining, setRemaining] = useState(DEMO_LIMIT);
  const [limitOpen, setLimitOpen] = useState(false);

  const activeQuestionRef = useRef<string>("");
  const currentResultIdRef = useRef<string>("");
  const messagesRef = useRef<ChatMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const t = T[language];

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (activeTab === "chat") {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, activeTab]);

  // Theme: default dark (set on <html> in layout); honor stored preference.
  useEffect(() => {
    try {
      const stored = localStorage.getItem("finpulse_theme");
      const th = stored === "light" ? "light" : "dark";
      setTheme(th);
      document.documentElement.classList.toggle("dark", th === "dark");
    } catch {}
  }, []);

  // Language: default EN; honor stored preference.
  useEffect(() => {
    try {
      const stored = localStorage.getItem("finpulse_lang");
      if (stored === "ru" || stored === "en") setLanguage(stored);
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

  function changeLanguage(next: Lang) {
    setLanguage(next);
    try {
      localStorage.setItem("finpulse_lang", next);
    } catch {}
  }

  async function streamAnswer(
    question: string,
    opts: { round: number; history: ClarificationAnswer[]; skip: boolean; replaySql?: string }
  ) {
    const progressMsgId = crypto.randomUUID();
    setIsLoading(true);
    setMessages((cur) => [
      ...cur,
      { id: progressMsgId, role: "assistant", content: t.thinking, isProgress: true }
    ]);

    const conversationHistory = opts.replaySql ? [] : buildConversationHistory(messagesRef.current);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await askAnalyticsQuestion(question, language, {
        clarificationRound: opts.round,
        clarificationHistory: opts.history,
        skipClarification: opts.skip,
        includeSummary: true,
        replaySql: opts.replaySql,
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
            // Persist the resolved prompt + its exact SQL for one-click replay.
            const entry = makeHistoryEntry({
              question,
              standaloneQuestion: data.standalone_question,
              clarificationHistory: opts.history,
              sql: data.sql,
              isReplay: !!opts.replaySql
            });
            if (entry) saveToHistory(entry);
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
            ? { id: crypto.randomUUID(), role: "assistant", content: aborted ? t.stopped : t.failed }
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
    setActiveTab("chat");
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

  async function rerunHistoryItem(item: ChatHistoryItem) {
    if (isLoading) return;
    setActiveTab("chat");
    if (remaining <= 0) {
      setLimitOpen(true);
      return;
    }
    if (!item.sql) {
      submitQuestion(item.question);
      return;
    }
    setClarification(null);
    activeQuestionRef.current = item.question;
    setMessages((cur) => [
      ...cur,
      { id: crypto.randomUUID(), role: "user", content: item.label || item.question }
    ]);
    await streamAnswer(item.question, { round: 0, history: [], skip: true, replaySql: item.sql });
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

  const NAV: { key: Tab; label: string; icon: typeof MessageSquareText }[] = [
    { key: "chat", label: t.navChat, icon: MessageSquareText },
    { key: "history", label: t.navHistory, icon: History },
    { key: "saved", label: t.navSaved, icon: Bookmark }
  ];

  return (
    <main className="finpulse-aura flex h-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card/40 p-4 lg:flex">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Zap className="h-5 w-5" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold">
              Fin<span className="brand-gradient-text">Pulse</span>
            </div>
            <div className="text-[11px] text-muted-foreground">{t.tagline}</div>
          </div>
        </div>

        <nav className="space-y-1">
          {NAV.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition cursor-pointer ${
                activeTab === key
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
              type="button"
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>

        <div className="mt-auto rounded-lg border border-border bg-background/40 p-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            {t.badge}
          </span>
        </div>
      </aside>

      {/* Main */}
      <section className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="z-20 border-b border-border bg-background/70 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <h2 className="truncate text-sm font-semibold">{NAV.find((n) => n.key === activeTab)?.label}</h2>
            <div className="flex items-center gap-2">
              <span
                className={`hidden rounded-full border px-2.5 py-1 text-[11px] font-medium sm:inline-flex ${
                  atLimit
                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                    : "border-border bg-card text-muted-foreground"
                }`}
              >
                {atLimit ? t.limitReached : `${remaining} ${t.of} ${DEMO_LIMIT} ${t.freeQ}`}
              </span>
              <select
                value={language}
                onChange={(e) => changeLanguage(e.target.value as Lang)}
                className="cursor-pointer rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground outline-none focus:border-primary"
                aria-label="Language"
              >
                <option value="en">EN</option>
                <option value="ru">RU</option>
              </select>
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

          {/* Mobile tab bar */}
          <div className="flex gap-1 border-t border-border px-2 py-1.5 lg:hidden">
            {NAV.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition ${
                  activeTab === key ? "bg-primary/10 text-primary" : "text-muted-foreground"
                }`}
                type="button"
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </header>

        {/* Chat tab */}
        {activeTab === "chat" && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div ref={scrollRef} className="flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-4xl px-4 py-6">
                {empty ? (
                  <section className="pt-2">
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                      {t.badge}
                    </div>
                    <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                      {t.heroPre} <span className="brand-gradient-text">{t.heroAccent}</span>.
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                      {t.heroSub}
                    </p>
                    <div className="mt-6">
                      <SuggestedQuestionGrid questions={SUGGESTED[language]} onSelect={submitQuestion} disabled={atLimit} />
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
                      return (
                        <AnalyticsAnswerCard
                          response={analytics}
                          question={q}
                          language={language}
                          summaryPending={summaryPending}
                        />
                      );
                    }}
                  />
                )}
              </div>
            </div>

            {/* Composer dock */}
            <div className="border-t border-border bg-background/85 backdrop-blur">
              <div className="mx-auto flex w-full max-w-4xl flex-col gap-2.5 px-4 py-3">
                {clarification && (
                  <ClarificationPanel
                    clarification={clarification}
                    language={language}
                    isLoading={isLoading}
                    onSubmit={handleClarificationSubmit}
                    onSkip={handleClarificationSkip}
                  />
                )}
                <ChatComposer
                  isLoading={isLoading}
                  disabled={atLimit}
                  placeholder={atLimit ? t.composerDisabled : t.composer}
                  onSubmit={submitQuestion}
                  onStop={stopRequest}
                />
                <p className="text-center text-[11px] text-muted-foreground">
                  {t.footer}{" "}
                  <a href={SITE_URL} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                    betterfuture.uz
                  </a>{" "}
                  {t.poweredBy}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* History tab */}
        {activeTab === "history" && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <HistoryView language={language} onSelectItem={rerunHistoryItem} />
          </div>
        )}

        {/* Saved reports tab */}
        {activeTab === "saved" && (
          <div className="min-h-0 flex-1">
            <SavedReportsView language={language} />
          </div>
        )}
      </section>

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
