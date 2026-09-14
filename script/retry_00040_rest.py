#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""OCR and convert remaining 00040 papers that local parsing missed."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "script"))
from finish_03333_00040 import (  # noqa: E402
    SCORE_00040,
    apply_scores,
    parse_tagged,
    quality,
    write_exam,
)
from import_03333_00040 import CACHE, groups, source_text  # noqa: E402

NEED = {
    "2017年10月",
    "2018年10月",
    "2019年4月",
    "2019年10月",
    "2020年8月",
    "2020年10月",
    "2021年4月",
    "2021年10月",
    "2022年4月",
    "2022年10月",
    "2023年4月",
}


def force_ocr(rec: dict) -> str:
    import pymupdf as fitz
    from openai import OpenAI
    import os
    import base64

    path = Path(rec["source"])
    text = (CACHE / f"{rec['id']}.txt").read_text(encoding="utf-8")
    if path.suffix.lower() != ".pdf":
        return source_text(rec)
    client = OpenAI(
        api_key=os.environ["DASHSCOPE_API_KEY"],
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        timeout=240,
    )
    chunks = []
    with fitz.open(path) as doc:
        for i, page in enumerate(doc):
            cache = CACHE / f"{rec['id']}-force-{i}.txt"
            if not cache.exists():
                pix = page.get_pixmap(matrix=fitz.Matrix(1.8, 1.8))
                blob = pix.tobytes("png")
                response = client.chat.completions.create(
                    model="qwen-vl-plus",
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": "逐字转录这页试卷的全部题目、选项、答案、解析和分值，保留题号。只转录原文，不要解题或补写。",
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {"url": "data:image/png;base64," + base64.b64encode(blob).decode()},
                                },
                            ],
                        }
                    ],
                    max_tokens=4096,
                )
                cache.write_text(response.choices[0].message.content or "", encoding="utf-8")
            chunks.append(cache.read_text(encoding="utf-8"))
    return "\n".join(chunks) + "\n" + text


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    from import_03333_00040 import convert_group

    for (code, label), records in sorted(groups().items()):
        if code != "00040" or label not in NEED:
            continue
        pdfs = [r for r in records if Path(r["source"]).suffix.lower() == ".pdf"]
        rec = pdfs[0] if pdfs else records[0]
        print("OCR", label, Path(rec["source"]).name, flush=True)
        try:
            text = force_ocr(rec) if Path(rec["source"]).suffix.lower() == ".pdf" else source_text(rec)
        except Exception as exc:
            print(" OCR_FAIL", type(exc).__name__, exc, flush=True)
            try:
                print(" ", convert_group((code, label), records), flush=True)
            except Exception as exc2:
                print(" LLM_FAIL", type(exc2).__name__, exc2, flush=True)
            continue
        (CACHE / f"00040-{label}-ocr.txt").write_text(text, encoding="utf-8")
        questions = parse_tagged(text)
        n, a, s = quality(questions)
        print(" tagged", n, a, s, flush=True)
        if n >= 30:
            apply_scores(questions, SCORE_00040)
            write_exam(code, label, questions, [rec])
            print(" OK ocr-tagged", label, flush=True)
            continue
        try:
            print(" ", convert_group((code, label), records), flush=True)
        except Exception as exc:
            print(" LLM_FAIL", type(exc).__name__, exc, flush=True)


if __name__ == "__main__":
    main()
