// January three-course study desk. Local progress is self-assessment, not a grade.
const KEY = 'exam-study-v2';
const OLD_KEY = 'exam-study-pilot-v1';
const COURSES = [
    {
        code: '03333',
        label: '电子政务概论',
        examCode: '03333',
        file: 'knowledge/03333-knowledge.json',
        unitsFile: 'knowledge/units-03333.json',
        outline: 'outline.html?code=03333',
        outlineFile: 'knowledge/03333-gd-outline.md',
        blurb: '政府上网怎么管、怎么服务。各章可学，第一至三章是精讲。'
    },
    {
        code: '13672',
        label: '公共政策导论',
        examCode: '13672',
        file: 'knowledge/13672-knowledge.json',
        unitsFile: 'knowledge/units-13672.json',
        outline: 'outline.html?code=13672',
        outlineFile: 'knowledge/13672-gzyszxy-outline.md',
        blurb: '政策从议程到终结。按谢明《公共政策导论》最新大纲 8 章。'
    },
    {
        code: '00040',
        label: '法学概论',
        examCode: '00040',
        file: 'knowledge/00040-knowledge.json',
        unitsFile: 'knowledge/units-00040.json',
        outline: 'outline.html?code=00040',
        outlineFile: 'knowledge/00040-gd-outline.md',
        blurb: '法理到诉讼法 11 章。定义以指定教材为准。'
    }
];

// 03333 手写精讲单元，按章顺序加载；其余章节仍由 units-03333.json 自动生成。
const CURATED_03333 = [
    'knowledge/pilot-03333.json',
    'knowledge/ch02-03333.json',
    'knowledge/ch03-03333.json'
];

let catalog = {};
let root;
let progress = { lastCourse: null, lastUnit: null, units: {} };
let courseCode = null;
let units = [];
let current = 0;
let stage = 'learn';
let revealed = false;
let checks = new Set();
let selected = '';
let submitted = false;
let storageOK = true;

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const btn = (action, text, style = '') => `<button type="button" data-action="${action}" class="study-btn ${style}">${text}</button>`;

