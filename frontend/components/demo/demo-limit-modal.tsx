"use client";

import { Github, Globe, Mail, Sparkles, X } from "lucide-react";

export function DemoLimitModal({
  open,
  used,
  limit,
  contactEmail,
  siteUrl,
  githubUrl,
  onClose
}: {
  open: boolean;
  used: number;
  limit: number;
  contactEmail: string;
  siteUrl: string;
  githubUrl: string;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-glow animate-fade-in-up">
        <div className="finpulse-aura pointer-events-none absolute inset-0 opacity-70" />
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label="Close"
          type="button"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative p-6">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Sparkles className="h-6 w-6" />
          </div>

          <h3 className="text-lg font-semibold text-foreground">You&apos;ve reached the demo limit</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            You&apos;ve used all <span className="font-semibold text-foreground">{limit}</span> free questions in this
            session. <span className="font-medium text-foreground">FinPulse</span> is a portfolio demo running on{" "}
            <span className="font-medium text-foreground">fully synthetic data</span>.
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Want an AI analytics copilot like this on <span className="font-medium text-foreground">your own database</span>?
            Let&apos;s talk.
          </p>

          <div className="mt-5 flex flex-col gap-2.5">
            <a
              href={`mailto:${contactEmail}?subject=FinPulse%20AI%20analytics%20demo`}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              <Mail className="h-4 w-4" />
              Get in touch
            </a>
            <div className="grid grid-cols-2 gap-2.5">
              <a
                href={siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted/60"
              >
                <Globe className="h-4 w-4" />
                Website
              </a>
              <a
                href={githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted/60"
              >
                <Github className="h-4 w-4" />
                Source
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
