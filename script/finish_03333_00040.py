#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Finish importing 03333 remaining chapters and 00040 papers into site JSON."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "script"))
from import_03333_00040 import CACHE, NAMES, SOURCES, groups, source_text  # noqa: E402

TYPE_MAP = {
    "单选题": "单项选择题",
    "单项选择题": "单项选择题",
    "多选题": "多项选择题",
    "多项选择题": "多项选择题",
    "判断题": "判断题",
    "填空题": "填空题",
    "名词解释": "名词解释",
    "名词解释题": "名词解释",
    "简答题": "简答题",
    "论述题": "论述题",
    "案例分析题": "材料分析题",
    "材料分析题": "材料分析题",
    "综合题": "材料分析题",
}

SCORE_00040 = {
    "单项选择题": 1,
    "多项选择题": 2,
    "名词解释": 3,
    "简答题": 5,
    "论述题": 14,
    "材料分析题": 8,
}

SCORE_03333_GD = {
    "单项选择题": 1,
    "名词解释": 3,
    "简答题": 6,
    "论述题": 16,
}


def exam_path(code: str, label: str) -> Path:
    name = f"{label}_{code}{NAMES[code]}.json" if re.search(r"\d$", label) else f"{label}{code}{NAMES[code]}.json"
    return ROOT / "json" / code / name


def write_exam(code: str, label: str, questions: list[dict], records: list[dict], kind: str = "") -> Path:
    date = label if re.fullmatch(r"20\d{2}年\d{1,2}月", label) else ""
    if not kind:
        kind = "历年真题" if date else ("章节练习" if "章" in label else "模拟题" if "模拟" in label else "串讲题")
    info = {
        "title": f"{date} · {NAMES[code]}" if date else label,
        "subject": NAMES[code],
        "code": code,
        "date": date,
        "kind": kind,
        "source_files": [str(Path(r["source"]).relative_to(SOURCES[code])) for r in records],
    }
    out = exam_path(code, label)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"exam_info": info, "questions": questions}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return out


def apply_scores(questions: list[dict], table: dict[str, int]) -> None:
    for item in questions:
        if item.get("score") in (None, ""):
            if item.get("question_type") in table:
                item["score"] = table[item["question_type"]]


def parse_inline_options(body: str) -> tuple[dict[str, str], str]:
    matches = list(re.finditer(r"(?:(?<=^)|(?<=\s))([A-E])\s*[:：.．、]\s*", body, re.M))
    options: dict[str, str] = {}
    for i, match in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        value = re.split(r"\n\s*(?:答案|解析)", body[match.end() : end], maxsplit=1)[0]
        value = re.sub(r"\s+", " ", value).strip(" \t:-")
        if value:
            options[match.group(1)] = value
    content = body[: matches[0].start()] if matches else body
    return options, content


def parse_tagged(text: str) -> list[dict]:
    pattern = re.compile(r"(?m)^(\d{1,2})、\s*【([^】]+)】(.*?)(?=^\d{1,2}、\s*【|\Z)", re.S)
    questions = []
    for match in pattern.finditer(text):
        raw_type = match.group(2).strip()
        if raw_type in {"考点", "主考点", "副考点"}:
            continue
        qtype = TYPE_MAP.get(raw_type, raw_type)
        body = match.group(3).strip()
        answer = ""
        analysis = ""
        split = re.search(r"\n\s*答案\s*[：:]", body)
        if split:
            rest = body[split.end():]
            body = body[: split.start()]
            ana = re.search(r"\n\s*解析\s*[：:]", rest)
            if ana:
                answer = rest[: ana.start()].strip()
                analysis = rest[ana.end():].strip()
            else:
                answer = rest.strip()
        options, content = parse_inline_options(body)
        content = re.sub(r"\s+", " ", content).strip()
        if qtype.endswith("选择题"):
            answer = re.sub(r"[^A-E]", "", answer.upper())
        item = {
            "question_number": str(int(match.group(1))),
            "question_type": qtype,
            "content": content,
            "answer": answer,
            "score": None,
        }
        if options:
            item["options"] = options
        if analysis:
            item["analysis"] = analysis
        if content:
            questions.append(item)
    return questions


