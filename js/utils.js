// 工具函数

// 从路径中提取文件名（不含扩展名）
export function getFilenameFromPath(path) {
    if (typeof path !== 'string') return '';
    const normalized = path.split('?')[0];
    const filename = normalized.split(/[/\\]/).pop() || '';
    return filename.replace(/\.json$/i, '');
}

const SUBJECT_NAMES = {
    '00040': '法学概论',
    '03333': '电子政务概论',
    '00292': '市政学',
    '00312': '政治学概论',
    '00318': '公共政策导论',
    '00341': '公文写作与处理',
    '12656': '毛概',
    '15041': '毛概'
};

export function getSubjectDisplayName(subject) {
    return SUBJECT_NAMES[subject] || subject || '';
}

function normalizeExamDate(value) {
    if (!value) return '';

    const text = String(value).trim();
    const yearMonth = text.match(/((?:19|20)\d{2})\s*(?:年|-)?\s*(1[0-2]|0?[1-9])\s*月?/);
    if (yearMonth) {
        return `${yearMonth[1]}年${Number(yearMonth[2])}月`;
    }

    const compactDate = text.match(/((?:19|20)\d{2})(0[1-9]|1[0-2])/);
    if (compactDate) {
        return `${compactDate[1]}年${Number(compactDate[2])}月`;
    }

    const halfYear = text.match(/((?:19|20)\d{2})\s*年?\s*(上半年|下半年)/);
    if (halfYear) {
        return `${halfYear[1]}年${halfYear[2]}`;
    }

    return '';
}

export function getExamDateLabel(exam) {
    if (!exam || typeof exam !== 'object') return '';

    const path = exam.path || exam.file || '';
    return normalizeExamDate(exam.exam_info?.date)
        || normalizeExamDate(getFilenameFromPath(path));
}

export function getExamDateValue(exam) {
    const label = getExamDateLabel(exam);
    if (!label) return 0;

    const yearMonth = label.match(/((?:19|20)\d{2})年(\d{1,2})月/);
    if (yearMonth) {
        return Number(yearMonth[1]) * 100 + Number(yearMonth[2]);
    }

    const halfYear = label.match(/((?:19|20)\d{2})年(上半年|下半年)/);
    if (halfYear) {
        return Number(halfYear[1]) * 100 + (halfYear[2] === '上半年' ? 6 : 12);
    }

    return 0;
}

export function compareExamsByDate(a, b, direction = 'desc') {
    const diff = getExamDateValue(a) - getExamDateValue(b);
    if (diff !== 0) return direction === 'asc' ? diff : -diff;

    const nameA = getExamDisplayName(a);
    const nameB = getExamDisplayName(b);
    return direction === 'asc'
        ? nameA.localeCompare(nameB, 'zh')
        : nameB.localeCompare(nameA, 'zh');
}

// 统一试卷显示名称，避免直接展示格式不一致的来源文件名。
export function getExamDisplayName(exam) {
    if (!exam || typeof exam !== 'object') return '';

    const path = exam.path || exam.file || '';
    const filename = getFilenameFromPath(path);
    const date = normalizeExamDate(exam.exam_info?.date)
        || normalizeExamDate(filename);
    const subject = getSubjectDisplayName(exam.subject)
        || String(exam.exam_info?.subject || '').replace(/(?:试题|试卷)$/, '').trim();

    if (date && subject) return `${date} · ${subject}`;
    const title = String(exam.exam_info?.title || '').trim();
    if (title) return title;
    return subject || date || filename;
}

// 数组随机排序（Fisher-Yates 算法）
export function shuffleArray(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

// 格式化时间
export function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// 计时器管理
export class Timer {
    constructor(startTime, callback) {
        this.startTime = startTime;
        this.callback = callback;
        this.interval = null;
    }

    start() {
        this.interval = setInterval(() => {
            const elapsed = Math.floor((new Date() - this.startTime) / 1000);
            this.callback(formatTime(elapsed));
        }, 1000);
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
}
