"use client";

import { FormEvent, useState } from "react";
import { SendHorizontal, Square } from "lucide-react";

export function ChatComposer({
  isLoading,
  disabled = false,
  placeholder,
  onSubmit,
  onStop
}: {
  isLoading: boolean;
  disabled?: boolean;
  placeholder?: string;
  onSubmit: (question: string) => void;
  onStop?: () => void;
}) {
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading || disabled) return;
    onSubmit(value);
    setValue("");
  }

  return (
    <form
      className="flex items-center gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm focus-within:border-primary/50 focus-within:shadow-glow transition"
      onSubmit={handleSubmit}
    >
      <input
        className="min-h-10 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={disabled ? "Demo limit reached — see options above ↑" : placeholder ?? "Ask about transactions, fraud, customers, loans…"}
        disabled={isLoading || disabled}
      />
      {isLoading ? (
        <button
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive text-destructive-foreground transition hover:opacity-90 disabled:opacity-50"
          type="button"
          onClick={onStop}
          disabled={!onStop}
          aria-label="Stop"
          title="Stop"
        >
          <Square className="h-3.5 w-3.5 fill-current" />
        </button>
      ) : (
        <button
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
          type="submit"
          disabled={!value.trim() || disabled}
          aria-label="Send question"
        >
          <SendHorizontal className="h-4 w-4" />
        </button>
      )}
    </form>
  );
}
