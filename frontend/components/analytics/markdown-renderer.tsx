import React from "react";
import { parseMarkdown } from "./markdown-parser";

export function MarkdownRenderer({ text }: { text: string }): React.ReactElement | null {
  const ast = parseMarkdown(text);
  if (ast.length === 0) return null;

  return (
    <div className="space-y-2">
      {ast.map((block, idx) => {
        const children = block.children.map((child, cIdx) => {
          if (typeof child === "string") {
            return child;
          }
          if (child.type === "strong") {
            return (
              <strong key={cIdx} className="font-bold text-foreground">
                {child.content}
              </strong>
            );
          }
          return null;
        });

        if (block.type === "bullet") {
          return (
            <div key={idx} className="flex items-start gap-2 pl-4 text-sm leading-6">
              <span className="text-primary font-bold select-none">•</span>
              <span>{children}</span>
            </div>
          );
        }

        if (block.type === "number") {
          return (
            <div key={idx} className="flex items-start gap-2 pl-4 text-sm leading-6">
              <span className="text-primary font-bold select-none">{block.prefix}</span>
              <span>{children}</span>
            </div>
          );
        }

        return (
          <p key={idx} className="text-sm leading-6">
            {children}
          </p>
        );
      })}
    </div>
  );
}