def parse_dianping_answers(text: str) -> dict[str, tuple[str, str]]:
    answers = {}
    pattern = re.compile(
        r"(?m)^(\d{1,2})、\s*【(?:主|副)?考点】[^\n]*\n+答案\s*[：:]\s*(.*?)(?=^\d{1,2}、\s*【(?:主|副)?考点】|\Z)",
        re.S,
    )
    for match in pattern.finditer(text):
        number = str(int(match.group(1)))
        body = match.group(2).strip()
        ana = ""
        split = re.search(r"\n\s*解析\s*[：:]", body)
        if split:
            ana = body[split.end():].strip()
            body = body[: split.start()].strip()
        body = re.sub(r"\s+", " ", body)
        body = re.sub(r"^（\s*", "（", body)
        body = re.split(r"【(?:主|副)?考点】", body)[0].strip()
        ana = re.split(r"【(?:主|副)?考点】", ana)[0].strip()
        if len(ana) > 800:
            ana = ana[:800].rstrip()
        answers[number] = (body, ana)
    return answers


def infer_type(number: int, header: str) -> str:
    if "多选" in header:
        return "多项选择题"
    if "单选" in header:
        return "单项选择题"
    if "名词解释" in header:
        return "名词解释"
    if "简答" in header:
        return "简答题"
    if "论述" in header:
        return "论述题"
    if "案例" in header or "综合" in header:
        return "材料分析题"
    if number <= 30:
        return "单项选择题"
    if number <= 35:
        return "多项选择题"
    if number <= 40:
        return "名词解释"
    if number <= 43:
        return "简答题"
    if number == 44:
        return "论述题"
    return "材料分析题"


def parse_classic_paper(text: str) -> list[dict]:
    text = text.replace("\u3000", " ").replace("\xa0", " ")
    text = re.sub(r"第\s*(\d{1,2})\s*题", r"\1．", text)
    text = re.split(r"(?m)^\d+、【考点】", text)[0]
    current_header = ""
    questions = []
    pattern = re.compile(r"(?m)^\s*(\d{1,2})[、.．]\s*(.*?)(?=^\s*\d{1,2}[、.．]\s*|\Z)", re.S)
    for match in pattern.finditer(text):
        number = int(match.group(1))
        if number < 1 or number > 46:
            continue
        body = match.group(2).strip()
        if any(body.startswith(p) for p in ("本大题", "在每小题", "答题前", "更多科目", "课程代码")):
            continue
        score_match = re.search(r"[（(](\d+)分[）)]", body)
        score = int(score_match.group(1)) if score_match else None
        body = re.sub(r"[（(]\d+分[）)]", "", body)
        if body.startswith("名词解释"):
            body = re.sub(r"^名词解释[：:]\s*", "", body).strip()
        options, content = parse_inline_options(body)
        key = re.search(r"【正确答案】\s*([A-E]{1,5})", body)
        ana = re.search(r"【答案解析】\s*(.+)$", body, re.S)
        content = re.sub(r"【正确答案】.*", "", content)
        content = re.sub(r"【答案解析】.*", "", content, flags=re.S)
        content = re.sub(r"[\(（]\s*[A-E]{0,5}\s*[\)）]", "", content)
        content = re.sub(r"\s+", " ", content).strip(" ：:")
        if not content or len(content) < 2:
            continue
        # track section headers appearing before this question
        prefix = text[: match.start()]
        for line in prefix.splitlines()[-8:]:
            if re.match(r"^[一二三四五六]、", line) or "选择题" in line or "名词解释" in line or "简答" in line or "论述" in line or "案例" in line or "综合题" in line:
                current_header = line
        qtype = infer_type(number, current_header)
        if options and number <= 30:
            qtype = "单项选择题"
        elif options and set(options) & set("E") and number >= 31:
            qtype = "多项选择题"
        item = {
            "question_number": str(number),
            "question_type": qtype,
            "content": content,
            "answer": key.group(1) if key else "",
            "score": score,
        }
        if options:
            item["options"] = options
        if ana:
            item["analysis"] = re.sub(r"\s+", " ", ana.group(1)).strip()
        questions.append(item)
    by_num: dict[int, dict] = {}
    for item in questions:
        number = int(item["question_number"])
        prev = by_num.get(number)
        if prev is None:
            by_num[number] = item
            continue
        item_opts = bool(item.get("options"))
        prev_opts = bool(prev.get("options"))
        if item_opts != prev_opts:
            if item_opts:
                by_num[number] = item
            continue
        item_ans = bool(str(item.get("answer") or "").strip())
        prev_ans = bool(str(prev.get("answer") or "").strip())
        if item_ans != prev_ans:
            if item_ans:
                by_num[number] = item
            continue
        if number <= 35:
            if len(item.get("options") or {}) > len(prev.get("options") or {}):
                by_num[number] = item
        elif len(item["content"]) > len(prev["content"]):
            by_num[number] = item
    return [by_num[n] for n in sorted(by_num)]


