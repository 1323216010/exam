const COURSES = [
    {
        code: '03333',
        file: 'knowledge/03333-knowledge.json',
        label: '电子政务概论',
        examCode: '03333'
    },
    {
        code: '13672',
        file: 'knowledge/13672-knowledge.json',
        label: '公共政策导论',
        examCode: '13672 / 00318'
    },
    {
        code: '00040',
        file: 'knowledge/00040-knowledge.json',
        label: '法学概论',
        examCode: '00040'
    }
];

const cache = new Map();
let activeCode = COURSES[0].code;
let activeChapterId = '';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function listItems(items) {
    if (!Array.isArray(items) || items.length === 0) return '';
    return `<ul class="knowledge-points">${items.map(item => {
        if (typeof item === 'string') return `<li>${escapeHtml(item)}</li>`;
        const title = item.title || item.name || '';
        const extra = item.stars || item.kinds || item.freq
            ? `<span class="knowledge-meta">${escapeHtml([item.stars, item.kinds, item.freq != null ? `${item.freq}次` : ''].filter(Boolean).join(' · '))}</span>`
            : '';
        const summary = item.summary || item.answer || '';
        return `<li><div class="knowledge-point-title">${escapeHtml(title)}${extra}</div>${summary ? `<div class="knowledge-point-body">${escapeHtml(summary)}</div>` : ''}</li>`;
    }).join('')}</ul>`;
}

function sectionBlock(title, items) {
    if (!Array.isArray(items) || items.length === 0) return '';
    return `<div class="knowledge-block"><h3>${escapeHtml(title)}</h3>${listItems(items)}</div>`;
}

function normalizeChapters(data) {
    const sourceChapters = (Array.isArray(data.chapters) && data.chapters.length)
        ? data.chapters
        : (data.official_outline_xieming?.chapters || data.jiaofu_toc || []);
    return (sourceChapters || []).map((ch, index) => ({
        id: ch.id || `ch-${index + 1}`,
        heading: ch.heading || `第${ch.no || index + 1}章`,
        title: ch.title || '',
        stars: ch.stars || '',
        sections: ch.sections || ch.toc_numbered || [],
        remember: ch.remember || [],
        understand: ch.understand || [],
        apply: ch.apply || [],
        focus: ch.focus || '',
        hard: ch.hard || '',
        points: ch.points || []
    }));
}

function extraBlocks(data) {
    const blocks = [];
    if (Array.isArray(data.jiaofu_qa) && data.jiaofu_qa.length) {
        blocks.push(sectionBlock('教辅简答 / 名词解释', data.jiaofu_qa));
    }
    if (Array.isArray(data.qa_points) && data.qa_points.length) {
        blocks.push(sectionBlock('速记宝典', data.qa_points));
    }
    if (Array.isArray(data.chuanjiang_points) && data.chuanjiang_points.length) {
        const points = data.chuanjiang_points.flatMap(ch =>
            (ch.points || []).map(p => ({ title: `${ch.title} · ${p.title}` }))
        );
        blocks.push(sectionBlock('串讲考点归纳', points));
    }
    if (Array.isArray(data.jiaofu_mcq) && data.jiaofu_mcq.length) {
        blocks.push(sectionBlock('教辅例题', data.jiaofu_mcq.map(q => ({
            title: q.q || q.title,
            summary: q.answer ? `答案 ${q.answer}${q.explain ? `。${q.explain}` : ''}` : ''
        }))));
    }
    if (Array.isArray(data.question_tags) && data.question_tags.length) {
        blocks.push(sectionBlock('真题高频考点（解析版）', data.question_tags.slice(0, 40)));
    }
    return blocks.join('');
}

async function loadCourse(code) {
    if (cache.has(code)) return cache.get(code);
    const course = COURSES.find(item => item.code === code);
    const response = await fetch(course.file);
    if (!response.ok) throw new Error(`无法加载 ${course.file}`);
    const data = await response.json();
    const packed = { course, data, chapters: normalizeChapters(data) };
    cache.set(code, packed);
    return packed;
}