// 自动生成的单元会带上同一句模板填充（「用一个政务场景套上…」之类）。
// 这类块没有信息量，渲染时直接跳过，避免整页都是套话。
const FILLER = [
    '用一个政务场景套上这个考点',
    '套本章：',
    '看到案例或新闻时，先判断它属于',
    '和相邻章节混为一谈',
    '与相邻部门法混用',
    '本章按 13672 谢明大纲'
];
function isFiller(text) {
    const t = String(text || '').trim();
    if (!t) return true;
    return FILLER.some(mark => t.includes(mark));
}
function save() {
    try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch { storageOK = false; }
}
function rec(id) { return progress.units[id] || {}; }
function record() { return rec(units[current].id); }
function due(u) { const r = rec(u.id); return r?.due && r.due <= Date.now(); }
function setPage(html) {
    root.innerHTML = html;
    const h = root.querySelector('h1,h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
}
// 面包屑承担返回：考点学习 › 科目 › 单元位置。中间层级可点，不再额外放一排返回按钮。
function setCrumb(items) {
    const box = document.getElementById('study-crumb');
    if (!box) return;
    box.innerHTML = items.map((it, i) => {
        const last = i === items.length - 1;
        const cls = `breadcrumb-item${last ? ' active' : ''}`;
        return (i ? '<span class="breadcrumb-separator">›</span>' : '')
            + (last || !it.action
                ? `<span class="${cls}">${esc(it.label)}</span>`
                : `<a href="#" class="${cls}" data-crumb="${esc(it.action)}">${esc(it.label)}</a>`);
    }).join('');
    box.querySelectorAll('[data-crumb]').forEach(a => {
        a.onclick = e => {
            e.preventDefault();
            const to = a.dataset.crumb;
            if (to === 'courses') courseHome();
            else if (to === 'course' && courseCode) courseDashboard();
        };
    });
}
function sourceLink(path) {
    if (typeof path !== 'string' || path.includes('..')) return '';
    if (/^(knowledge\/|json\/|outline\.html|exam\.html)/.test(path)) return encodeURI(path);
    return '';
}
function paperLabel(kind) {
    const k = String(kind || '');
    if (k.includes('00318')) return '题库练习（00318）';
    if (k.includes('章节练习')) return '章节练习';
    return '关联练习';
}
function examView(path, title) {
    if (typeof path !== 'string' || !path.startsWith('json/') || path.includes('..')) return '';
    const name = title || paperLabel() || '练习';
    return `exam.html?exam=${encodeURIComponent(path)}&filename=${encodeURIComponent(name)}`;
}
function docView(path, title) {
    if (typeof path !== 'string' || path.includes('..')) return '';
    if (!/^knowledge\/[\w\-./\u4e00-\u9fff]+\.md$/.test(path)) return '';
    return `outline.html?file=${encodeURIComponent(path)}&title=${encodeURIComponent(title || '素材原文')}`;
}
function citeLearn(u, course) {
    const q = u.question;
    const outline = sourceLink(course.outline);
    const paper = examView(q?.sourcePath, paperLabel(q?.kind));
    const raw = docView(u.source?.path, u.source?.location || `${u.chapterTitle || u.title} 素材原文`);
    const bits = [];
    bits.push(outline ? `<a href="${outline}" target="_blank" rel="noopener">课程大纲</a>` : '课程大纲');
    if (raw) bits.push(`<a href="${raw}" target="_blank" rel="noopener">素材原文</a>`);
    if (paper) bits.push(`<a href="${paper}">${esc(paperLabel(q.kind))}</a>`);
    const where = (u.chapterTitle && u.chapterTitle !== u.title)
        ? `${u.chapterTitle} · ${u.title}`
        : (u.chapterTitle || u.title || '');
    return `<p class="study-cite">出处：${bits.join(' · ')}${where ? ` · ${esc(where)}` : ''}。讲解是学习整理，不是整本教材原文。</p>`;
}
function sectionTitles(ch) {
    const raw = ch.sections?.length ? ch.sections : (ch.toc_numbered || []);
    return raw.map(s => typeof s === 'string' ? s : (s.title || '')).filter(Boolean);
}
function unitFromChapter(course, ch) {
    const remember = ch.remember || [];
    const understand = ch.understand || [];
    const apply = ch.apply || [];
    const sections = sectionTitles(ch);
    const heading = `${ch.heading || ''} ${ch.title || ''}`.trim();
    const explain = [
        `这一章要解决的问题：${ch.title}。`,
        sections.length ? `内容范围：${sections.join('、')}。` : '',
        ch.focus ? `大纲标明的重点：${ch.focus}` : '',
        remember.length ? `先能说出这些识记点：${remember.slice(0, 8).join('；')}。` : '',
        understand.length ? `再能说明这些领会点：${understand.slice(0, 6).join('；')}。` : ''
    ].filter(Boolean).join('\n\n');
    const examAnswer = [
        ...remember.map(x => `识记：${x}`),
        ...understand.map(x => `领会：${x}`),
        ...apply.map(x => `应用：${x}`)
    ].join('\n') || heading;
    const checkpoints = (remember.length ? remember : understand).slice(0, 5).map(x => `能说出：${x}`);
    if (!checkpoints.length) checkpoints.push(`能用自己的话概括「${ch.title}」这一章在考什么。`);
    return {
        id: ch.id || `${course.code}-${heading}`,
        course: course.code,
        chapterTitle: heading,
        title: heading,
        minutes: Math.min(12, 6 + Math.ceil((remember.length + understand.length) / 4)),
        explain,
        examAnswer,
        example: apply.length
            ? `大纲应用要求：${apply.slice(0, 3).join('；')}。先按教材例子想一遍，再对照识记点。`
            : `用一个最近看到的公共事务，对照本章识记点，看能套上几条。`,
        contrast: ch.hard
            ? `难点是「${ch.hard}」。不要和重点「${ch.focus || ch.title}」混成一件事。`
            : `先分清本章识记（是什么）和领会（为什么/有何关系），不要只背标题。`,
        recallPrompt: `不看讲解，说出「${ch.title}」这一章的识记要点${understand.length ? '，并补一条领会' : ''}。`,
        checkpoints,
        source: {
            label: `${course.label} 广东课程大纲转载`,
            path: course.file,
            location: heading
        },
        question: null,
        quality: 'outline'
    };
}
function buildCourse(course, raw, extra, curated) {
    const list = [];
    for (const pack of Array.isArray(curated) ? curated : []) {
        for (const u of pack.units || []) {
            list.push({
                ...u,
                course: course.code,
                chapterTitle: pack.title || u.chapterTitle || u.title,
                quality: u.quality || 'pilot'
            });
        }
    }
    const curatedIds = new Set(list.map(u => u.id));
    for (const u of extra?.units || []) {
        if (curatedIds.has(u.id)) continue;
        list.push({ ...u, course: course.code, chapterTitle: u.chapterTitle || u.title });
    }
    if (!list.length) {
        let chapters = [];
        if (course.code === '13672' && raw.official_outline_xieming?.chapters?.length) chapters = raw.official_outline_xieming.chapters;
        else if (Array.isArray(raw.chapters) && raw.chapters.length) chapters = raw.chapters;
        for (const ch of chapters) list.push(unitFromChapter(course, ch));
    }
    const textbook = course.code === '13672'
        ? (raw.official_outline_xieming?.textbook || '谢明《公共政策导论》中国人民大学出版社 2020 年版')
        : (raw.textbook || '');
    const note = course.code === '13672'
        ? '按 13672 谢明最新大纲。关联题来自题库里的 00318 试卷，只作练习，不称为 13672 历年真题。'
        : (raw.not_examined || extra?.notes?.[0] || '');
    return { course, raw, units: list, textbook, note };
}
function loadProgress() {
    try {
        const v2 = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (v2 && typeof v2 === 'object' && v2.units && !Array.isArray(v2.units)) return v2;
        const v1 = JSON.parse(localStorage.getItem(OLD_KEY) || '{}');
        if (v1 && typeof v1 === 'object') {
            const units = { ...v1 };
            const last = units.last;
            delete units.last;
            return { lastCourse: '03333', lastUnit: last || null, units };
        }
    } catch { /* ignore */ }
    return { lastCourse: null, lastUnit: null, units: {} };
}
function courseStats(code) {
    const list = catalog[code]?.units || [];
    const passed = list.filter(u => rec(u.id).passed).length;
    const seen = list.filter(u => rec(u.id).seen).length;
    const dueN = list.filter(due).length;
    return { total: list.length, passed, seen, dueN };
}
function courseHome() {
    courseCode = null;
    units = [];
    setCrumb([{ label: '考点学习' }]);
    setPage(`<header class="study-hero"><div><p class="study-badge">2026 年 1 月 · 三门</p><h1>一月要考的三门</h1><p>各科按「学懂 → 回忆 → 练习」走；挂得上关联题的单元多一道练习。</p></div>
      <div class="study-progress"><span>进度</span><small>只存在本机浏览器，不跨设备同步。通过一次不等于长期掌握。</small></div></header>
      <div class="study-course-grid">${COURSES.map(c => {
        const s = courseStats(c.code);
        return `<button type="button" class="study-course-card" data-course="${c.code}">
          <span class="study-badge">${esc(c.examCode)}${c.bank ? ` · ${esc(c.bank)}` : ''}</span>
          <h2>${esc(c.label)}</h2>
          <p>${esc(c.blurb)}</p>
          <p class="study-muted">${s.passed}/${s.total} 单元通过自查${s.dueN ? ` · ${s.dueN} 待复习` : s.seen ? ` · 已看过 ${s.seen}` : ''}${progress.lastCourse === c.code ? ' · 上次学到这里' : ''}</p>
        </button>`;
    }).join('')}</div>`);
    root.querySelectorAll('[data-course]').forEach(b => b.onclick = () => openCourse(b.dataset.course));
}
function openCourse(code) {
    const pack = catalog[code];
    if (!pack) return;
    courseCode = code;
    units = pack.units;
    progress.lastCourse = code;
    save();
    courseDashboard();
}
function courseDashboard() {
    const pack = catalog[courseCode];
    const c = pack.course;
    const s = courseStats(courseCode);
    const dueUnits = units.filter(due);
    let next = units.findIndex(u => u.id === progress.lastUnit && u.course === courseCode);
    if (next < 0) next = units.findIndex(u => !rec(u.id).passed);
    if (next < 0) next = 0;
    const groups = [];
    for (const u of units) {
        const g = u.chapterTitle || u.title;
        if (!groups.length || groups[groups.length - 1].title !== g) groups.push({ title: g, items: [] });
        groups[groups.length - 1].items.push(u);
    }
    setCrumb([{ label: '考点学习', action: 'courses' }, { label: c.label }]);
    setPage(`<header class="study-hero"><div><h1>${esc(c.label)}</h1><p>${esc(pack.textbook || '')}</p>${pack.note ? `<p class="study-muted">${esc(pack.note)}</p>` : ''}
        <div class="study-actions">${btn('continue', '继续学习 →', 'primary')}${c.outline ? `<a class="study-btn" href="${esc(c.outline)}" target="_blank" rel="noopener">课程大纲</a>` : ''}</div></div>
      <div class="study-progress"><strong>${s.passed}<small> / ${s.total}</small></strong><span>单元已通过</span><progress max="${s.total}" value="${s.passed}"></progress></div></header>
      ${dueUnits.length ? `<div class="study-due"><b>${dueUnits.length} 个单元到复习时间</b>${dueUnits.map(u => `<button type="button" class="study-review" data-unit="${units.indexOf(u)}">${esc(u.title)} →</button>`).join('')}</div>` : ''}
      <section class="study-panel"><h2>章节路线</h2>
        ${groups.map(g => `<h3 class="study-chapter-label">${esc(g.title)}</h3><ol class="study-route">${g.items.map(u => {
            const i = units.indexOf(u);
            const st = rec(u.id).passed ? '已通过' : rec(u.id).seen ? '待检验' : '未开始';
            return `<li><span class="study-number">${String(i + 1).padStart(2, '0')}</span><div><h3>${esc(u.title)}</h3><p>${st}</p></div><button type="button" class="study-btn" data-unit="${i}">学习</button></li>`;
        }).join('')}</ol>`).join('')}
      </section>`);
    root.querySelector('[data-action="continue"]').onclick = () => openUnit(next);
    root.querySelectorAll('[data-unit]').forEach(b => b.onclick = () => openUnit(Number(b.dataset.unit)));
}
function openUnit(index) {
    current = index;
    stage = 'learn';
    revealed = false;
    checks = new Set();
    selected = '';
    submitted = false;
    progress.lastCourse = courseCode;
    progress.lastUnit = units[index].id;
    save();
    renderUnit();
}
function renderUnit() {
    const u = units[current];
    const q = u.question;
    const qSource = q ? examView(q.sourcePath, q.kind || '练习') : '';
    const c = catalog[courseCode].course;
    let body = '';
    if (stage === 'learn') {
        const qualityLabel = u.quality === 'pilot' ? '精讲' : u.quality === 'curated' ? '文库核对' : '大纲';
        // 自动生成的单元常把同一段摘要既当讲解又当考试表述，重复渲染没有意义。
        const sameAsExplain = (u.examAnswer || '').trim() === (u.explain || '').trim();
        const cite = citeLearn(u, c);
        body = `<h2>${esc(u.title)} <span class="study-badge">${qualityLabel}</span></h2>
          <div class="study-explain">${esc(u.explain)}</div>
          ${isFiller(u.example) ? '' : `<div class="study-example"><h3>怎么用</h3><p>${esc(u.example)}</p></div>`}
          ${isFiller(u.contrast) ? '' : `<div class="study-contrast"><h3>别混淆</h3><p>${esc(u.contrast)}</p></div>`}
          ${sameAsExplain ? cite : `<details class="study-answer"><summary>考试表述与依据</summary><p>${esc(u.examAnswer)}</p>${cite}</details>`}
          ${btn('recall', '合上讲解，试着回忆 →', 'primary')}`;
    }
    if (stage === 'recall') {
        body = `<h2>${esc(u.recallPrompt)}</h2>
          <p class="study-muted">先自己回想，再对照要点。</p>
          ${!revealed ? btn('reveal', '我想好了，对照要点', 'primary') : `<div class="study-answer"><h3>逐项自查：哪些是刚才独立想起来的？</h3>
            ${u.checkpoints.map((p, i) => `<label class="study-check"><input type="checkbox" data-check="${i}" ${checks.has(i) ? 'checked' : ''}><span>${esc(p)}</span></label>`).join('')}
            <p class="study-muted">没勾选的记为待巩固，不是扣分。</p></div>
            ${q ? btn('quiz', '做一道关联题 →', 'primary') : btn('finish', '记录结果 →', 'primary')}`}`;
    }
    if (stage === 'quiz' && q) {
        body = `<h2>${esc(q.stem)}</h2>
          <fieldset class="study-options" ${submitted ? 'disabled' : ''}><legend>选择一个答案</legend>
            ${Object.entries(q.options).map(([key, value]) => `<label class="study-option ${submitted && key === q.answer ? 'correct' : ''}"><input type="radio" name="study-option" value="${esc(key)}" ${selected === key ? 'checked' : ''} aria-label="${esc(`${key}. ${value}`)}"><b aria-hidden="true">${esc(key)}</b><span>${esc(value)}</span></label>`).join('')}
          </fieldset>
          ${submitted ? `<div class="study-feedback ${selected === q.answer ? 'good' : 'retry'}" role="status"><h3>${selected === q.answer ? '答对了' : '再辨析一次'} · 答案 ${esc(q.answer)}</h3><p>${esc(q.explanation)}</p></div>${btn('finish', '记录结果 →', 'primary')}` : btn('submit', '提交答案', 'primary')}
          <p class="study-muted">${esc(q.kind)}${q.sourceNumber ? ` · 第 ${esc(q.sourceNumber)} 题` : ''} · 不是历年真题${qSource ? ` · <a href="${qSource}" target="_blank" rel="noopener">在整卷模拟里打开</a>` : ''}</p>`;
    }
    if (stage === 'done') {
        body = `<h2>${record().passed ? '这次算通过' : '发现薄弱点，就是这次的收获'}</h2>
          <p>独立回忆 ${checks.size} / ${u.checkpoints.length} 个要点${q ? `；练习${selected === q.answer ? '正确' : '需要重练'}` : ''}。</p>
          <p class="study-muted">下次复习：${new Date(record().due).toLocaleString('zh-CN')}</p>
          <div class="study-actions">${current < units.length - 1 ? btn('next', '下一个单元 →', 'primary') : ''}${btn('dashboard', '返回本科目')}${btn('restart', '再学一次')}</div>`;
    }
    setCrumb([
        { label: '考点学习', action: 'courses' },
        { label: c.label, action: 'course' },
        { label: `${current + 1}/${units.length}` }
    ]);
    setPage(`<div class="study-steps" aria-label="学习步骤">${['学懂', '回忆', q ? '练习' : '记录'].map((label, i) => `<span class="${['learn', 'recall', q ? 'quiz' : 'done'][i] === stage ? 'active' : ''}">${i + 1} ${label}</span>`).join('')}</div>
      <article class="study-lesson">${body}</article>
      <p class="study-safety">自查是学习反馈，不是正式考试评分。</p>`);
    root.querySelectorAll('[data-action]').forEach(b => b.onclick = () => act(b.dataset.action));
    root.querySelectorAll('[data-check]').forEach(box => {
        box.onchange = () => (box.checked ? checks.add(Number(box.dataset.check)) : checks.delete(Number(box.dataset.check)));
    });
    root.querySelectorAll('[name="study-option"]').forEach(input => {
        input.onchange = () => {
            selected = input.value;
            const b = root.querySelector('[data-action="submit"]');
            if (b) b.disabled = false;
        };
    });
    const submit = root.querySelector('[data-action="submit"]');
    if (submit) submit.disabled = !selected;
}
function act(action) {
    const u = units[current];
    if (action === 'home') return courseHome();
    if (action === 'dashboard') return courseDashboard();
    if (action === 'restart') return openUnit(current);
    if (action === 'next') return openUnit(current + 1);
    if (action === 'recall') {
        progress.units[u.id] = { ...record(), seen: true };
        save();
        stage = 'recall';
    }
    if (action === 'reveal') revealed = true;
    if (action === 'quiz') stage = 'quiz';
    if (action === 'submit') { if (!selected) return; submitted = true; }
    if (action === 'finish') {
        const hasQ = !!u.question;
        const passed = (!hasQ && checks.size === u.checkpoints.length) || (hasQ && selected === u.question.answer && checks.size === u.checkpoints.length);
        const streak = passed ? (record().streak || 0) + 1 : 0;
        progress.units[u.id] = {
            seen: true, passed, streak,
            checked: checks.size, total: u.checkpoints.length,
            correct: hasQ ? selected === u.question.answer : null,
            lastReviewed: Date.now(),
            due: Date.now() + (passed ? (streak > 1 ? 3 : 1) * 86400000 : 600000)
        };
        save();
        stage = 'done';
    }
    if (action === 'home' || action === 'dashboard') return;
    renderUnit();
}
export async function initKnowledgeMode() {
    root = document.getElementById('study-workspace');
    if (!root) return;
    try {
        progress = loadProgress();
        const v = 'jan3p';
        const [curated03333, packs, extras] = await Promise.all([
            Promise.all(CURATED_03333.map(async file => {
                const r = await fetch(`${file}?v=${v}`);
                if (!r.ok) throw new Error(`精讲单元加载失败：${file}`);
                return await r.json();
            })),
            Promise.all(COURSES.map(async c => {
                const r = await fetch(`${c.file}?v=${v}`);
                if (!r.ok) throw new Error(`无法加载 ${c.label}`);
                return [c.code, await r.json()];
            })),
            Promise.all(COURSES.map(async c => {
                const r = await fetch(`${c.unitsFile}?v=${v}`);
                if (!r.ok) throw new Error(`无法加载 ${c.label} 学习单元`);
                return [c.code, await r.json()];
            }))
        ]);
        catalog = {};
        for (const c of COURSES) {
            const raw = packs.find(p => p[0] === c.code)[1];
            const extra = extras.find(p => p[0] === c.code)[1];
            catalog[c.code] = buildCourse(c, raw, extra, c.code === '03333' ? curated03333 : null);
        }
        courseHome();
    } catch (error) {
        root.innerHTML = `<section class="study-panel"><h2>暂时无法打开学习内容</h2><p>${esc(error.message)}</p>${btn('retry', '重试')}</section>`;
        const retry = root.querySelector('[data-action="retry"]');
        if (retry) retry.onclick = initKnowledgeMode;
    }
}