def merge_answers(questions: list[dict], answers: dict[str, tuple[str, str]]) -> None:
    for item in questions:
        number = item["question_number"]
        if number not in answers:
            continue
        ans, analysis = answers[number]
        if item["question_type"].endswith("选择题"):
            letters = re.sub(r"[^A-E]", "", ans.upper())
            item["answer"] = letters or ans
        else:
            item["answer"] = ans
        if analysis:
            item["analysis"] = analysis


def quality(questions: list[dict]) -> tuple[int, int, int]:
    return (
        len(questions),
        sum(1 for q in questions if str(q.get("answer") or "").strip()),
        sum(1 for q in questions if q.get("score") not in (None, "")),
    )


def pick_records(records: list[dict]) -> list[dict]:
    def paper_rank(rec: dict) -> tuple:
        name = Path(rec["source"]).name
        chars = rec.get("chars") or 0
        prefer = 0
        if "考点解析" in name:
            prefer -= 8
        if chars < 800:
            prefer -= 25
        if "考点解析" in name:
            prefer -= 3
        if "答案在试卷后" in name or "整理版" in name:
            prefer += 6
        if "解析版" in name:
            prefer += 4
        if "真题和答案" in name or "含评分" in name or "含答案" in name:
            prefer += 3
        return (prefer, chars)

    ranked = sorted(records, key=paper_rank, reverse=True)
    paper = ranked[0]
    extras = [
        r
        for r in ranked[1:]
        if any(key in Path(r["source"]).name for key in ("考点解析", "解析版", "答案"))
    ]
    return [paper] + extras


def _norm_stem(text: str) -> str:
    text = re.sub(r"[（(].*?[)）]", "", text)
    return re.sub(r"\s+", "", text)[:28]


def merge_by_stem(questions: list[dict], extras: list[dict]) -> None:
    index = {_norm_stem(q["content"]): q for q in extras if str(q.get("answer") or "").strip()}
    for item in questions:
        src = index.get(_norm_stem(item["content"]))
        if not src:
            continue
        if not str(item.get("answer") or "").strip():
            item["answer"] = src["answer"]
        if src.get("analysis") and not item.get("analysis"):
            item["analysis"] = src["analysis"]
        if src.get("options") and not item.get("options"):
            item["options"] = src["options"]


def parse_choice_grid(text: str) -> dict[str, str]:
    answers: dict[str, str] = {}
    starts = [text.find(m) for m in ("试题答案", "参考答案", "评分参考") if text.find(m) >= 0]
    if not starts:
        return answers
    text = text[min(starts):]
    for match in re.finditer(r"(\d+)\s*[-—–]\s*(\d+)\s+([A-E]+)", text):
        start, end, letters = int(match.group(1)), int(match.group(2)), match.group(3)
        if end - start + 1 == len(letters):
            for i, ch in enumerate(letters):
                answers[str(start + i)] = ch
    for match in re.finditer(
        r"(?m)(?:^|\s)(\d{1,2})\s*[.、．]?\s*([A-E](?:\s*[A-E]){0,4})(?=\s|$)",
        text,
    ):
        number = str(int(match.group(1)))
        letters = re.sub(r"\s+", "", match.group(2))
        if int(number) <= 35:
            answers[number] = letters
    return answers


