"use client";

import { useEffect, useState } from "react";
import { Clock, History, Play, Trash2 } from "lucide-react";

import type { ChatHistoryItem } from "@/lib/types";
import { HISTORY_KEY } from "@/lib/history";

const T = {
  en: {
    empty: "No query history yet",
    emptyDesc: "Ask questions in Analytics Chat to build up your history.",
    recent: "Recent queries",
    clearAll: "Clear all",
    clearConfirm: "Clear your entire chat history?",
    delete: "Delete from history",
    run: "Run query",
    ready: "ready to use"
  },
  ru: {
    empty: "История запросов пуста",
    emptyDesc: "Задавайте вопросы в аналитическом чате, чтобы наполнить историю.",
    recent: "Недавние запросы",
    clearAll: "Очистить всё",
    clearConfirm: "Очистить всю историю чата?",
    delete: "Удалить из истории",
    run: "Запустить запрос",
    ready: "готов к запуску"
  }
} as const;

export function HistoryView({
  language,
  onSelectItem
}: {
  language: "en" | "ru";
  onSelectItem: (item: ChatHistoryItem) => void;
}) {
  const [history, setHistory] = useState<ChatHistoryItem[]>([]);
  const t = T[language] || T.en;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }, []);

  const deleteItem = (e: React.MouseEvent, timestamp: number) => {
    e.stopPropagation();
    try {
      const updated = history.filter((it) => it.timestamp !== timestamp);
      setHistory(updated);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    } catch {}
  };

  const clearAll = () => {
    if (!confirm(t.clearConfirm)) return;
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch {}
    setHistory([]);
  };

  if (history.length === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <History className="h-6 w-6" />
        </div>
        <h3 className="text-sm font-semibold">{t.empty}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t.emptyDesc}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
        <h3 className="text-sm font-semibold">{t.recent}</h3>
        <button
          onClick={clearAll}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-destructive cursor-pointer"
          type="button"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t.clearAll}
        </button>
      </div>

      <div className="space-y-2">
        {history.map((item) => (
          <div
            key={item.id || item.timestamp}
            onClick={() => onSelectItem(item)}
            title={item.label || item.question}
            className="group flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 transition hover:border-primary/50 cursor-pointer"
          >
            <div className="flex min-w-0 items-start gap-3">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{item.label || item.question}</p>
                <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  {item.sql && (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      {t.ready}
                    </span>
                  )}
                  {new Date(item.timestamp).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={(e) => deleteItem(e, item.timestamp)}
                className="rounded p-1.5 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100 cursor-pointer"
                type="button"
                title={t.delete}
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                className="rounded bg-muted p-1.5 text-muted-foreground transition group-hover:bg-primary group-hover:text-primary-foreground cursor-pointer"
                type="button"
                title={t.run}
              >
                <Play className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
