# -*- coding: utf-8 -*-
"""Build study units from local outlines, 考前资料, and existing papers."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JSON = ROOT / "json"
KNOW = ROOT / "knowledge"


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def dump(path: Path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def clean(text: str, limit=420) -> str:
    s = re.sub(r"\s+", " ", str(text or "")).strip()
    s = re.sub(r"\d+\s*/\s*\d+", "", s)
    s = re.split(r"(?:电子政务概论|电子教辅|公共政策导论)\s+\d+", s)[0]
    s = re.split(r"第[一二三四五六七八九十]+节", s)[0]
    s = re.split(r"第[一二三四五六七八九十]+章", s)[0]
    return s.strip(" 。;；")[:limit]


GENERIC = {"公共政策", "政策", "电子政务", "政府", "网络", "法律"}


def q_ok(q):
    opts = q.get("options") or {}
    ans = str(q.get("answer") or "").strip()
    return bool(opts) and ans in opts


def qkey(q):
    return re.sub(r"\s+", "", str(q.get("content") or ""))[:80]


def pack_question(q, source_path, kind):
    if not q:
        return None
    analysis = clean(q.get("analysis") or q.get("explanation") or "", 240)
    if not analysis:
        analysis = f"正确答案是 {q.get('answer')}。对照本章识记点里的关键词排除明显无关选项。"
    return {
        "stem": q.get("content") or "",
        "options": q["options"],
        "answer": str(q.get("answer")).strip(),
        "explanation": analysis,
        "sourcePath": source_path.replace("\\", "/"),
        "sourceNumber": str(q.get("question_number") or ""),
        "kind": kind,
    }


OFF_TOPIC = {
    "法律的一般理论": [
        "民事诉讼", "刑事诉讼", "行政诉讼", "民事诉讼法", "刑事诉讼法", "行政诉讼法",
        "刑法", "民法", "经济法", "国际法", "国际私法", "民事法律关系", "意思表示",
        "民法典", "合同", "反致", "涉外民事", "冲突规范", "连接点", "税收", "环境与自然资源",
        "行政法", "宪法", "票据",
    ],
    "宪法": ["民事诉讼", "刑事诉讼", "行政诉讼", "刑法", "民法", "经济法"],
    "行政法": ["民事诉讼", "刑事诉讼", "刑法", "民法", "国际私法"],
    "刑法": ["民事诉讼", "行政诉讼", "民法", "经济法", "行政法"],
    "民法": ["刑事诉讼", "行政诉讼", "刑法", "经济法", "国际法"],
    "经济法": ["国际经济法", "国际私法", "刑事诉讼", "行政诉讼", "刑法"],
    "刑事诉讼法": ["民事诉讼", "行政诉讼", "民法", "经济法"],
    "民事诉讼法": ["刑事诉讼", "行政诉讼", "刑法"],
    "行政诉讼法": ["刑事诉讼", "民事诉讼举证", "刑法"],
    "国际公法": ["国际私法", "冲突规范", "准据法", "民事诉讼法"],
    "国际私法": ["国际公法", "刑事诉讼", "行政诉讼"],
}


def score_q(q, needles, chapter_title=""):
    blob = (q.get("content") or "") + "".join(str(v) for v in (q.get("options") or {}).values())
    score = 0
    for n in needles:
        n = str(n or "").strip(" 。.;；")
        if len(n) < 2 or n in GENERIC:
            continue
        if n in blob:
            score += 3 if len(n) >= 4 else 2
    for bad in OFF_TOPIC.get(chapter_title) or []:
        if bad in blob:
            score -= 8
    return score


def pick_mcq(items, needles, used, min_score=1, allow_fallback=False, chapter_title=""):
    """items: list of q, or list of (path, q)."""
    ranked = []
    for it in items or []:
        path, q = it if isinstance(it, tuple) else ("", it)
        if not q_ok(q):
            continue
        key = qkey(q)
        if not key or key in used:
            continue
        ranked.append((score_q(q, needles, chapter_title), path, q, key))
    ranked.sort(key=lambda x: x[0], reverse=True)
    if ranked and ranked[0][0] >= min_score:
        _, path, q, key = ranked[0]
        used.add(key)
        return path, q
    if allow_fallback and ranked:
        _, path, q, key = ranked[0]
        used.add(key)
        return path, q
    return "", None


def tidy_terms(items, min_len=2):
    out = []
    skip = {"公共", "合法", "政", "证", "反", "方", "标签", "沉没", "帕累"}
    for x in items or []:
        s = str(x).strip(" 。.;；、")
        if len(s) < min_len or s in skip or s.endswith("的"):
            continue
        if s not in out:
            out.append(s)
    return out


def unit(uid, title, minutes, explain, exam, example, contrast, prompt, checks, source, question, quality, chapter_title=""):
    return {
        "id": uid,
        "chapterTitle": chapter_title or title,
        "title": title,
        "minutes": minutes,
        "explain": explain,
        "examAnswer": exam,
        "example": example,
        "contrast": contrast,
        "recallPrompt": prompt,
        "checkpoints": checks,
        "source": source,
        "question": question,
        "quality": quality,
    }


def kaoqian_map(data):
    out = {}
    for ch in data.get("kaoqian_points_21ch") or []:
        out[ch.get("title") or ""] = ch.get("points") or []
    return out


def jiaofu_map(items):
    out = []
    for it in items or []:
        title = clean(it.get("title") or "", 80)
        ans = clean(it.get("answer") or it.get("summary") or "", 360)
        if title and ans and len(ans) > 12:
            out.append({"title": title, "answer": ans})
    return out


def find_qa(items, keywords):
    for it in items:
        title = it["title"]
        if any(k and len(str(k)) >= 3 and str(k) in title for k in keywords):
            return it
    return None


def build_03333():
    outline = load(KNOW / "03333-knowledge.json")
    kao = kaoqian_map(outline)
    jiaofu = jiaofu_map(outline.get("jiaofu_qa"))
    chapters = outline["chapters"]
    paper_dir = JSON / "03333"
    papers = {p.name: p for p in paper_dir.glob("*.json")}

    def paper_for(title):
        for name, path in papers.items():
            if title in name and "章" in name:
                return path
        return None

    units = []
    for i, ch in enumerate(chapters):
        title = ch["title"]
        cid = ch["id"]
        if cid == "03333-ch01":
            continue
        points = kao.get(title) or []
        path = paper_for(title)
        paper = load(path) if path else {"questions": []}
        rel = str(path.relative_to(ROOT)).replace("\\", "/") if path else ""
        take = points[:2] if points else [{"title": title, "summary": "；".join((ch.get("remember") or [])[:4])}]
        used = set()
        used_qa = set()
        qs = [x for x in (paper.get("questions") or []) if q_ok(x)]
        remember = tidy_terms(ch.get("remember") or [])
        understand = tidy_terms(ch.get("understand") or [])
        for j, pt in enumerate(take):
            ptitle = pt.get("title") or title
            summary = clean(pt.get("summary") or "", 380)
            qa = None
            for it in jiaofu:
                if it["title"] in used_qa:
                    continue
                if any(k and len(str(k)) >= 3 and str(k) in it["title"] for k in (ptitle[:6], title[:6], ptitle)):
                    qa = it
                    used_qa.add(it["title"])
                    break
            exam = clean(qa["answer"] if qa else summary or "；".join(remember[:6]), 420)
            explain = summary or f"本章围绕「{title}」。先记住大纲识记点，再能说明领会点。"
            if not summary:
                explain = (
                    f"这一章要掌握「{title}」。"
                    + (f"识记：{'；'.join(remember[:8])}。" if remember else "")
                    + (f"领会：{'；'.join(understand[:4])}。" if understand else "")
                )
            needles = [ptitle, title] + remember[:4] + [ptitle[:4], title[2:6]]
            _, q = pick_mcq(qs, needles, used, min_score=1, allow_fallback=True, chapter_title=title)
            question = pack_question(q, rel, "章节练习") if q else None
            checks = [f"能说出：{ptitle}"]
            for item in (ch.get("remember") or [])[:2]:
                if item not in checks[-1]:
                    checks.append(f"能说出：{item}")
            units.append(unit(
                f"{cid}-u{j+1:02d}",
                ptitle,
                7 + (1 if question else 0),
                explain,
                exam or ptitle,
                f"对照本章重点「{ch.get('focus') or title}」，用一个政务场景套上这个考点。",
                f"不要把「{title}」和相邻章节混为一谈。难点：{ch.get('hard') or '先分清识记和领会'}。",
                f"不看讲解，说出「{ptitle}」的核心要点。",
                checks[:4],
                {
                    "label": "广东大纲 + 本地考前资料/章节练习",
                    "path": "knowledge/03333-knowledge.json" if not rel else rel,
                    "location": f"{ch.get('heading')} {title} · {ptitle}",
                },
                question,
                "local" if question else "outline",
                f"{ch.get('heading', '')} {title}".strip(),
            ))
    return {
        "code": "03333",
        "name": "电子政务概论",
        "notes": [
            "第一章仍用 knowledge/pilot-03333.json 的精讲三单元。",
            "其余章用大纲识记/领会 + 考前资料摘要；有章节练习则挂一道选择题，标注为章节练习而非历年真题。",
        ],
        "units": units,
    }


def collect_bank_mcqs(subject):
    items = []
    folder = JSON / subject
    if not folder.exists():
        return items
    for path in sorted(folder.glob("*.json")):
        data = load(path)
        rel = str(path.relative_to(ROOT)).replace("\\", "/")
        for q in data.get("questions") or []:
            if q.get("options") and str(q.get("answer") or "").strip() in (q.get("options") or {}):
                items.append((rel, q))
    return items


XIE_QA_KEYS = {
    "绪论": ["公共政策的定义", "公共政策活动的基本特征", "公共物品", "公共职能"],
    "公共政策的形式、类型、特征与作用": ["基本功能", "公共政策的分类", "分配原则"],
    "政策主体、政策客体与政策环境": ["政策行动主体", "政治法律环境", "政策环境"],
    "政策模型及其相关理论": ["系统分析", "理性决策", "决策模型"],
    "政策制定": ["政策议程", "政策规划", "政策决策", "触发机制"],
    "政策执行": ["政策执行的特征", "政策执行人员", "政策对象对政策执行"],
    "政策评估": ["政策评估的标准", "政策指标"],
    "政策终结": ["政策终结的作用", "政策终结"],
}

XIE_MCQ_NEEDLES = {
    "绪论": ["公共物品", "公共职能", "全民公决", "直接民主", "间接民主", "公共政策的含义", "开山之作", "政策科学"],
    "公共政策的形式、类型、特征与作用": ["分类", "实质性政策", "程序性政策", "分配性", "象征性", "三权分立", "议行合一", "基本功能", "导引"],
    "政策主体、政策客体与政策环境": ["利益集团", "思想库", "目标群体", "政策环境", "院外", "非官方", "官方决策"],
    "政策模型及其相关理论": ["理性主义", "有限理性", "精英理论", "团体理论", "系统理论", "囚徒困境", "渐进"],
    "政策制定": ["政策议程", "政策规划", "听证", "德尔菲", "头脑风暴", "合法化", "触发机制", "政策问题"],
    "政策执行": ["政策执行", "破窗", "逆反", "超限", "执行人员", "政策对象", "政策工具"],
    "政策评估": ["政策评估", "政策输出", "威尔逊", "阿罗", "漏桶", "公平性", "效率"],
    "政策终结": ["政策终结", "政策废止", "政策替代", "政策合并", "政策分解", "政策缩减"],
}


def build_13672():
    raw = load(KNOW / "13672-knowledge.json")
    chapters = raw["official_outline_xieming"]["chapters"]
    suji = jiaofu_map(raw.get("qa_points"))
    jiaofu = jiaofu_map(raw.get("jiaofu_qa"))
    bank = collect_bank_mcqs("00318")
    used = set()
    units = []
    for ch in chapters:
        title = ch["title"]
        remember = tidy_terms(ch.get("remember") or [])
        understand = tidy_terms(ch.get("understand") or [], min_len=4)
        apply = tidy_terms(ch.get("apply") or [], min_len=6)
        qa = find_qa(suji + jiaofu, XIE_QA_KEYS.get(title) or [title] + remember[:2])
        exam = (qa["answer"] if qa else "\n".join(
            [f"识记：{x}" for x in remember[:8]] + [f"领会：{x}" for x in understand[:5]]
        ))
        needles = XIE_MCQ_NEEDLES.get(title) or ([title] + remember[:4])
        rel, best = pick_mcq(bank, needles, used, min_score=2, allow_fallback=True, chapter_title=title)
        question = pack_question(best, rel, "题库练习（00318）") if best else None
        explain = (
            f"按谢明《公共政策导论》最新大纲学习「{title}」。"
            f"{'内容包括：' + '、'.join(ch.get('sections') or []) + '。' if ch.get('sections') else ''}"
            f"{'先识记：' + '；'.join(remember[:6]) + '。' if remember else ''}"
            f"{'再领会：' + '；'.join(understand[:4]) + '。' if understand else ''}"
        )
        units.append(unit(
            ch["id"],
            f"{ch.get('heading', '')} {title}".strip(),
            8 if question else 7,
            explain,
            exam or title,
            f"用一条最近的公共事务（交通、住房、环保均可）套本章：{apply[0] if apply else '它属于哪一类政策、经过了哪个环节'}。",
            "本章按 13672 谢明大纲，不要用旧课 00318 教辅那套「理解公共政策…调整与终结」目录来记章名。",
            f"不看讲解，列出「{title}」的主要识记点。",
            [f"能说出：{x}" for x in (remember[:4] or [title])],
            {
                "label": "谢明《公共政策导论》大纲转载",
                "path": "knowledge/13672-gzyszxy-outline.txt",
                "location": f"{ch.get('heading')} {title}",
            },
            question,
            "local" if question else "outline",
            f"{ch.get('heading', '')} {title}".strip(),
        ))
    return {
        "code": "13672",
        "name": "公共政策导论",
        "notes": [
            "章节按 13672 谢明最新大纲。关联选择题来自题库中的 00318 试卷，只作练习，不称为 13672 历年真题。",
        ],
        "units": units,
    }


LAW_MCQ_NEEDLES = {
    "法律的一般理论": ["法律的本质", "法律的基本特征", "社会主义法制", "依法治国", "法律关系", "法律创制", "法律适用", "道德"],
    "宪法": ["宪法", "国体", "政体", "国家机构", "基本权利", "人权", "选举", "国家主席"],
    "行政法": ["行政法", "行政行为", "行政复议", "行政许可", "行政强制", "行政处罚", "行政机关"],
    "刑法": ["刑法", "犯罪", "刑罚", "累犯", "正当防卫", "犯罪构成", "罪刑法定"],
    "民法": ["民法", "民法典", "民事", "诉讼时效", "合同", "物权", "定金", "法人"],
    "经济法": ["经济法", "反垄断", "不正当竞争", "消费者", "公司法", "国有企业", "市场监管"],
    "刑事诉讼法": ["刑事诉讼", "上诉", "抗诉", "侦查", "公诉", "强制措施"],
    "民事诉讼法": ["民事诉讼", "管辖", "诉讼参加人", "身份关系"],
    "行政诉讼法": ["行政诉讼", "举证责任", "被告", "原告", "行政行为确实"],
    "国际公法": ["国际法", "国际公法", "主权", "条约", "国家责任", "外交"],
    "国际私法": ["国际私法", "冲突规范", "准据法", "连接点", "涉外民事"],
}


def build_00040():
    raw = load(KNOW / "00040-knowledge.json")
    chapters = raw["chapters"]
    bank = collect_bank_mcqs("00040")
    bank.sort(key=lambda x: x[0], reverse=True)
    used = set()
    units = []
    for ch in chapters:
        title = ch["title"]
        remember = tidy_terms(ch.get("remember") or [])
        understand = tidy_terms(ch.get("understand") or [], min_len=4)
        subs = [s.get("title") for s in (ch.get("toc_numbered") or []) if s.get("title")]
        needles = LAW_MCQ_NEEDLES.get(title) or ([title] + remember[:4] + subs[:3])
        rel, best = pick_mcq(bank, needles, used, min_score=2, allow_fallback=True, chapter_title=title)
        question = pack_question(best, rel, "题库练习") if best else None
        explain = (
            f"这一章是「{title}」。"
            f"{'先掌握：' + '、'.join(subs[:5]) + '。' if subs else ''}"
            f"{'识记：' + '；'.join(remember[:6]) + '。' if remember else ''}"
            f"{'领会：' + '；'.join(understand[:4]) + '。' if understand else ''}"
            "定义以夏锦文《法学概论》为准，注意法律修订后以考试日前有效规定为准。"
        )
        exam = "\n".join([f"识记：{x}" for x in remember[:8]] + [f"领会：{x}" for x in understand[:5]])
        units.append(unit(
            ch["id"],
            f"{ch.get('heading', '')} {title}".strip(),
            8 if question else 7,
            explain,
            exam or title,
            f"看到新闻里的案子，先问：它更靠近本章的哪一块（{('、'.join(subs[:3]) or title)}）？",
            f"不要把「{title}」和其他部门法的相似术语混用。难点：{ch.get('hard') or '先记概念再套案例'}。",
            f"不看讲解，说出「{title}」这一章至少三个识记点。",
            [f"能说出：{x}" for x in (remember[:4] or subs[:3] or [title])],
            {
                "label": "广东法学概论大纲转载 + 题库已有试卷",
                "path": "knowledge/00040-gd-outline.txt",
                "location": f"{ch.get('heading')} {title}",
            },
            question,
            "local" if question else "outline",
            f"{ch.get('heading', '')} {title}".strip(),
        ))
    return {
        "code": "00040",
        "name": "法学概论",
        "notes": [
            "11 章按广东大纲。关联题来自已入库试卷，标为题库练习；法律修订后以考试日前有效规定为准。",
        ],
        "units": units,
    }


def main():
    a = build_03333()
    b = build_13672()
    c = build_00040()
    dump(KNOW / "units-03333.json", a)
    dump(KNOW / "units-13672.json", b)
    dump(KNOW / "units-00040.json", c)
    print("03333 extra units", len(a["units"]), "with Q", sum(1 for u in a["units"] if u["question"]))
    print("13672 units", len(b["units"]), "with Q", sum(1 for u in b["units"] if u["question"]))
    print("00040 units", len(c["units"]), "with Q", sum(1 for u in c["units"] if u["question"]))
    for u in a["units"][:3]:
        print(" ", u["id"], u["title"], "Q" if u["question"] else "-")


if __name__ == "__main__":
    main()
