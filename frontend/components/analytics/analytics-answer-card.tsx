"use client";

import { useEffect, useState } from "react";
import { Bookmark, BookmarkCheck, Code2, Download, Loader2, ShieldCheck, Sparkles } from "lucide-react";

import { AnalyticsResultTable } from "@/components/analytics/analytics-result-table";
import { AnalyticsChart } from "@/components/analytics/analytics-chart";
import { MarkdownRenderer } from "./markdown-renderer";
import type { AnalyticsChatResponse } from "@/lib/types";
import { downloadCSV } from "@/lib/utils";
import { SAVED_REPORTS_KEY } from "@/lib/saved-reports";

const MONEY_HINTS = ["volume", "amount", "balance", "spend", "principal", "portfolio", "revenue"];
const PCT_HINTS = ["pct", "rate", "percent", "ratio"];

const T = {
  en: {
    aiSummary: "AI summary",
    writing: "Writing summary…",
    rowsUnit: (n: number) => `${n} row${n === 1 ? "" : "s"}`,
    readOnly: "read-only",
    viewSql: "View SQL",
    hideSql: "Hide SQL",
    save: "Save",
    saved: "Saved"
  },
  ru: {
    aiSummary: "AI-ответ",
    writing: "Формируется ответ…",
    rowsUnit: (n: number) => `${n} строк`,
    readOnly: "только чтение",
    viewSql: "Показать SQL",
    hideSql: "Скрыть SQL",
    save: "Сохранить",
    saved: "Сохранено"
  }
} as const;

function prettyLabel(col: string): string {
  return col.replace(/_/g, " ").replace(/\bpct\b/gi, "%").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatStat(col: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  const lc = col.toLowerCase();
  if (typeof value === "number") {
    if (PCT_HINTS.some((h) => lc.includes(h))) return `${value.toFixed(2)}%`;
    const compact = Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 }).format(value);
    if (MONEY_HINTS.some((h) => lc.includes(h))) return `$${compact}`;
    return Number.isInteger(value) ? Intl.NumberFormat("en").format(value) : compact;
  }
  return String(value);
}

export function AnalyticsAnswerCard({
  response,
  question = "",
  language = "en",
  summaryPending = false
}: {
  response: AnalyticsChatResponse;
  question?: string;
  language?: "en" | "ru";
  summaryPending?: boolean;
}) {
  const [showSql, setShowSql] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const t = T[language] || T.en;

  const hasRows = response.rows.length > 0;
  const isSingleRow = response.rows.length === 1;
  const showChart = response.chart.type !== "none" && hasRows;
  const showTable = response.show_table !== false && hasRows && !isSingleRow;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_REPORTS_KEY);
      if (!raw) return;
      const list = JSON.parse(raw);
      setIsSaved(
        list.some(
          (it: any) => it.response?.sql === response.sql && it.response?.summary === response.summary
        )
      );
    } catch {}
  }, [response]);

  const handleExportCSV = () => {
    const filename = (question || "finpulse_export").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_");
    downloadCSV(filename, response.columns, response.rows);
  };

  const handleSave = () => {
    if (isSaved) return;
    try {
      const raw = localStorage.getItem(SAVED_REPORTS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const name =
        question || (response.summary ? response.summary.slice(0, 60) : "Analytics report");
      list.unshift({
        id: crypto.randomUUID(),
        name,
        question: question || name,
        savedAt: Date.now(),
        response
      });
      localStorage.setItem(SAVED_REPORTS_KEY, JSON.stringify(list.slice(0, 100)));
      setIsSaved(true);
    } catch {}
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm animate-fade-in-up">
      {/* Summary callout */}
      {(response.summary || summaryPending) && (
        <div className="border-b border-border bg-primary/[0.04] p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-primary">
            <Sparkles className="h-4 w-4" />
            {t.aiSummary}
          </div>
          {response.summary ? (
            <MarkdownRenderer text={response.summary} />
          ) : (
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>{t.writing}</span>
            </div>
          )}
        </div>
      )}

      {/* KPI tiles for single-row answers */}
      {isSingleRow && (
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {response.columns.map((col) => (
            <div key={col} className="rounded-lg border border-border bg-background/50 p-4">
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {prettyLabel(col)}
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {formatStat(col, response.rows[0][col])}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      {showChart && <div className="px-4 pt-1">{<AnalyticsChart response={response} />}</div>}

      {/* Table */}
      {showTable && (
        <div className="p-4">
          <AnalyticsResultTable columns={response.columns} rows={response.rows} />
        </div>
      )}

      {/* Footer: metadata + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-accent" />
          {t.rowsUnit(response.metadata.row_count)} · {response.metadata.execution_time_ms} ms · {t.readOnly}
        </span>
        <div className="flex items-center gap-2">
          {hasRows && (
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-foreground transition hover:bg-muted/60 cursor-pointer"
              type="button"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>
          )}
          {hasRows && (
            <button
              onClick={handleSave}
              disabled={isSaved}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 transition cursor-pointer ${
                isSaved
                  ? "border-accent/30 bg-accent/10 text-accent cursor-default"
                  : "border-border text-foreground hover:bg-muted/60"
              }`}
              type="button"
            >
              {isSaved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
              {isSaved ? t.saved : t.save}
            </button>
          )}
          {response.sql && (
            <button
              onClick={() => setShowSql((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 transition cursor-pointer ${
                showSql ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-foreground hover:bg-muted/60"
              }`}
              type="button"
            >
              <Code2 className="h-3.5 w-3.5" />
              {showSql ? t.hideSql : t.viewSql}
            </button>
          )}
        </div>
      </div>

      {showSql && response.sql && (
        <div className="border-t border-border px-4 py-3">
          <pre className="w-full max-w-full overflow-x-auto rounded-lg bg-background/70 p-3 font-mono text-[11.5px] leading-relaxed text-muted-foreground">
            {response.sql}
          </pre>
        </div>
      )}
    </div>
  );
}
