# -*- coding: utf-8 -*-
"""Turn the Downloads study PDFs into a per-chapter Markdown source library.

Source PDFs live in E:\Downloads and are not part of this repository. This script
extracts them with pdftotext and writes readable per-chapter Markdown under
knowledge/sources/<code>/, plus an index.json describing every output file.

Usage:
    python script/build_sources_md.py            # all configured courses
    python script/build_sources_md.py 03333      # one course
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "knowledge" / "sources"
PDFTOTEXT = Path(r"D:\WorkSpace\poppler-25.12.0\Library\bin\pdftotext.exe")

DOWNLOADS = Path(r"E:\Downloads")

# code -> list of (pdf path, short label)
SOURCES = {
    "03333": [
        (DOWNLOADS / "广东安徽福建湖北黑龙江03333电子政务概论" / "电子政务概论-电子教辅.pdf", "电子教辅"),
        (DOWNLOADS / "广东安徽福建湖北黑龙江03333电子政务概论" / "电子政务概论-速记宝典.pdf", "速记宝典"),
        (DOWNLOADS / "广东安徽福建湖北黑龙江03333电子政务概论" / "《电子政务概论》考前资料.pdf", "考前资料"),
    ],
    "13672": [
        (DOWNLOADS / "13672公共政策导论" / "13672公共政策导论 精讲.pdf", "精讲"),
        (DOWNLOADS / "13672公共政策导论" / "13672公共政策导论 串讲.pdf", "串讲"),
        (DOWNLOADS / "13672公共政策导论" / "13672公共政策导论-电子教辅.pdf", "电子教辅"),
        (DOWNLOADS / "13672公共政策导论" / "13672公共政策导论-速记宝典.pdf", "速记宝典"),
    ],
}

CHAPTER_RE = re.compile(r"^第([一二三四五六七八九十百]+)章\s*[、.．]?\s*(\S.*?)\s*$")
PAGE_RE = re.compile(r"^\s*-?\s*\d{1,3}\s*-?\s*$")
TOC_RE = re.compile(r"\.{4,}\s*\d+\s*$")


def pdf_to_text(pdf: Path) -> str:
    if not pdf.exists():
        raise FileNotFoundError(pdf)
    out = subprocess.run(
        [str(PDFTOTEXT), "-enc", "UTF-8", "-layout", str(pdf), "-"],
        capture_output=True,
    )
    if out.returncode != 0:
        raise RuntimeError(f"pdftotext 失败：{pdf}\n{out.stderr.decode('utf-8', 'ignore')}")
    return out.stdout.decode("utf-8", "ignore")


def tidy(line: str) -> str:
    line = line.replace("\u3000", " ").replace("\xa0", " ").replace("\x0c", "")
    return re.sub(r"[ \t]+", " ", line).strip()


def is_heading(line: str) -> bool:
    return bool(
        CHAPTER_RE.match(line)
        or re.match(r"^第[一二三四五六七八九十]+节\s*\S", line)
        or re.match(r"^第[一二三四五六七八九十]+篇\s*\S", line)
        or re.match(r"^[一二三四五六七八九十]+、\s*\S", line)
        or re.match(r"^[A-D][.、．]\s*\S", line)
        or re.match(r"^(本章重难点分析|导言|引言|目录|例题|单选题|多选题|判断题|简答题|论述题|名词解释)", line)
    )


def clean_pages(text: str) -> list[str]:
    lines: list[str] = []
    for raw in text.splitlines():
        line = tidy(raw)
        if not line or PAGE_RE.match(line):
            continue
        # running header: current chapter title repeated on each page
        m = CHAPTER_RE.match(line)
        if m and TOC_RE.search(line):
            continue
        lines.append(line)
    return lines


def merge_paragraphs(lines: list[str]) -> list[str]:
    out: list[str] = []
    buf = ""
    for line in lines:
        if is_heading(line):
            if buf:
                out.append(buf)
                buf = ""
            out.append(line)
            continue
        # a line ending in sentence punctuation usually closes a paragraph
        if buf and not re.search(r"[。；：:！？）)】]$", buf):
            buf += line
        else:
            if buf:
                out.append(buf)
            buf = line
    if buf:
        out.append(buf)
    return out


def split_chapters(lines: list[str]) -> list[tuple[str, list[str]]]:
    chapters: list[tuple[str, list[str]]] = []
    current_title = "前言与目录"
    current: list[str] = []
    seen_body_chapter = False
    for line in lines:
        m = CHAPTER_RE.match(line)
        if m and not TOC_RE.search(line):
            # Require a plausible title so we skip stray references.
            title = f"第{m.group(1)}章 {m.group(2)}".strip()
            if len(title) <= 40:
                if current:
                    chapters.append((current_title, current))
                current_title = title
                current = [line]
                seen_body_chapter = True
                continue
        current.append(line)
    if current:
        chapters.append((current_title, current))
    return chapters


def slug(title: str) -> str:
    cn = re.match(r"^第([一二三四五六七八九十百]+)章", title)
    order = {
        "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8,
        "九": 9, "十": 10, "十一": 11, "十二": 12, "十三": 13, "十四": 14,
        "十五": 15, "十六": 16, "十七": 17, "十八": 18, "十九": 19, "二十": 20,
        "二十一": 21,
    }
    n = order.get(cn.group(1), 99) if cn else 99
    rest = re.sub(r"[^\w\u4e00-\u9fff]+", "-", title).strip("-")
    return f"{n:02d}-{rest}" if rest else f"{n:02d}-chapter"


def build(code: str) -> None:
    outdir = DEST / code
    outdir.mkdir(parents=True, exist_ok=True)
    index: list[dict] = []
    for pdf, label in SOURCES.get(code, []):
        text = pdf_to_text(pdf)
        lines = merge_paragraphs(clean_pages(text))
        chapters = split_chapters(lines)
        # 讲义类 PDF 每页都重复章标题，按标题合并，避免同名文件互相覆盖。
        merged: list[tuple[str, list[str]]] = []
        order: dict[str, int] = {}
        for title, body in chapters:
            if title in order:
                merged[order[title]][1].extend(body)
            else:
                order[title] = len(merged)
                merged.append((title, list(body)))
        for title, body in merged:
            prose = "".join(body)
            # 汇总表会把「第X章 标题 重点」当成章节行，这里丢掉空壳片段。
            if len(prose) < 200 and not re.match(r"^(前言|目录)", title):
                continue
            name = f"{label}-{slug(title)}.md"
            dest = outdir / name
            md = [f"# {title}", "", f"> 来源：{pdf.name}（{label}）· 本地素材摘录，供学习整理使用。", ""]
            for line in body:
                if re.match(r"^第[一二三四五六七八九十]+节", line):
                    md.append(f"## {line}")
                elif re.match(r"^[一二三四五六七八九十]+、", line):
                    md.append(f"### {line}")
                elif CHAPTER_RE.match(line):
                    md.append(f"## {line}")
                elif re.match(r"^[A-D][.、．]\s*\S", line):
                    md.append(f"- {line}")
                elif re.match(r"^(本章重难点分析|导言|引言|例题|单选题|多选题|判断题|简答题|论述题|名词解释)", line):
                    md.append(f"### {line}")
                else:
                    md.append(line)
                md.append("")
            dest.write_text(re.sub(r"\n{3,}", "\n\n", "\n".join(md)).strip() + "\n", encoding="utf-8")
            index.append({
                "code": code,
                "label": label,
                "sourcePdf": pdf.name,
                "title": title,
                "path": f"knowledge/sources/{code}/{name}",
                "chars": dest.stat().st_size,
            })
        print(f"{code} {label}: {len(chapters)} 段 → 合并为 {len(merged)} 章")
    (outdir / "index.json").write_text(
        json.dumps({"code": code, "entries": index}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"{code}: 共 {len(index)} 个文件 → {outdir}")


if __name__ == "__main__":
    targets = sys.argv[1:] or list(SOURCES)
    for c in targets:
        build(c)
