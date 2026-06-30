import { ArrowUpRight } from "lucide-react";

export function SuggestedQuestionGrid({
  questions,
  onSelect,
  disabled = false
}: {
  questions: string[];
  onSelect: (question: string) => void;
  disabled?: boolean;
}) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {questions.map((question) => (
        <button
          key={question}
          disabled={disabled}
          className="group flex items-start justify-between gap-3 rounded-xl border border-border bg-card p-4 text-left text-sm text-card-foreground transition hover:border-primary/50 hover:bg-primary/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => onSelect(question)}
          type="button"
        >
          <span className="leading-snug">{question}</span>
          <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-primary" />
        </button>
      ))}
    </section>
  );
}
