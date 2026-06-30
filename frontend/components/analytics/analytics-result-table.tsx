import type { AnalyticsRow } from "@/lib/types";

export function AnalyticsResultTable({
  columns,
  rows
}: {
  columns: string[];
  rows: AnalyticsRow[];
}) {
  if (rows.length === 0) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-md border bg-muted text-sm text-muted-foreground">
        No rows returned
      </div>
    );
  }

  return (
    <div className="max-h-72 overflow-auto rounded-md border">
      <table className="w-full min-w-[520px] text-left text-xs">
        <thead className="sticky top-0 bg-muted text-muted-foreground">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-3 py-2 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t">
              {columns.map((column) => (
                <td key={column} className="px-3 py-2">
                  {formatCell(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(value);
}
