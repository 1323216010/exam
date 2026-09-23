/**
 * 题目有效性过滤
 * ---------------------------------------------------------------------------
 * 题库来自多个 OCR / 文档转换来源，个别试卷存在无法通过程序可靠修复的
 * 结构损坏。这些问题若进入练习会造成困惑（甚至把答题说明当成题目来答）：
 *
 *   1. 题干是答题说明文字，真正的题目在转换中丢失
 *      例如「本卷所有试题必须在答题卡上作答。答在试卷上无效……」
 *   2. 标注为选择题，但选项在转换中丢失（只剩题干和答案）
 *   3. 答案字段被写成了题干+选项的副本，真正的答案字母丢失
 *
 * 处理原则：能可靠修复的在数据层修（见 json/ 内的清理），无法可靠推断的
 * 在这里统一剔除，并且**绝不猜答案**。剔除只影响作答，原始数据仍保留在
 * JSON 里，便于以后找到可靠来源时补回。
 */

// 卷面说明性文字：这些句子不可能是真正的题干
const BOILERPLATE_PATTERNS = [
    /本卷所有试题必须在答题卡上作答/,
    /第一部分为选择题/,
    /第二部分为非选择题/,
    /合理安排答题空间/,
    /在每小题列出的(四个|五个)备选项中/,
    /请将其选出并将/,
    /未涂、错涂或多涂均无分/,
    /答题卡.{0,6}的相应代码涂黑/,
    /超出答题区域无效/,
];

/**
 * 判断一道题是否可以安全地用于作答。
 * @returns {{ok: boolean, reason?: string}}
 */
export function validateQuestion(q) {
    if (!q || typeof q !== 'object') return { ok: false, reason: 'empty' };

    const content = String(q.content ?? '').trim();
    const type = String(q.question_type ?? '');
    const options = q.options && typeof q.options === 'object' ? q.options : null;
    const answer = q.answer == null ? '' : String(q.answer).trim();

    // 1) 题干缺失
    if (!content) return { ok: false, reason: 'no-content' };

    // 2) 题干是卷面说明
    if (BOILERPLATE_PATTERNS.some((re) => re.test(content))) {
        return { ok: false, reason: 'boilerplate-stem' };
    }

    // 3) 标注为选择题但没有可用选项
    const looksChoice = /选择/.test(type);
    const optionKeys = options ? Object.keys(options).filter((k) => String(options[k] ?? '').trim()) : [];
    if (looksChoice && optionKeys.length < 2) {
        return { ok: false, reason: 'choice-without-options' };
    }

    // 4) 数据层已标记答案缺失（OCR 把题干写进了答案字段）
    if (q.answer_missing) return { ok: false, reason: 'answer-missing' };

    // 4b) 数据层已标记「答案不可信」（答案表与题目错位）。
    // 这类题可以练习，但绝不能展示答案或参与判分 —— 错答案比没答案更危险。
    if (q.answer_unreliable) return { ok: true, ignoreAnswer: true };

    // 5) 选择题的答案必须是字母，且落在选项范围内
    if (looksChoice && optionKeys.length >= 2) {
        if (!/^[A-Z]+$/.test(answer)) {
            // 选择题答案不是字母：多为答案字段被污染
            if (answer) return { ok: false, reason: 'choice-answer-not-letter' };
            // 答案为空的单选/多选题仍可作答，但无法判分；保留（前端会隐藏「显示答案」）
        } else if (optionKeys.length && [...answer].some((ch) => !optionKeys.includes(ch))) {
            return { ok: false, reason: 'answer-out-of-range' };
        }
    }

    return { ok: true };
}

/** 过滤一组题目，并可选择返回被剔除的原因统计（便于排查）。 */
export function filterValidQuestions(questions, stats) {
    const out = [];
    for (const q of Array.isArray(questions) ? questions : []) {
        const r = validateQuestion(q);
        if (!r.ok) {
            if (stats) stats[r.reason] = (stats[r.reason] || 0) + 1;
            continue;
        }
        // 答案不可信的题：保留可作答，但清掉答案，避免展示/判分错误答案
        if (r.ignoreAnswer) {
            if (stats) stats.answerUnreliableKept = (stats.answerUnreliableKept || 0) + 1;
            out.push({ ...q, answer: null, analysis: null });
            continue;
        }
        out.push(q);
    }
    return out;
}
