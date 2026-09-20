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
        outline: 'knowledge/03333-gd-outline.docx',
        blurb: '政府上网怎么管、怎么服务。各章可学，第一章是精讲。'
    },
    {
        code: '13672',
        label: '公共政策导论',
        examCode: '13672',
        file: 'knowledge/13672-knowledge.json',
        unitsFile: 'knowledge/units-13672.json',
        outline: 'knowledge/13672-gzyszxy-outline.pdf',
        blurb: '政策从议程到终结。按谢明《公共政策导论》最新大纲 8 章。'
    },
    {
        code: '00040',
        label: '法学概论',
        examCode: '00040',
        file: 'knowledge/00040-knowledge.json',
        unitsFile: 'knowledge/units-00040.json',
        outline: 'knowledge/00040-gd-outline.docx',
        blurb: '法理到诉讼法 11 章。定义以指定教材为准。'
    }
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
let draft = '';
let selected = '';
let submitted = false;
let storageOK = true;

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const btn = (action, text, style = '') => `<button type="button" data-action="${action}" class="study-btn ${style}">${text}</button>`;
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
function sourceLink(path) {
    return typeof path === 'string' && /^(knowledge\/|json\/)/.test(path) && !path.includes('..') ? encodeURI(path) : '';
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
function buildCourse(course, raw, extra, pilot) {
    const list = [];
    if (course.code === '03333' && pilot?.units?.length) {
        for (const u of pilot.units) {
            list.push({ ...u, course: course.code, chapterTitle: pilot.title || '第一章 电子政务的基本概念', quality: 'pilot' });
        }
    }
    for (const u of extra?.units || []) {
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
    setPage(`<div class="study-topline"><span>学习工作台</span><span class="study-badge">2026 年 1 月 · 三门</span></div>
      <header class="study-hero"><div><p class="study-eyebrow">先选一门，再学一个考点</p><h1>一月要考的三门都在这里</h1><p>公共政策导论、电子政务概论、法学概论。<br>各科都有「学懂 → 回忆」；挂了关联题的单元再加一道练习。电子政务第一章是精讲。</p></div>
      <div class="study-progress"><span>本机进度</span><small>不自动跨设备同步。通过一次不等于长期掌握。</small></div></header>
      <div class="study-course-grid">${COURSES.map(c => {
        const s = courseStats(c.code);
        return `<button type="button" class="study-course-card" data-course="${c.code}">
          <span class="study-badge">${esc(c.examCode)}${c.bank ? ` · ${esc(c.bank)}` : ''}</span>
          <h2>${esc(c.label)}</h2>
          <p>${esc(c.blurb)}</p>
          <p class="study-muted">${s.passed}/${s.total} 单元通过自查${s.dueN ? ` · ${s.dueN} 待复习` : s.seen ? ` · 已看过 ${s.seen}` : ''}${progress.lastCourse === c.code ? ' · 上次学到这里' : ''}</p>
        </button>`;
    }).join('')}</div>
      <p class="study-safety">${storageOK ? '进度仅保存在当前浏览器。' : '浏览器存储不可用，本次进度可能无法保存。'} 讲解是依据大纲重新组织的学习说明，不是整本教材。</p>`);
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
    setPage(`<div class="study-topline">${btn('home', '← 一月三门')}<span>${esc(c.label)} / ${esc(c.examCode)}</span></div>
      <header class="study-hero"><div><p class="study-eyebrow">${esc(c.blurb)}</p><h1>${esc(c.label)}</h1><p>${esc(pack.textbook || '')}</p>${pack.note ? `<p class="study-muted">${esc(pack.note)}</p>` : ''}${btn('continue', '继续学习 →', 'primary')}</div>
      <div class="study-progress"><strong>${s.passed}<small> / ${s.total}</small></strong><span>单元通过自查</span><progress max="${s.total}" value="${s.passed}"></progress><small>有关联题的单元走学懂·回忆·练习；没有的先回忆大纲要点。</small></div></header>
      <div class="study-dashboard-grid"><section class="study-panel"><h2>章节学习路线</h2>
        ${groups.map(g => `<h3 class="study-chapter-label">${esc(g.title)}</h3><ol class="study-route">${g.items.map(u => {
            const i = units.indexOf(u);
            const st = rec(u.id).passed ? '已通过一次' : rec(u.id).seen ? '已阅读，待检验' : '尚未开始';
            const tag = u.question ? '学懂·回忆·练习' : '学懂·回忆';
            return `<li><span class="study-number">${String(i + 1).padStart(2, '0')}</span><div><h3>${esc(u.title)}</h3><p>${u.minutes} 分钟 · ${tag} · ${st}</p></div><button type="button" class="study-btn" data-unit="${i}">学习</button></li>`;
        }).join('')}</ol>`).join('')}
      </section>
      <section class="study-panel"><h2>待复习 <span class="study-badge">${dueUnits.length}</span></h2>
        <p>${dueUnits.length ? '这些内容到复习时间了。重新回忆，比再读一遍更有用。' : '目前没有到期任务。完成一个单元后，系统会安排回访。'}</p>
        ${dueUnits.map(u => `<button type="button" class="study-review" data-unit="${units.indexOf(u)}">${esc(u.title)} →</button>`).join('')}
        <p class="study-muted">漏点或答错：10 分钟后复习；通过一次：1 天后；连续通过：3 天后。</p>
        ${c.outline ? `<p><a href="${esc(c.outline)}">大纲转载原件</a></p>` : ''}
        ${btn('export', '导出学习记录')}
      </section></div>
      <p class="study-safety">${storageOK ? '进度仅保存在本机，不自动跨设备同步。' : '浏览器存储不可用。'} 自查不是正式评分。</p>`);
    root.querySelector('[data-action="home"]').onclick = courseHome;
    root.querySelector('[data-action="continue"]').onclick = () => openUnit(next);
    root.querySelectorAll('[data-unit]').forEach(b => b.onclick = () => openUnit(Number(b.dataset.unit)));
    const exp = root.querySelector('[data-action="export"]');
    if (exp) exp.onclick = () => {
        const blob = new Blob([JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), progress }, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'study-progress.json'; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
}
function openUnit(index) {
    current = index;
    stage = 'learn';
    revealed = false;
    checks = new Set();
    draft = '';
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
    const source = sourceLink(u.source?.path);
    const qSource = q ? sourceLink(q.sourcePath) : '';
    const c = catalog[courseCode].course;
    let body = '';
    if (stage === 'learn') {
        const qualityLabel = u.quality === 'pilot' ? ' · 精讲单元' : u.quality === 'curated' ? ' · 文库核对单元' : ' · 大纲单元';
        body = `<p class="study-eyebrow">01 / 学懂${qualityLabel}</p><h2>${esc(u.title)}</h2>
          <div class="study-explain">${esc(u.explain)}</div>
          <div class="study-example"><h3>怎么用</h3><p>${esc(u.example)}</p></div>
          <div class="study-contrast"><h3>别混淆</h3><p>${esc(u.contrast)}</p></div>
          <details class="study-answer"><summary>考试表述与依据</summary><p>${esc(u.examAnswer)}</p>
            <small>${esc(u.source?.label || '')} · ${esc(u.source?.location || '')} ${source ? `<a href="${source}">查看来源</a>` : ''}</small></details>
          ${btn('recall', '合上讲解，试着回忆 →', 'primary')}`;
    }
    if (stage === 'recall') {
        body = `<p class="study-eyebrow">02 / 主动回忆</p><h2>${esc(u.recallPrompt)}</h2>
          <p class="study-muted">先不看答案。不会也没关系。</p>
          <label for="study-draft">我的回忆（可选）</label>
          <textarea id="study-draft" placeholder="用自己的话写几个关键词…">${esc(draft)}</textarea>
          ${!revealed ? btn('reveal', '我想好了，对照要点', 'primary') : `<div class="study-answer"><h3>逐项自查：哪些是刚才独立想起来的？</h3>
            ${u.checkpoints.map((p, i) => `<label class="study-check"><input type="checkbox" data-check="${i}" ${checks.has(i) ? 'checked' : ''}><span>${esc(p)}</span></label>`).join('')}
            <p class="study-muted">没勾选的记为待巩固，不是扣分。</p></div>
            ${q ? btn('quiz', '保存自查，做一道题 →', 'primary') : btn('finish', '记录回忆结果 →', 'primary')}`}`;
    }
    if (stage === 'quiz' && q) {
        body = `<p class="study-eyebrow">03 / 关联练习 · ${esc(q.kind)}</p><h2>${esc(q.stem)}</h2>
          <fieldset class="study-options" ${submitted ? 'disabled' : ''}><legend>选择一个答案</legend>
            ${Object.entries(q.options).map(([key, value]) => `<label class="study-option ${submitted && key === q.answer ? 'correct' : ''}"><input type="radio" name="study-option" value="${esc(key)}" ${selected === key ? 'checked' : ''} aria-label="${esc(`${key}. ${value}`)}"><b aria-hidden="true">${esc(key)}</b><span>${esc(value)}</span></label>`).join('')}
          </fieldset>
          ${submitted ? `<div class="study-feedback ${selected === q.answer ? 'good' : 'retry'}" role="status"><h3>${selected === q.answer ? '这道题答对了' : '再辨析一次'} · 答案 ${esc(q.answer)}</h3><p>${esc(q.explanation)}</p><p>你这次回忆了 ${checks.size} / ${u.checkpoints.length} 个要点。</p></div>${btn('finish', '记录结果，查看下一步 →', 'primary')}` : btn('submit', '提交答案', 'primary')}
          <p class="study-muted">${esc(q.kind)} · 原题编号 ${esc(q.sourceNumber)} ${qSource ? `<a href="${qSource}">查看关联题源</a>` : ''}。章节练习不冒充历年真题。</p>`;
    }
    if (stage === 'done') {
        body = `<p class="study-eyebrow">本次学习已记录</p>
          <h2>${record().passed ? '完成了一次有效检验' : '发现薄弱点，就是这次的收获'}</h2>
          <p>独立回忆 ${checks.size} / ${u.checkpoints.length} 个要点${q ? `；练习${selected === q.answer ? '正确' : '需要重练'}` : '。本章暂无核对过的关联选择题'}。</p>
          <p>下次复习：${new Date(record().due).toLocaleString('zh-CN')}</p>
          <div class="study-actions">${btn('dashboard', '返回本科目', 'primary')}${current < units.length - 1 ? btn('next', '学习下一个单元 →') : ''}${btn('restart', '再学一次')}</div>`;
    }
    setPage(`<div class="study-topline">${btn('dashboard', '← ' + c.label)}<span>${esc(c.label)} · ${current + 1}/${units.length}</span></div>
      <div class="study-steps" aria-label="学习步骤">${['学懂', '回忆', q ? '练习' : '记录'].map((label, i) => `<span class="${['learn', 'recall', q ? 'quiz' : 'done'][i] === stage ? 'active' : ''}">${i + 1} ${label}</span>`).join('')}</div>
      <article class="study-lesson">${body}</article>
      <p class="study-safety">自查是学习反馈，不是正式考试评分。进度${storageOK ? '仅保存在本机' : '暂时无法持久保存'}。</p>`);
    root.querySelectorAll('[data-action]').forEach(b => b.onclick = () => act(b.dataset.action));
    root.querySelector('#study-draft')?.addEventListener('input', e => { draft = e.target.value; });
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
        const v = 'jan3f';
        const [pilot, packs, extras] = await Promise.all([
            fetch(`knowledge/pilot-03333.json?v=${v}`).then(r => { if (!r.ok) throw new Error('试学单元加载失败'); return r.json(); }),
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
            catalog[c.code] = buildCourse(c, raw, extra, c.code === '03333' ? pilot : null);
        }
        courseHome();
    } catch (error) {
        root.innerHTML = `<section class="study-panel"><h2>暂时无法打开学习内容</h2><p>${esc(error.message)}</p>${btn('retry', '重试')}</section>`;
        const retry = root.querySelector('[data-action="retry"]');
        if (retry) retry.onclick = initKnowledgeMode;
    }
}
