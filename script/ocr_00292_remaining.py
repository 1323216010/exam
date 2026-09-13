#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""OCR remaining scanned 市政学 papers and convert them to exam JSON."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from openai import OpenAI
from pdf2image import convert_from_path
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "script"))
from import_00292_from_downloads import (  # noqa: E402
    apply_answer_key,
    build_exam,
    parse_answer_key,
    parse_date,
    parse_questions,
    quality_ok,
    source_dir,
)

OUT_DIR = ROOT / "json" / "00292"
OCR_DIR = ROOT / ".tmp_ocr"
EXTRACT_DIR = ROOT / ".tmp_extract"
POPPLER = r"D:\WorkSpace\poppler-25.12.0\Library\bin"
LOG = ROOT / ".tmp_ocr_log.txt"

NEED = {
    "2011年4月",
    "2013年4月",
    "2015年10月",
    "2016年10月",
    "2017年4月",
    "2017年10月",
    "2018年4月",
    "2018年10月",
}

client = OpenAI(
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
)
MODEL = "qwen-vl-plus"


def log(msg: str) -> None:
    print(msg, flush=True)
    with LOG.open("a", encoding="utf-8") as fh:
        fh.write(msg + "\n")


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


def to_images(path: Path, dest: Path) -> list[Path]:
    dest.mkdir(parents=True, exist_ok=True)
    existing = sorted(dest.glob("page_*.png"))
    if existing:
        return existing
    pdf_path = path
    tmp_pdf = dest / f"{path.stem}.pdf"
    if path.suffix.lower() in {".doc", ".docx"}:
        if not tmp_pdf.exists():
            word_to_pdf(path, tmp_pdf)
        pdf_path = tmp_pdf
    pages = convert_from_path(str(pdf_path), dpi=160, poppler_path=POPPLER)
    image_paths = []
    for index, page in enumerate(pages, 1):
        image_path = dest / f"page_{index:02d}.png"
        page.save(image_path, "PNG")
        image_paths.append(image_path)
    return image_paths


def encode_image(path: Path) -> str:
    import base64

    return base64.b64encode(path.read_bytes()).decode("ascii")


def images_to_markdown(image_paths: list[Path]) -> str:
    prompt = (
        "请把这些试卷图片转成纯文本。保留全部题目和答案。"
        "选择题用这种格式：\n"
        "1、【单选题】题干\nA: 选项\nB: 选项\nC: 选项\nD: 选项\n答案：A\n"
        "多选题用【多选题】，简答用【简答题】，论述用【论述题】，材料用【材料分析题】。"
        "如果只有答案没有题目，也按题号列出答案。"
        "不要编造原文没有的答案。忽略广告和页眉页脚。"
    )
    chunks = []
    batch_size = 3
    for start in range(0, len(image_paths), batch_size):
        batch = image_paths[start : start + batch_size]
        content = [{"type": "text", "text": prompt}]
        for image_path in batch:
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{encode_image(image_path)}"},
                }
            )
        completion = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": content}],
        )
        chunks.append(completion.choices[0].message.content or "")
    return "\n\n".join(chunks)


def load_saved_answers(date_label: str) -> dict[str, str]:
    path = EXTRACT_DIR / f"{date_label}.answers.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}


def main() -> None:
    LOG.write_text("", encoding="utf-8")
    src = source_dir()
    files = [f for f in sorted(src.iterdir()) if f.suffix.lower() in {".doc", ".docx", ".pdf"}]
    for path in files:
        date_label, out_name = parse_date(path.name)
        if date_label not in NEED:
            continue
        log(f"OCR {date_label} {path.name} {path.stat().st_size}")
        dest = OCR_DIR / date_label
        try:
            images = to_images(path, dest)
            log(f"  pages={len(images)}")
            markdown = images_to_markdown(images)
        except Exception as exc:
            log(f"  failed: {exc}")
            continue
        md_path = dest / "ocr.md"
        md_path.write_text(markdown, encoding="utf-8")
        questions = parse_questions(markdown)
        apply_answer_key(questions, parse_answer_key(markdown))
        apply_answer_key(questions, load_saved_answers(date_label))
        existing_path = OUT_DIR / out_name
        if existing_path.exists():
            try:
                old_qs = json.loads(existing_path.read_text(encoding="utf-8")).get("questions") or []
            except Exception:
                old_qs = []
            if quality_ok(old_qs) and sum(1 for q in old_qs if q.get("options")) >= 25:
                ocr_answers = {
                    q["question_number"]: q["answer"]
                    for q in questions
                    if str(q.get("answer") or "").strip()
                }
                apply_answer_key(old_qs, ocr_answers)
                questions = old_qs
                log("  merged OCR answers into existing questions")
        if not questions:
            log(f"  parsed 0 questions, md={len(markdown)}")
            continue
        data = build_exam(date_label, questions)
        out_path = OUT_DIR / out_name
        out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        answered = sum(1 for q in questions if str(q.get("answer") or "").strip())
        log(f"  saved {out_name} q={len(questions)} ans={answered} ok={quality_ok(questions)}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
