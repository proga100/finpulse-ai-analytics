"use client";

import { useMemo, useState } from "react";
import { Check, CornerDownLeft, HelpCircle, SkipForward } from "lucide-react";

import type { ClarificationAnswer, ClarificationQuestion } from "@/lib/types";
import { OTHER_ID, collectAnswers, toggleSelection } from "@/lib/clarification";

const t = {
  en: {
    step: (round: number, max: number) => `Question ${round} of ${max}`,
    hint: "Select one or more, or add your own — this helps me answer precisely.",
    other: "Other…",
    otherPlaceholder: "Type your own answer",
    continue: "Continue",
    skip: "Skip & answer anyway"
  },
  ru: {
    step: (round: number, max: number) => `Вопрос ${round} из ${max}`,
    hint: "Выберите один или несколько вариантов или добавьте свой — это поможет ответить точнее.",
    other: "Другое…",
    otherPlaceholder: "Введите свой вариант",
    continue: "Продолжить",
    skip: "Пропустить и ответить"
  },
  uz: {
    step: (round: number, max: number) => `${max} dan ${round}-savol`,
    hint: "Bir yoki bir nechtasini tanlang yoki o'zingiznikini qo'shing — bu aniqroq javob berishga yordam beradi.",
    other: "Boshqa…",
    otherPlaceholder: "O'z javobingizni yozing",
    continue: "Davom etish",
    skip: "O'tkazib yuborish va javob berish"
  }
} as const;

export function ClarificationPanel({
  clarification,
  language,
  isLoading,
  onSubmit,
  onSkip
}: {
  clarification: ClarificationQuestion;
  language: "en" | "ru" | "uz";
  isLoading: boolean;
  onSubmit: (answer: ClarificationAnswer) => void;
  onSkip: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [otherText, setOtherText] = useState("");
  const labels = t[language] || t.en;

  const otherActive = selected.has(OTHER_ID);

  const collectedAnswers = useMemo(
    () => collectAnswers(clarification.options, selected, otherText),
    [clarification.options, selected, otherText]
  );

  const canContinue = collectedAnswers.length > 0 && !isLoading;

  function toggle(id: string) {
    setSelected((prev) => toggleSelection(prev, id, clarification.allow_multi));
  }

  function handleContinue() {
    if (!canContinue) return;
    onSubmit({ question: clarification.question, answers: collectedAnswers });
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/[0.04] p-3.5 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-primary">
          <HelpCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm font-semibold leading-snug text-foreground">
            {clarification.question}
          </span>
        </div>
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
          {labels.step(clarification.round + 1, clarification.max_rounds)}
        </span>
      </div>

      <p className="mb-3 text-xs text-muted-foreground">{labels.hint}</p>

      <div className="flex flex-wrap gap-2">
        {clarification.options.map((opt) => {
          const active = selected.has(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggle(opt.id)}
              disabled={isLoading}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition cursor-pointer disabled:opacity-50 ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:border-primary/50 hover:bg-primary/5"
              }`}
            >
              {active && <Check className="h-3 w-3" />}
              {opt.label}
            </button>
          );
        })}

        {clarification.allow_other && (
          <button
            type="button"
            onClick={() => toggle(OTHER_ID)}
            disabled={isLoading}
            className={`inline-flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1.5 text-xs font-medium transition cursor-pointer disabled:opacity-50 ${
              otherActive
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground"
            }`}
          >
            {otherActive && <Check className="h-3 w-3" />}
            {labels.other}
          </button>
        )}
      </div>

      {otherActive && (
        <input
          autoFocus
          value={otherText}
          onChange={(e) => setOtherText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleContinue();
            }
          }}
          placeholder={labels.otherPlaceholder}
          disabled={isLoading}
          className="mt-2.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onSkip}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-50 cursor-pointer"
        >
          <SkipForward className="h-3.5 w-3.5" />
          {labels.skip}
        </button>

        <button
          type="button"
          onClick={handleContinue}
          disabled={!canContinue}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
        >
          {labels.continue}
          <CornerDownLeft className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
