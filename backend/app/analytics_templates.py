from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class AnalyticsTemplate:
    id: str
    title: str
    category: str
    description: str
    examples: tuple[str, ...]
    parameters: tuple[dict[str, Any], ...]
    sql: str
    allowed_tables: tuple[str, ...]
    chart: dict[str, Any]
    summary_hint: str
    content_hash: str
    show_table: bool = True

    @property
    def search_document(self) -> str:
        return "\n".join(
            [
                self.title,
                self.category,
                self.description,
                self.summary_hint,
                *self.examples,
            ]
        )


def load_templates(path: str) -> list[AnalyticsTemplate]:
    template_path = Path(path)
    with template_path.open(encoding="utf-8") as handle:
        payload = json.load(handle)

    templates = payload.get("templates", [])
    if not isinstance(templates, list) or not templates:
        raise ValueError(f"No analytics templates found in {template_path}.")

    parsed = [_parse_template(item) for item in templates]
    duplicate_ids = _duplicates(template.id for template in parsed)
    if duplicate_ids:
        raise ValueError(f"Duplicate analytics template id(s): {', '.join(sorted(duplicate_ids))}.")
    return parsed


def _parse_template(item: dict[str, Any]) -> AnalyticsTemplate:
    required = {
        "id",
        "title",
        "category",
        "description",
        "examples",
        "parameters",
        "sql",
        "allowed_tables",
        "chart",
        "summary_hint",
    }
    missing = sorted(required - item.keys())
    if missing:
        raise ValueError(f"Template is missing required field(s): {', '.join(missing)}.")

    content_hash = hashlib.sha256(
        json.dumps(item, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()

    return AnalyticsTemplate(
        id=str(item["id"]),
        title=str(item["title"]),
        category=str(item["category"]),
        description=str(item["description"]),
        examples=tuple(str(example) for example in item["examples"]),
        parameters=tuple(dict(parameter) for parameter in item["parameters"]),
        sql=str(item["sql"]).strip(),
        allowed_tables=tuple(str(table) for table in item["allowed_tables"]),
        chart=dict(item["chart"]),
        summary_hint=str(item["summary_hint"]),
        content_hash=content_hash,
        show_table=bool(item.get("show_table", True)),
    )


def _duplicates(values: Any) -> set[str]:
    seen: set[str] = set()
    duplicates: set[str] = set()
    for value in values:
        if value in seen:
            duplicates.add(value)
        seen.add(value)
    return duplicates


def parse_template(item: dict[str, Any]) -> AnalyticsTemplate:
    return _parse_template(item)


def save_new_template(path: str, template_dict: dict[str, Any]) -> None:
    template_path = Path(path)
    if not template_path.exists():
        return
    try:
        with template_path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        
        # Avoid duplicate ids
        existing_ids = {t["id"] for t in payload.get("templates", [])}
        if template_dict["id"] not in existing_ids:
            payload.setdefault("templates", []).append(template_dict)
            with template_path.open("w", encoding="utf-8") as handle:
                json.dump(payload, handle, indent=2, ensure_ascii=False)
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to append new template to file: {e}")

