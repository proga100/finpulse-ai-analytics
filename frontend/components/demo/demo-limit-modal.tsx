"use client";

import type { ReactNode } from "react";
import { Github, Globe, Mail, Sparkles, X } from "lucide-react";

function Hl({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-foreground">{children}</span>;
}

const T = {
  en: {
    title: "You've reached the demo limit",
    body1: (limit: number): ReactNode => (
      <>
        You&apos;ve used all <Hl>{limit}</Hl> free questions in this session. <Hl>FinPulse</Hl> is a
        portfolio demo running on <Hl>fully synthetic data</Hl>.
      </>
    ),
    body2: (
      <>
        Want an AI analytics copilot like this on <Hl>your own database</Hl>? Let&apos;s talk.
      </>
    ),
    getInTouch: "Get in touch",
    website: "Website",
    source: "Source",
    close: "Close"
  },
  ru: {
    title: "Лимит демо достигнут",
    body1: (limit: number): ReactNode => (
      <>
        Вы использовали все <Hl>{limit}</Hl> бесплатных вопросов в этой сессии. <Hl>FinPulse</Hl> —
        демо-портфолио на <Hl>полностью синтетических данных</Hl>.
      </>
    ),
    body2: (
      <>
        Хотите такой AI-аналитик для <Hl>своей базы данных</Hl>? Давайте обсудим.
      </>
    ),
    getInTouch: "Связаться",
    website: "Сайт",
    source: "Исходный код",
    close: "Закрыть"
  }
} as const;

export function DemoLimitModal({
  open,
  limit,
  language = "en",
  contactEmail,
  siteUrl,
  githubUrl,
  onClose
}: {
  open: boolean;
  used?: number;
  limit: number;
  language?: "en" | "ru";
  contactEmail: string;
  siteUrl: string;
  githubUrl: string;
  onClose: () => void;
}) {
  if (!open) return null;
  const t = T[language] || T.en;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-glow animate-fade-in-up">
        <div className="finpulse-aura pointer-events-none absolute inset-0 opacity-70" />
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label={t.close}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative p-6">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Sparkles className="h-6 w-6" />
          </div>

          <h3 className="text-lg font-semibold text-foreground">{t.title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t.body1(limit)}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t.body2}</p>

          <div className="mt-5 flex flex-col gap-2.5">
            <a
              href={`mailto:${contactEmail}?subject=FinPulse%20AI%20analytics%20demo`}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              <Mail className="h-4 w-4" />
              {t.getInTouch}
            </a>
            <div className="grid grid-cols-2 gap-2.5">
              <a
                href={siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted/60"
              >
                <Globe className="h-4 w-4" />
                {t.website}
              </a>
              <a
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted/60"
              >
                <Github className="h-4 w-4" />
                {t.source}
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
