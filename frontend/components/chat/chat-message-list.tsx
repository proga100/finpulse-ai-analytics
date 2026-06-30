import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

import type { AnalyticsChatResponse, ChatMessage } from "@/lib/types";

export function ChatMessageList({
  messages,
  renderAnalytics
}: {
  messages: ChatMessage[];
  renderAnalytics: (analytics: AnalyticsChatResponse, index: number, summaryPending?: boolean) => ReactNode;
}) {
  return (
    <div className="space-y-4">
      {messages.map((message, index) => (
        <article
          key={message.id}
          className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
        >
          <div
            className={
              message.role === "user"
                ? "max-w-2xl rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm"
                : "w-full max-w-4xl"
            }
          >
            {message.isProgress ? (
              <div className="inline-flex items-center gap-2.5 rounded-xl border border-dashed border-border bg-card/60 px-4 py-3 text-xs font-medium text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span>{message.content}</span>
              </div>
            ) : message.analytics ? (
              renderAnalytics(message.analytics, index, message.summaryPending)
            ) : (
              <div className="whitespace-pre-wrap rounded-xl border border-border bg-card px-4 py-3 text-sm leading-6 text-card-foreground animate-fade-in-up">
                {message.content}
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
