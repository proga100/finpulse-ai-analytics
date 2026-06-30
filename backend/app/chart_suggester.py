from typing import Any

from .schemas import ChartSuggestion


def suggest_chart(rows: list[dict[str, Any]], columns: list[str]) -> ChartSuggestion:
    if not rows or len(columns) < 2:
        return ChartSuggestion()

    numeric_columns = [
        column
        for column in columns
        if any(isinstance(row.get(column), (int, float)) for row in rows)
    ]
    if not numeric_columns:
        return ChartSuggestion()

    x = next((column for column in columns if column not in numeric_columns), columns[0])
    y = numeric_columns[0]

    time_axes = {"day", "date", "created_at", "month", "week", "year", "quarter", "period"}
    if x.lower() in time_axes:
        return ChartSuggestion(type="line", x=x, y=y)

    return ChartSuggestion(type="bar", x=x, y=y)