def parse_subjective_key(text: str) -> dict[str, str]:
    answers: dict[str, str] = {}
    starts = [text.find(marker) for marker in ("试题答案", "参考答案", "评分参考") if text.find(marker) >= 0]
    if not starts:
        return answers
    text = text[min(starts):]
    for match in re.finditer(
        r"(?m)^(\d{2})\s*[.、．]\s*(.+?)(?=^\d{2}\s*[.、．]|^[一二三四五六]、|\Z)",
        text,
        re.S,
    ):
        number = int(match.group(1))
        if number < 36:
            continue
        answers[str(number)] = re.sub(r"\s+", " ", match.group(2)).strip()
    return answers


def convert_00040_group(label: str, records: list[dict]) -> str:
    records = pick_records(records)
    texts = []
    for rec in records:
        path = Path(rec["source"])
        raw = (CACHE / f"{rec['id']}.txt").read_text(encoding="utf-8")
        texts.append(raw)
    combined = "\n\n".join(texts)
    tagged = parse_tagged(combined)
    tagged_opts = sum(1 for q in tagged if q.get("options") and any(str(v).strip() for v in q["options"].values()))
    if len(tagged) >= 40 and tagged_opts >= 20:
        apply_scores(tagged, SCORE_00040)
        write_exam("00040", label, tagged, records)
        n, a, s = quality(tagged)
        return f"OK tagged {label}: {n} q / {a} ans / {s} score"

    paper_text = texts[0]
    questions = parse_classic_paper(paper_text)
    paper_opts = sum(1 for q in questions if q.get("options"))
    extra_bank = []
    for alt in texts[1:]:
        extra_qs = parse_classic_paper(alt)
        extra_bank.extend(extra_qs)
        extra_opts = sum(1 for q in extra_qs if q.get("options"))
        same = bool(questions and extra_qs and _norm_stem(questions[0]["content"]) == _norm_stem(extra_qs[0]["content"]))
        if (len(questions) < 40 and len(extra_qs) >= 40) or (extra_opts > paper_opts and same):
            questions, paper_opts = extra_qs, extra_opts
        overlap = 0
        if questions and extra_qs:
            left = {_norm_stem(q["content"]) for q in questions}
            right = {_norm_stem(q["content"]) for q in extra_qs}
            overlap = len(left & right - {""})
        if same or overlap >= 25:
            merge_by_stem(questions, extra_qs)
    answers = parse_dianping_answers(combined)
    if extra_bank and questions:
        same_order = _norm_stem(questions[0]["content"]) == _norm_stem(extra_bank[0]["content"])
        overlap = len({_norm_stem(q["content"]) for q in questions} & {_norm_stem(q["content"]) for q in extra_bank} - {""})
        if same_order:
            merge_answers(questions, answers)
        elif overlap >= 25:
            keyed = []
            for extra in extra_bank:
                pair = answers.get(extra["question_number"])
                if not pair:
                    continue
                extra = dict(extra)
                extra["answer"] = pair[0]
                extra["analysis"] = pair[1]
                keyed.append(extra)
            merge_by_stem(questions, keyed)
    else:
        merge_answers(questions, answers)
    grid = parse_choice_grid(combined)
    subj = parse_subjective_key(combined)
    for item in questions:
        if item.get("answer"):
            continue
        if item["question_number"] in grid:
            item["answer"] = grid[item["question_number"]]
        elif item["question_number"] in subj:
            item["answer"] = subj[item["question_number"]]
        elif item["question_type"].endswith("选择题"):
            found = re.search(r"[\(（]\s*([A-E]{1,5})\s*[\)）]", item["content"])
            if found:
                item["answer"] = found.group(1)
    apply_scores(questions, SCORE_00040)
    n, a, s = quality(questions)
    if n < 30:
        return f"NEED_LLM {label}: parsed {n} q / {a} ans"
    write_exam("00040", label, questions, records)
    return f"OK classic {label}: {n} q / {a} ans / {s} score"


