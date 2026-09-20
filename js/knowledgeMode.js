// Pilot learning loop. Local progress is self-assessment, not an exam grade.
const KEY = 'exam-study-pilot-v1';
let data, root, progress = {}, current = 0, stage = 'learn', revealed = false;
let checks = new Set(), draft = '', selected = '', submitted = false, storageOK = true;
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const btn = (action, text, style = '') => `<button type="button" data-action="${action}" class="study-btn ${style}">${text}</button>`;
function save() { try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch { storageOK = false; } }
function record() { return progress[data.units[current].id] || {}; }
function due(u) { const r = progress[u.id]; return r?.due && r.due <= Date.now(); }
function setPage(html) { root.innerHTML = html; root.querySelector('h1,h2')?.setAttribute('tabindex','-1'); root.querySelector('h1,h2')?.focus({preventScroll:true}); }
function openUnit(index) {
    current = index; stage = 'learn'; revealed = false; checks = new Set(); draft = ''; selected = ''; submitted = false;
    progress.last = data.units[index].id; save(); renderUnit();
}
function dashboard() {
    const completed = data.units.filter(u => progress[u.id]?.passed).length;
    const dueUnits = data.units.filter(due);
    const next = Math.max(0, data.units.findIndex(u => u.id === progress.last));
    setPage(`<div class="study-topline"><span>学习工作台 / 03333</span><span class="study-badge">第一章 · 试学版</span></div>
      <header class="study-hero"><div><p class="study-eyebrow">不只看过，更要说得出来</p><h1>从学懂一个考点开始</h1><p>电子政务的基本概念 · 3 个短单元<br>先理解，再闭卷回忆，最后用章节练习检验。</p>${btn('continue','继续学习 →','primary')}</div><div class="study-progress"><strong>${completed}<small> / ${data.units.length}</small></strong><span>单元通过自查与练习</span><progress max="${data.units.length}" value="${completed}"></progress><small>通过一次不等于长期掌握</small></div></header>
      <div class="study-dashboard-grid"><section class="study-panel"><h2>本章学习路线</h2><p class="study-muted">每个单元：讲解 → 主动回忆 → 关联练习</p><ol class="study-route">${data.units.map((u,i)=>`<li><span class="study-number">0${i+1}</span><div><h3>${esc(u.title)}</h3><p>${u.minutes} 分钟 · ${progress[u.id]?.passed ? '已通过一次' : progress[u.id]?.seen ? '已阅读，待检验' : '尚未开始'}</p></div><button class="study-btn" data-unit="${i}">学习</button></li>`).join('')}</ol></section>
      <section class="study-panel"><h2>待复习 <span class="study-badge">${dueUnits.length}</span></h2><p>${dueUnits.length ? '这些内容到复习时间了。重新回忆，比再读一遍更有用。' : '目前没有到期任务。完成一个单元后，系统会安排回访。'}</p>${dueUnits.map(u=>`<button class="study-review" data-unit="${data.units.indexOf(u)}">${esc(u.title)} →</button>`).join('')}<p class="study-muted">漏点或答错：10 分钟后复习；通过一次：1 天后；连续通过：3 天后。</p></section></div>
      <details class="study-panel study-reference"><summary>其他课程与参考资料</summary><p>完整学习路径目前仅开放电子政务第一章。其他内容仍在核对，不以资料数量冒充学习完成度。</p><ul><li>电子政务：其余章节待整理。<a href="knowledge/03333-gd-outline.docx">大纲转载原件</a></li><li>公共政策：教材版本与 00318 / 13672 对应关系待确认，不混用两套目录。</li><li>法学概论：待逐点核对适用法律版本。<a href="knowledge/00040-gd-outline.docx">大纲转载原件</a></li></ul><p>讲解为依据资料重新组织的学习说明；章节练习不冒充历年真题。</p></details>
      <footer class="study-footer"><span>${storageOK ? '进度仅保存在当前浏览器，不自动跨设备同步。' : '浏览器存储不可用，本次进度可能无法保存。'}</span>${btn('export','导出学习记录')}</footer>`);
    root.querySelector('[data-action="continue"]').onclick = () => openUnit(next);
    bindDashboard();
}
function bindDashboard() {
    root.querySelectorAll('[data-unit]').forEach(b => b.onclick = () => openUnit(Number(b.dataset.unit)));
    root.querySelector('[data-action="export"]').onclick = () => {
        const blob = new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),progress},null,2)],{type:'application/json'});
        const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='study-progress.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    };
}
function sourceLink(path) { return typeof path === 'string' && /^(knowledge\/|json\/)/.test(path) && !path.includes('..') ? encodeURI(path) : ''; }
function renderUnit() {
    const u=data.units[current], q=u.question;
    const source=sourceLink(u.source.path), qSource=sourceLink(q.sourcePath);
    let body='';
    if(stage==='learn') body=`<p class="study-eyebrow">01 / 学懂</p><h2>${esc(u.title)}</h2><div class="study-explain">${esc(u.explain)}</div><div class="study-example"><h3>用一个例子理解</h3><p>${esc(u.example)}</p></div><div class="study-contrast"><h3>别混淆</h3><p>${esc(u.contrast)}</p></div><details class="study-answer"><summary>考试表述与依据</summary><p>${esc(u.examAnswer)}</p><small>${esc(u.source.label)} · ${esc(u.source.location)} ${source?`<a href="${source}">查看来源</a>`:''}</small></details>${btn('recall','合上讲解，试着回忆 →','primary')}`;
    if(stage==='recall') body=`<p class="study-eyebrow">02 / 主动回忆</p><h2>${esc(u.recallPrompt)}</h2><p class="study-muted">先不看答案，尝试说出来，或写几个关键词。不会也没关系。</p><label for="study-draft">我的回忆（可选）</label><textarea id="study-draft" placeholder="用自己的话写，不用追求原句…">${esc(draft)}</textarea>${!revealed?btn('reveal','我想好了，对照要点','primary'):`<div class="study-answer"><h3>逐项自查：哪些是刚才独立想起来的？</h3>${u.checkpoints.map((p,i)=>`<label class="study-check"><input type="checkbox" data-check="${i}" ${checks.has(i)?'checked':''}><span>${esc(p)}</span></label>`).join('')}<p class="study-muted">没勾选的要点会记为待巩固，不是扣分。</p></div>${btn('quiz','保存自查，做一道题 →','primary')}`}`;
    if(stage==='quiz') body=`<p class="study-eyebrow">03 / 关联练习 · ${esc(q.kind)}</p><h2>${esc(q.stem)}</h2><fieldset class="study-options" ${submitted?'disabled':''}><legend>选择一个答案</legend>${Object.entries(q.options).map(([key,value])=>`<label class="study-option ${submitted && key===q.answer?'correct':''}"><input type="radio" name="study-option" value="${esc(key)}" ${selected===key?'checked':''} aria-label="${esc(`${key}. ${value}`)}"><b aria-hidden="true">${esc(key)}</b><span>${esc(value)}</span></label>`).join('')}</fieldset>${submitted?`<div class="study-feedback ${selected===q.answer?'good':'retry'}" role="status"><h3>${selected===q.answer?'这道题答对了':'再辨析一次'} · 答案 ${esc(q.answer)}</h3><p>${esc(q.explanation)}</p><p>你这次回忆了 ${checks.size} / ${u.checkpoints.length} 个要点。</p></div>${btn('finish','记录结果，查看下一步 →','primary')}`:btn('submit','提交答案','primary')}<p class="study-muted">${esc(q.kind)} · 原题编号 ${esc(q.sourceNumber)} ${qSource?`<a href="${qSource}">查看关联题源</a>`:''}</p>`;
    if(stage==='done') body=`<p class="study-eyebrow">本次学习已记录</p><h2>${record().passed?'完成了一次有效检验':'发现薄弱点，就是这次的收获'}</h2><p>独立回忆 ${checks.size} / ${u.checkpoints.length} 个要点；练习${selected===q.answer?'正确':'需要重练'}。</p><p>下次复习：${new Date(record().due).toLocaleString('zh-CN')}</p><div class="study-actions">${btn('dashboard','返回工作台','primary')}${current<data.units.length-1?btn('next','学习下一个单元 →'):''}${btn('restart','再学一次')}</div>`;
    setPage(`<div class="study-topline">${btn('dashboard','← 学习工作台')}<span>电子政务 · 第一章 · ${current+1}/${data.units.length}</span></div><div class="study-steps" aria-label="学习步骤">${['学懂','回忆','练习'].map((s,i)=>`<span class="${['learn','recall','quiz'][i]===stage?'active':''}">${i+1} ${s}</span>`).join('')}</div><article class="study-lesson">${body}</article><p class="study-safety">自查是学习反馈，不是正式考试评分。进度${storageOK?'仅保存在本机':'暂时无法持久保存'}。</p>`);
    root.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>act(b.dataset.action));
    root.querySelector('#study-draft')?.addEventListener('input',e=>draft=e.target.value);
    root.querySelectorAll('[data-check]').forEach(c=>c.onchange=()=>c.checked?checks.add(Number(c.dataset.check)):checks.delete(Number(c.dataset.check)));
    root.querySelectorAll('[name="study-option"]').forEach(c=>c.onchange=()=>{selected=c.value; const b=root.querySelector('[data-action="submit"]'); if(b)b.disabled=false;});
    const submit=root.querySelector('[data-action="submit"]'); if(submit)submit.disabled=!selected;
}
function act(action) {
    const u=data.units[current];
    if(action==='dashboard')return dashboard();
    if(action==='restart')return openUnit(current);
    if(action==='next')return openUnit(current+1);
    if(action==='recall'){progress[u.id]={...record(),seen:true};save();stage='recall';}
    if(action==='reveal')revealed=true;
    if(action==='quiz')stage='quiz';
    if(action==='submit'){if(!selected)return;submitted=true;}
    if(action==='finish'){
        const passed=selected===u.question.answer && checks.size===u.checkpoints.length;
        const streak=passed?(record().streak||0)+1:0;
        progress[u.id]={seen:true,passed,streak,checked:checks.size,total:u.checkpoints.length,correct:selected===u.question.answer,lastReviewed:Date.now(),due:Date.now()+(passed?(streak>1?3:1)*86400000:600000)};
        save();stage='done';
    }
    renderUnit();
}
export async function initKnowledgeMode() {
    root=document.getElementById('study-workspace');
    if(!root) return;
    try {
        try { const stored=JSON.parse(localStorage.getItem(KEY)||'{}'); progress=stored && typeof stored==='object'&&!Array.isArray(stored)?stored:{}; } catch {progress={};}
        if(!data){const r=await fetch('knowledge/pilot-03333.json?v=pilot1');if(!r.ok)throw new Error('学习内容加载失败');data=await r.json();}
        if(!Array.isArray(data.units) || !data.units.length) throw new Error('学习内容不完整');
        dashboard();
    } catch(error){
        root.innerHTML=`<section class="study-panel"><h2>暂时无法打开学习内容</h2><p>${esc(error.message)}</p>${btn('retry','重试')}</section>`;
        const retry=root.querySelector('[data-action="retry"]');
        if(retry) retry.onclick=initKnowledgeMode;
    }
}
