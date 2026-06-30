"use client";

import { useEffect, useState } from "react";
import { Bookmark, Code2, Download, Trash2 } from "lucide-react";

import { AnalyticsResultTable } from "@/components/analytics/analytics-result-table";
import { MarkdownRenderer } from "@/components/analytics/markdown-renderer";
import { downloadCSV } from "@/lib/utils";
import { loadSavedReports, saveSavedReports, type SavedReport } from "@/lib/saved-reports";

const T = {
  en: {
    empty: "No saved reports yet",
    emptyDesc: "Click Save on any answer to keep it here.",
    count: (n: number) => `Saved reports (${n})`,
    query: "Query",
    csv: "CSV",
    delete: "Delete",
    deleteConfirm: "Delete this saved report?",
    rows: "Rows",
    duration: "Duration",
    status: "Status",
    safe: "Validated safe",
    showSql: "Show SQL",
    pick: "Select a report to view details."
  },
  ru: {
    empty: "Нет сохранённых отчётов",
    emptyDesc: "Нажмите «Сохранить» на любом ответе, чтобы он появился здесь.",
    count: (n: number) => `Сохранённые отчёты (${n})`,
    query: "Запрос",
    csv: "CSV",
    delete: "Удалить",
    deleteConfirm: "Удалить этот сохранённый отчёт?",
    rows: "Строк",
    duration: "Время",
    status: "Статус",
    safe: "Проверено и безопасно",
    showSql: "Показать SQL",
    pick: "Выберите отчёт для просмотра деталей."
  }
} as const;

export function SavedReportsView({ language }: { language: "en" | "ru" }) {
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const t = T[language] || T.en;

  useEffect(() => {
    const list = loadSavedReports();
    setReports(list);
    if (list.length > 0) setSelectedId(list[0].id);
  }, []);

  const deleteReport = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm(t.deleteConfirm)) return;
    const updated = reports.filter((r) => r.id !== id);
    setReports(updated);
    saveSavedReports(updated);
    if (selectedId === id) setSelectedId(updated[0]?.id ?? null);
  };

  const selected = reports.find((r) => r.id === selectedId);

  if (reports.length === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Bookmark className="h-6 w-6" />
        </div>
        <h3 className="text-sm font-semibold">{t.empty}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t.emptyDesc}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      {/* Master list */}
      <aside className="w-full shrink-0 overflow-y-auto border-b border-border p-4 lg:w-80 lg:border-b-0 lg:border-r">
        <h3 className="mb-3 px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {t.count(reports.length)}
        </h3>
        <div className="space-y-2">
          {reports.map((r) => (
            <div
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={`group relative cursor-pointer rounded-xl border p-3 transition ${
                selectedId === r.id
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:border-muted-foreground/40"
              }`}
            >
              <h4 className="truncate pr-6 text-xs font-bold text-foreground">{r.name}</h4>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">
                {t.query}: {r.question}
              </p>
              <p className="mt-2 text-[10px] text-muted-foreground">{new Date(r.savedAt).toLocaleDateString()}</p>
              <button
                onClick={(e) => deleteReport(e, r.id)}
                className="absolute right-2 top-2 rounded p-1 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100 cursor-pointer"
                type="button"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Detail */}
      <section className="flex-1 overflow-y-auto p-5">
        {selected ? (
          <div className="mx-auto max-w-4xl space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-foreground">{selected.name}</h2>
                <p className="mt-1 text-xs italic text-muted-foreground">&ldquo;{selected.question}&rdquo;</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    downloadCSV(
                      selected.name.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
                      selected.response.columns,
                      selected.response.rows
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted/60 cursor-pointer"
                  type="button"
                >
                  <Download className="h-3.5 w-3.5" />
                  {t.csv}
                </button>
                <button
                  onClick={(e) => deleteReport(e, selected.id)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive transition hover:bg-destructive/20 cursor-pointer"
                  type="button"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t.delete}
                </button>
              </div>
            </div>

            {selected.response.summary && (
              <div className="rounded-xl border border-border bg-card p-4">
                <MarkdownRenderer text={selected.response.summary} />
              </div>
            )}

            {selected.response.rows.length > 0 && (
              <AnalyticsResultTable columns={selected.response.columns} rows={selected.response.rows} />
            )}

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">{t.rows}: </span>
                  <span className="font-semibold text-foreground">{selected.response.metadata.row_count}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t.duration}: </span>
                  <span className="font-semibold text-foreground">{selected.response.metadata.execution_time_ms} ms</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t.status}: </span>
                  <span className="rounded border border-accent/20 bg-accent/10 px-1.5 py-0.5 font-semibold text-accent">
                    {t.safe}
                  </span>
                </div>
              </div>

              {selected.response.sql && (
                <details className="mt-3 rounded-md border border-border text-xs">
                  <summary className="inline-flex cursor-pointer select-none items-center gap-2 p-3 font-semibold">
                    <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
                    {t.showSql}
                  </summary>
                  <pre className="max-w-full overflow-auto border-t border-border bg-background/70 p-3 font-mono text-[11px] text-muted-foreground">
                    {selected.response.sql}
                  </pre>
                </details>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{t.pick}</div>
        )}
      </section>
    </div>
  );
}
