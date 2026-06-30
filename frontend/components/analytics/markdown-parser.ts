export type ASTNode = string | { type: "strong"; content: string };

export type ASTBlock =
  | { type: "p"; children: ASTNode[] }
  | { type: "bullet"; children: ASTNode[] }
  | { type: "number"; prefix: string; children: ASTNode[] };

export function parseBoldText(text: string): ASTNode[] {
  const partsBold = text.split(/\*\*([^*]+)\*\*/g);
  return partsBold
    .map((part, index) => {
      if (index % 2 === 1) {
        return { type: "strong" as const, content: part };
      }
      return part;
    })
    .filter((part) => part !== "");
}

export function parseMarkdown(text: string): ASTBlock[] {
  if (!text) return [];

  const blocks = text.split("\n");
  return blocks
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return null;

      const isBullet = trimmed.startsWith("* ") || trimmed.startsWith("- ");
      const isNumList = /^\d+\.\s/.test(trimmed);

      if (isBullet) {
        const content = trimmed.slice(2);
        return { type: "bullet" as const, children: parseBoldText(content) };
      }
      if (isNumList) {
        const numPrefix = trimmed.match(/^(\d+\.)\s/)?.[1] || "";
        const content = trimmed.replace(/^\d+\.\s/, "");
        return { type: "number" as const, prefix: numPrefix, children: parseBoldText(content) };
      }

      return { type: "p" as const, children: parseBoldText(trimmed) };
    })
    .filter((block): block is ASTBlock => block !== null);
}