def finish_03333_chapters() -> None:
    pattern = re.compile(
        r"(?m)^(单选|多选|填空题|名词解释题|简答题|论述题|案例分析题)\s*\n\s*(单选题|多选题|问答题)(?:\s*\|\s*(\d+)分)?\s*\n(\d+)、\s*\n"
    )
    type_map = {
        "单选": "单项选择题",
        "多选": "多项选择题",
        "名词解释题": "名词解释",
        "案例分析题": "材料分析题",
    }
    for (code, label), records in groups().items():
        if code != "03333" or re.match(r"20\d{2}年", label):
            continue
        out = exam_path(code, label)
        if out.exists():
            continue
        rec = records[0]
        text = (CACHE / f"{rec['id']}.txt").read_text(encoding="utf-8")
        matches = list(pattern.finditer(text))
        questions = []
        for i, match in enumerate(matches):
            body = text[match.end() : matches[i + 1].start() if i + 1 < len(matches) else len(text)].strip()
            body = re.split(r"(?m)^(?:第[一二三四五六七八九十]+节|[一二三四五六七八九十]+、[^\n]*共\d+题)", body)[0].strip()
            main, *analysis = re.split(r"(?m)^解析\s*\n", body, maxsplit=1)
            main, *answer = re.split(r"正确答案[：:]\s*", main, maxsplit=1)
            opts = list(re.finditer(r"(?m)^([A-E])\s+", main))
            item = {
                "question_number": str(i + 1),
                "source_question_number": match.group(4),
                "question_type": type_map.get(match.group(1), match.group(1)),
                "content": main[: opts[0].start()].strip() if opts else main.strip(),
                "answer": (answer[0].strip() if answer else (analysis[0].strip() if analysis else "")),
                "score": int(match.group(3)) if match.group(3) else None,
            }
            if opts:
                item["options"] = {
                    opt.group(1): main[opt.end() : opts[j + 1].start() if j + 1 < len(opts) else len(main)].strip()
                    for j, opt in enumerate(opts)
                }
                if item["answer"] and set(item["answer"]) - set(item["options"]):
                    item["answer"] = re.sub(r"[^A-E]", "", item["answer"].upper())
                if analysis and analysis[0].strip() not in {"暂无", "无"}:
                    item["analysis"] = analysis[0].strip()
            if item["content"] and item["answer"]:
                questions.append(item)
        if not questions:
            print("SKIP empty", label, flush=True)
            continue
        write_exam(code, label, questions, records)
        print(f"OK chapter {label}: {len(questions)}", flush=True)


def fill_03333_guangdong_scores() -> None:
    for name in ("2026年1月03333电子政务概论.json", "2026年4月03333电子政务概论.json"):
        path = ROOT / "json" / "03333" / name
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        apply_scores(data["questions"], SCORE_03333_GD)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("scored", name, flush=True)


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    finish_03333_chapters()
    fill_03333_guangdong_scores()
    rebuild = "--rebuild-00040" in sys.argv
    ocr_later = {
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
    need_llm = []
    for (code, label), records in sorted(groups().items()):
        if code != "00040":
            continue
        if label in ocr_later:
            print("skip ocr-later", label, flush=True)
            continue
        out = exam_path(code, label)
        if out.exists() and not rebuild:
            print("cached", label, flush=True)
            continue
        try:
            result = convert_00040_group(label, records)
            print(result, flush=True)
            if result.startswith("NEED_LLM"):
                need_llm.append((label, records))
        except Exception as exc:
            print("FAIL", label, type(exc).__name__, exc, flush=True)
            need_llm.append((label, records))
    if need_llm and not rebuild:
        print("NEED_LLM_COUNT", len(need_llm), flush=True)
        from import_03333_00040 import convert_group

        for label, records in need_llm:
            try:
                print(convert_group(("00040", label), records), flush=True)
            except Exception as exc:
                print("LLM_FAIL", label, type(exc).__name__, exc, flush=True)


if __name__ == "__main__":
    main()
