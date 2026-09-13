#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_00292_from_downloads import apply_answer_key, build_exam, parse_questions

ROOT = Path(__file__).resolve().parent.parent
OCR = ROOT / ".tmp_ocr"
OUT = ROOT / "json" / "00292"
EXTRACT = ROOT / ".tmp_extract"


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    for md in sorted(OCR.glob("*/ocr.md")):
        date = md.parent.name
        questions = parse_questions(md.read_text(encoding="utf-8"))
        key = EXTRACT / f"{date}.answers.json"
        if key.exists():
            apply_answer_key(questions, json.loads(key.read_text(encoding="utf-8")))
        dest = OUT / f"{date}自考00292市政学试题及答案.json"
        dest.write_text(json.dumps(build_exam(date, questions), ensure_ascii=False, indent=2), encoding="utf-8")
        answered = sum(1 for q in questions if str(q.get("answer") or "").strip())
        options = sum(1 for q in questions if q.get("options"))
        first = questions[0]["content"][:36] if questions else ""
        print(f"{date}\tq={len(questions)}\tans={answered}\topt={options}\t{first}")


if __name__ == "__main__":
    main()
