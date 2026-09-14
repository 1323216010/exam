#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""OCR remaining scanned 00040 papers and merge official answer keys."""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "script"))
from finish_03333_00040 import (  # noqa: E402
    SCORE_00040,
    apply_scores,
    infer_type,
    parse_choice_grid,
    parse_classic_paper,
    parse_inline_options,
    parse_subjective_key,
    quality,
    write_exam,
)
from import_03333_00040 import CACHE, groups  # noqa: E402

NEED = {
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


def log(msg: str) -> None:
    print(msg, flush=True)


def word_to_pdf(path: Path, pdf_path: Path) -> None:
    import win32com.client

    word = win32com.client.Dispatch("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0
    doc = None
    try:
        doc = word.Documents.Open(str(path), ReadOnly=True)
        doc.SaveAs(str(pdf_path), FileFormat=17)
    finally:
        if doc is not None:
            doc.Close(False)
        word.Quit()


def ocr_images(blobs: list[bytes], ident: str) -> str:
    import base64
    from openai import OpenAI

    client = OpenAI(
        api_key=os.environ["DASHSCOPE_API_KEY"],
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        timeout=240,
    )
    chunks = []
    for i, blob in enumerate(blobs):
        cache = CACHE / f"{ident}-force-{i}.txt"
        if not cache.exists():
            mime = "image/png" if blob.startswith(b"\x89PNG") else "image/jpeg"
            response = client.chat.completions.create(
                model="qwen-vl-plus",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": "逐字转录这页试卷。只转录原文题目、选项、答案和评分参考，保留题号。不要解题，不要补写答案，不要写总结。",
                            },
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:{mime};base64," + base64.b64encode(blob).decode()},
                            },
                        ],
                    }
                ],
                max_tokens=4096,
            )
            cache.write_text(response.choices[0].message.content or "", encoding="utf-8")
        chunks.append(cache.read_text(encoding="utf-8"))
    return "\n".join(chunks)


def ocr_pdf(path: Path, ident: str) -> str:
    import pymupdf as fitz

    blobs = []
    with fitz.open(path) as doc:
        for page in doc:
            pix = page.get_pixmap(matrix=fitz.Matrix(1.8, 1.8))
            blobs.append(pix.tobytes("png"))
    return ocr_images(blobs, ident)


def ole_images(path: Path) -> list[bytes]:
    import olefile
    import pymupdf as fitz

    blobs = []
    with olefile.OleFileIO(path) as ole:
        data = ole.openstream("Data").read()
    for i, match in enumerate(re.finditer(b"\xff\xd8\xff", data)):
        end = data.find(b"\xff\xd9", match.start())
        if end < 0:
            continue
        blob = data[match.start() : end + 2]
        try:
            with fitz.open(stream=blob, filetype="jpeg") as img:
                if img[0].rect.width < 400 or img[0].rect.height < 400:
                    continue
            blobs.append(blob)
        except Exception:
            continue
    return blobs


def ocr_record(rec: dict) -> str:
    path = Path(rec["source"])
    raw = (CACHE / f"{rec['id']}.txt").read_text(encoding="utf-8")
    if path.suffix.lower() == ".pdf":
        return ocr_pdf(path, rec["id"]) + "\n" + raw
    blobs = ole_images(path)
    if blobs:
        return ocr_images(blobs, rec["id"]) + "\n" + raw
    pdf_path = CACHE / f"{rec['id']}.pdf"
    if not pdf_path.exists():
        word_to_pdf(path, pdf_path)
    return ocr_pdf(pdf_path, rec["id"]) + "\n" + raw


def clean_ocr(text: str) -> str:
    text = text.replace("**", "")
    text = re.sub(r"(?m)^\s*[-*]\s*([A-E])[.、．:：]\s*", r"\1. ", text)
    text = re.sub(r"(?ms)^#{0,6}\s*注意事项：.*?(?=^#{1,6}\s*(?:第|[一二三四五六])|\n\d{1,2}[.、．])", "", text)
    text = re.split(r"试题答案及评分参考", text)[0]
    text = re.sub(
        r"(?ms)^#{0,6}\s*答案与解析.*?(?=^#{1,6}\s*(?:第|[一二三四五六]|法学)|\Z)",
        "\n",
        text,
    )
    text = re.sub(r"(?ms)^由于您要求.*?(?=^#{1,3}|\Z)", "\n", text)
    return text


def parse_ocr_questions(text: str) -> list[dict]:
    cleaned = clean_ocr(text)
    questions = parse_classic_paper(cleaned)
    if sum(1 for q in questions if q.get("options")) >= 20:
        return questions
    current = "单项选择题"
    items: dict[int, dict] = {}
    pattern = re.compile(
        r"(?m)^(?:#{1,6}\s*)?(\d{1,2})[.、．]\s*(.+?)(?=^(?:#{1,6}\s*)?\d{1,2}[.、．]\s*|\Z)",
        re.S,
    )
    for match in pattern.finditer(cleaned):
        number = int(match.group(1))
        if number < 1 or number > 50:
            continue
        body = match.group(2).strip()
        if body.startswith("本试卷") or body.startswith("应考者") or "答案：" in body[:8]:
            continue
        prefix = cleaned[: match.start()]
        for line in prefix.splitlines()[-6:]:
            if "多选" in line or "单选" in line or "名词解释" in line or "简答" in line or "论述" in line or "案例" in line:
                current = line
        options, content = parse_inline_options(body)
        content = re.sub(r"\s+", " ", content).strip(" *")
        if not content or len(content) < 2:
            continue
        qtype = infer_type(number, current)
        if options and number <= 30:
            qtype = "单项选择题"
        elif options and number >= 31:
            qtype = "多项选择题"
        items[number] = {
            "question_number": str(number),
            "question_type": qtype,
            "content": content,
            "answer": "",
            "score": None,
            **({"options": options} if options else {}),
        }
    return [items[n] for n in sorted(items)]


def apply_official_answers(questions: list[dict], text: str) -> None:
    grid = parse_choice_grid(text)
    subj = parse_subjective_key(text)
    for item in questions:
        if str(item.get("answer") or "").strip():
            continue
        number = item["question_number"]
        if number in grid and item["question_type"].endswith("选择题"):
            item["answer"] = grid[number]
        elif number in subj:
            item["answer"] = subj[number]


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    for (code, label), records in sorted(groups().items()):
        if code != "00040" or label not in NEED:
            continue
        rec = records[0]
        ocr_path = CACHE / f"00040-{label}-ocr.txt"
        log(f"OCR {label} {Path(rec['source']).name}")
        try:
            if ocr_path.exists() and ocr_path.stat().st_size > 8000:
                text = ocr_path.read_text(encoding="utf-8")
            else:
                text = ocr_record(rec)
                ocr_path.write_text(text, encoding="utf-8")
        except Exception as exc:
            log(f"  FAIL {type(exc).__name__}: {exc}")
            continue
        questions = parse_ocr_questions(text)
        apply_official_answers(questions, text)
        apply_scores(questions, SCORE_00040)
        n, a, s = quality(questions)
        opts = sum(1 for q in questions if q.get("options"))
        log(f"  parsed {n}q / {a}ans / {s}score / {opts}opts")
        if n >= 30:
            write_exam(code, label, questions, records)
            log(f"  wrote {label}")
        else:
            log(f"  skip short {label}")


if __name__ == "__main__":
    main()