function renderSubjectTabs() {
    const tabs = document.getElementById('knowledge-subject-tabs');
    if (!tabs) return;
    tabs.innerHTML = COURSES.map(course => `
        <button type="button" class="knowledge-subject-tab${course.code === activeCode ? ' is-active' : ''}" data-code="${course.code}">
            <span class="knowledge-subject-name">${escapeHtml(course.label)}</span>
            <span class="knowledge-subject-code">${escapeHtml(course.examCode)}</span>
        </button>
    `).join('');
    tabs.querySelectorAll('button').forEach(button => {
        button.addEventListener('click', () => selectCourse(button.dataset.code));
    });
}

function renderChapters(packed) {
    const list = document.getElementById('knowledge-chapter-list');
    if (!list) return;
    list.innerHTML = packed.chapters.map(ch => `
        <button type="button" class="knowledge-chapter${ch.id === activeChapterId ? ' is-active' : ''}" data-id="${escapeHtml(ch.id)}">
            <span class="knowledge-chapter-heading">${escapeHtml(ch.heading)}${ch.stars ? ` ${escapeHtml(ch.stars)}` : ''}</span>
            <span class="knowledge-chapter-title">${escapeHtml(ch.title)}</span>
        </button>
    `).join('');
    list.querySelectorAll('button').forEach(button => {
        button.addEventListener('click', () => selectChapter(button.dataset.id));
    });
}

function renderDetail(packed) {
    const detail = document.getElementById('knowledge-detail');
    const note = document.getElementById('knowledge-note');
    if (note) {
        const data = packed.data;
        note.textContent = [data.textbook, data.note, packed.course.examCode && `课码 ${packed.course.examCode}`]
            .filter(Boolean)
            .join(' · ');
    }
    if (!detail) return;
    const chapter = packed.chapters.find(item => item.id === activeChapterId);
    if (!chapter) {
        detail.innerHTML = extraBlocks(packed.data) || '<p class="knowledge-placeholder">该科目还没有章节数据。</p>';
        return;
    }
    const sections = (chapter.sections || []).map(sec => {
        if (typeof sec === 'string') return sec;
        return `${sec.id ? `${sec.id} ` : ''}${sec.title || sec.no || ''}`;
    }).filter(Boolean);

    detail.innerHTML = `
        <header class="knowledge-detail-header">
            <h2>${escapeHtml(chapter.heading)} ${escapeHtml(chapter.title)}</h2>
            ${chapter.stars ? `<div class="knowledge-stars">${escapeHtml(chapter.stars)}</div>` : ''}
        </header>
        ${chapter.focus ? `<p class="knowledge-focus"><strong>重点</strong> ${escapeHtml(chapter.focus)}</p>` : ''}
        ${chapter.hard ? `<p class="knowledge-hard"><strong>难点</strong> ${escapeHtml(chapter.hard)}</p>` : ''}
        ${sectionBlock('节次', sections)}
        ${sectionBlock('识记', chapter.remember)}
        ${sectionBlock('领会', chapter.understand)}
        ${sectionBlock('应用', chapter.apply)}
        ${sectionBlock('考前资料', chapter.points)}
        ${packed.chapters.findIndex(item => item.id === chapter.id) === 0 ? extraBlocks(packed.data) : ''}
    `;
}

async function selectCourse(code) {
    activeCode = code;
    renderSubjectTabs();
    const packed = await loadCourse(code);
    activeChapterId = packed.chapters[0]?.id || '';
    renderChapters(packed);
    renderDetail(packed);
}

async function selectChapter(id) {
    activeChapterId = id;
    const packed = await loadCourse(activeCode);
    renderChapters(packed);
    renderDetail(packed);
}

export async function initKnowledgeMode() {
    renderSubjectTabs();
    try {
        await selectCourse(activeCode);
    } catch (error) {
        const detail = document.getElementById('knowledge-detail');
        if (detail) detail.innerHTML = `<p class="knowledge-placeholder">加载失败：${escapeHtml(error.message)}</p>`;
    }
}
