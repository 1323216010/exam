#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fill official per-question scores for 00292 papers."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "json" / "00292"


def parse_date(name: str) -> tuple[int, int]:
    match = re.search(r"(20\d{2})年(\d{1,2})月", name)
    return int(match.group(1)), int(match.group(2))


def scores_for(year: int, month: int, types: list[str]) -> dict[str, int]:
    multi_count = types.count("多项选择题")
    essay_count = types.count("论述题")
    short_count = types.count("简答题")

    if (year, month) <= (2005, 4):
        return {
            "单项选择题": 1,
            "多项选择题": 1,
            "判断改错题": 3,
            "简答题": 5,
            "论述题": 9,
            "材料分析题": 7,
        }
    if (year, month) in {(2008, 7), (2009, 4)}:
        return {
            "单项选择题": 1,
            "多项选择题": 1,
            "名词解释": 4,
            "简答题": 6,
            "论述题": 12,
            "材料分析题": 12,
        }
    if (year, month) <= (2014, 4):
        return {
            "单项选择题": 1,
            "多项选择题": 1,
            "简答题": 6,
            "论述题": 12 if essay_count <= 2 else 12,
            "材料分析题": 12,
        }
    if (year, month) == (2015, 10):
        return {
            "单项选择题": 1,
            "多项选择题": 2,
            "简答题": 6,
            "论述题": 12,
            "材料分析题": 11,
        }
    # 2014年10月起现行卷：单选1 / 多选2 / 简答6 / 论述11 / 材料12
    table = {
        "单项选择题": 1,
        "多项选择题": 2 if multi_count <= 8 else 1,
        "简答题": 6,
        "论述题": 11,
        "材料分析题": 12,
        "名词解释": 4,
        "判断改错题": 3,
    }
    if short_count == 4:
        table["简答题"] = 6
    return table


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    for path in sorted(OUT.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        questions = data.get("questions") or []
        year, month = parse_date(path.name)
        types = [q.get("question_type") or "" for q in questions]
        table = scores_for(year, month, types)
        for item in questions:
            qtype = item.get("question_type") or ""
            item["score"] = table.get(qtype, 1)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        total = sum(int(q.get("score") or 0) for q in questions)
        print(f"{path.name}\ttotal={total}")


if __name__ == "__main__":
    main()
