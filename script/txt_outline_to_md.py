# -*- coding: utf-8 -*-
"""Turn extracted outline .txt files into readable Markdown."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KNOW = ROOT / "knowledge"

HEADING_TITLES = (
    "学习目的与要求",
    "课程内容",
    "考核知识点与考核要求",
    "本章重点和难点",
    "课程性质和特点",
    "课程目标",
    "与相关课程的联系与区别",
    "课程的重点内容",
    "自学考试大纲的目的和作用",
    "课程自学考试大纲与教材的关系",
    "关于自学教材",
    "关于自学要求和自学方法的指导",
)


def tidy(s: str) -> str:
    s = s.replace("\u3000", " ").replace("\xa0", " ").replace("\x0c", " ")
    return re.sub(r"[ \t]+", " ", s).strip()


def is_page_num(s: str) -> bool:
    return bool(re.fullmatch(r"-?\d+-?", s or ""))


def is_heading_line(s: str) -> bool:
    return bool(
        re.match(r"^(第[一二三四五六七八九十]+(部分|章)|[IVXⅠⅡⅢⅣⅤ]+[、.．]?\s)", s)
        or re.match(r"^[一二三四]、", s)
        or re.match(r"^（[一二三四五六七八九十]+）", s)
        or re.match(r"^第[一二三四五六七八九十]+节", s)
        or re.match(r"^\d+\.\d+", s)
        or re.match(r"^(识记|领会|应用)[：:]?", s)
    )


def split_known_headings(s: str) -> list[str]:
    for title in HEADING_TITLES:
        m = re.match(rf"^([一二三四]、){title}(.+)$", s)
        if m and m.group(2):
            rest = m.group(2).strip()
            rest = re.sub(r"(第[一二三四五六七八九十]+节)", r"\n\1", rest)
            rest = re.sub(r"(\d+\.\d+)", r"\n\1", rest)
            rest = re.sub(r"(重点：)", r"\n\1", rest)
            rest = re.sub(r"(难点：)", r"\n\1", rest)
            parts = [f"{m.group(1)}{title}"]
            parts.extend(x.strip() for x in rest.split("\n") if x.strip())
            return parts
    m = re.match(r"^(第[一二三四五六七八九十]+章\s*[^。；]{0,40}?)(本章.+)$", s)
    if m:
        return [m.group(1).strip(), m.group(2).strip()]
    return [s]


def join_paragraphs(lines: list[str]) -> list[str]:
    out: list[str] = []
    buf = ""
    for line in lines:
        if not line:
            if buf:
                out.append(buf)
                buf = ""
            if out and out[-1] != "":
                out.append("")
            continue
        if is_heading_line(line):
            if buf:
                out.append(buf)
                buf = ""
            out.extend(split_known_headings(line))
            continue
        if buf and not re.search(r"[。；：:）)）]$", buf) and not is_heading_line(line):
            buf += line
        else:
            if buf:
                out.append(buf)
            buf = line
    if buf:
        out.append(buf)
    return out


def to_md(text: str, title: str, code: str) -> str:
    raw_lines = [tidy(x) for x in text.splitlines()]
    raw_lines = [x for x in raw_lines if not is_page_num(x)]
    body = join_paragraphs(raw_lines)
    lines = [
        f"# {title}",
        "",
        f"课程代码：`{code}`",
        "",
        "> 这是课程考试大纲的阅读转载，便于对照考核范围。讲解仍按考点学习整理，不是整本教材。",
        "",
    ]
    seen_chapter = set()
    for line in body:
        if not line:
            lines.append("")
            continue
        if re.match(r"^[IVXⅠⅡⅢⅣⅤ]+[、.．]?\s*", line) or re.match(r"^第[一二三四五六七八九十]+部分", line):
            lines.append(f"## {line}")
            continue
        ch = re.match(r"^(第[一二三四五六七八九十]+章\s*.{0,40})$", line)
        if ch and "本章" not in line and len(line) < 40:
            key = re.sub(r"\s+", "", line)
            if key in seen_chapter:
                continue
            seen_chapter.add(key)
            lines.append(f"## {line}")
            continue
        if re.match(r"^[一二三四]、", line):
            lines.append(f"### {line}")
            continue
        if re.match(r"^第[一二三四五六七八九十]+节", line):
            lines.append(f"- {line}")
            continue
        if re.match(r"^（[一二三四五六七八九十]+）", line):
            lines.append(f"#### {line}")
            continue
        if re.match(r"^(识记|领会|应用)[：:]", line):
            lines.append(f"**{line[:2]}**：{line[3:].lstrip('：:').strip()}")
            continue
        if line in {"识记：", "领会：", "应用：", "识记", "领会", "应用"}:
            lines.append(f"**{line.strip('：:')}**")
            continue
        if line.startswith("重点：") or line.startswith("难点："):
            lines.append(f"**{line[:2]}**：{line[3:].strip()}")
            continue
        lines.append(line)
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip() + "\n"


def convert(src: Path, dest: Path, title: str, code: str) -> None:
    dest.write_text(to_md(src.read_text(encoding="utf-8"), title, code), encoding="utf-8")
    print(dest.name, dest.stat().st_size)


if __name__ == "__main__":
    convert(KNOW / "03333-gd-outline.txt", KNOW / "03333-gd-outline.md", "电子政务概论 考试大纲", "03333")
    convert(KNOW / "00040-gd-outline.txt", KNOW / "00040-gd-outline.md", "法学概论 考试大纲", "00040")
    convert(KNOW / "13672-gzyszxy-outline.txt", KNOW / "13672-gzyszxy-outline.md", "公共政策导论 考试大纲", "13672")
