// 题库练习模式相关功能
import { EXAM_LIST } from './config.js';
import { getActiveConfig } from './api.js';
import { getFilenameFromPath, shuffleArray } from './utils.js';

// ==================== 练习模式基础 ====================

export function startPracticeMode() {
    const randomOrder = document.getElementById('random-order').checked;
    const questionLimit = document.getElementById('question-limit').value;
    const subject = document.getElementById('practice-subject-filter').value;
    
    const selectedTypes = Array.from(document.querySelectorAll('.practice-type-checkbox:checked'))
        .map(cb => cb.value);
    
    const selectedExams = Array.from(document.querySelectorAll('.practice-exam-checkbox:checked'))
        .map(cb => cb.value);
    
    if (selectedExams.length === 0) {
        alert('请至少选择一套试卷');
        return;
    }
    if (selectedTypes.length === 0) {
        alert('请至少选择一种题型');
        return;
    }
    
    const params = new URLSearchParams();
    params.set('mode', 'practice');
    params.set('random', randomOrder);
    if (questionLimit) params.set('limit', questionLimit);
    if (subject) params.set('subject', subject);
    if (selectedTypes.length > 0) params.set('types', selectedTypes.join(','));
    if (selectedExams.length > 0) params.set('exams', selectedExams.join(','));
    
    const url = `exam.html?${params.toString()}`;
    window.open(url, '_blank');
}

export async function initPracticeSubjectFilter() {
    const subjectFilter = document.getElementById('practice-subject-filter');
    const subjects = [...new Set(EXAM_LIST.map(e => e.subject))].sort();
    
    subjectFilter.innerHTML = '<option value="">全部科目</option>';
    subjects.forEach(subject => {
        subjectFilter.innerHTML += `<option value="${subject}">${subject}</option>`;
    });
    
    subjectFilter.removeEventListener('change', onPracticeSubjectChange);
    subjectFilter.addEventListener('change', onPracticeSubjectChange);
    
    renderPracticeExamList('');
    await loadPracticeQuestionTypes();
}

export function onPracticeSubjectChange() {
    const subject = document.getElementById('practice-subject-filter').value;
    renderPracticeExamList(subject);
}

export function renderPracticeExamList(subject) {
    const checkboxGrid = document.getElementById('practice-exam-checkbox-grid');
    
    let filtered = EXAM_LIST;
    if (subject) {
        filtered = filtered.filter(e => e.subject === subject);
    }
    
    checkboxGrid.innerHTML = '';
    filtered.forEach((exam) => {
        const originalIndex = EXAM_LIST.indexOf(exam);
        const item = document.createElement('label');
        item.className = 'exam-checkbox-item';
        const filename = getFilenameFromPath(exam.file || exam.path);
        item.innerHTML = `
            <input type="checkbox" value="${originalIndex}" class="practice-exam-checkbox">
            <span title="${filename}">${filename}</span>
        `;
        checkboxGrid.appendChild(item);
    });
    
    updateSourceSummary();
}

export function updateSourceSummary() {
    const subject = document.getElementById('practice-subject-filter')?.value || '';
    const allBoxes = document.querySelectorAll('.practice-exam-checkbox');
    const checkedBoxes = document.querySelectorAll('.practice-exam-checkbox:checked');
    const subjectText = subject || '全部科目';
    const examText = allBoxes.length === 0
        ? '加载中...'
        : checkedBoxes.length === 0
            ? `未选择（共 ${allBoxes.length} 套）`
            : checkedBoxes.length === allBoxes.length
                ? `全部 ${allBoxes.length} 套`
                : `已选 ${checkedBoxes.length}/${allBoxes.length} 套`;
    const el = document.getElementById('source-summary-text');
    if (el) el.textContent = `${subjectText} · ${examText}`;
}

export function toggleSourceDetail() {
    const detail = document.getElementById('practice-source-detail');
    const btn = document.getElementById('btn-toggle-source');
    if (!detail || !btn) return;
    const isHidden = detail.classList.contains('hidden');
    detail.classList.toggle('hidden', !isHidden);
    btn.textContent = isHidden ? '收起 ▲' : '展开设置 ▼';
}

async function loadPracticeQuestionTypes() {
    try {
        const response = await fetch(EXAM_LIST[0].file || EXAM_LIST[0].path);
        const data = await response.json();
        
        const types = [...new Set(data.questions.map(q => q.question_type))];
        const typeFilters = document.getElementById('practice-type-filters');
        
        typeFilters.innerHTML = '';
        types.forEach(type => {
            const item = document.createElement('label');
            item.className = 'config-label';
            item.innerHTML = `
                <input type="checkbox" value="${type}" class="practice-type-checkbox">
                <span>${type}</span>
            `;
            typeFilters.appendChild(item);
        });
    } catch (error) {
        console.error('加载题型失败:', error);
    }
}

// ==================== Tab 切换 ====================

export function switchPracticeTab(tabName) {
    document.querySelectorAll('.practice-mode-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.practiceTab === tabName);
    });
    document.querySelectorAll('.practice-mode-tab-content').forEach(panel => {
        panel.classList.toggle('hidden', panel.id !== `practice-tab-${tabName}`);
    });
}

// ==================== AI 生成公共工具 ====================

async function loadPracticeSourceQuestions(subject, examIndices) {
    const allQuestions = [];
    for (let i = 0; i < EXAM_LIST.length; i++) {
        const exam = EXAM_LIST[i];
        if (subject && exam.subject !== subject) continue;
        if (examIndices && examIndices.length > 0 && !examIndices.includes(i)) continue;
        try {
            const path = exam.file || exam.path;
            const res = await fetch(path);
            if (!res.ok) continue;
            const data = await res.json();
            if (data.questions) allQuestions.push(...data.questions);
        } catch (e) {
            console.error('加载试卷失败:', e);
        }
    }
    return allQuestions;
}

async function callAiForQuestions(systemPrompt, userPrompt) {
    const config = getActiveConfig();
    if (!config.apiKey) throw new Error('未设置 API Key，请先在 ⚙️ 设置中配置');

    const response = await fetch(config.apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
            model: config.apiModel,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
            enable_thinking: false
        })
    });

    if (!response.ok) {
        throw new Error(`API 请求失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const text = data.choices[0].message.content.trim();

    let jsonText = text;
    if (text.includes('```')) {
        const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (match) jsonText = match[1].trim();
    }

    const arrMatch = jsonText.match(/\[[\s\S]*\]/);
    if (!arrMatch) throw new Error('AI 返回内容不含有效的 JSON 数组，请重试');

    const questions = JSON.parse(arrMatch[0]);
    questions.forEach(q => { if (!q.score) q.score = 2; });
    return questions;
}

function setAiGenerateStatus(statusEl, btn, originalText, msg, isError = false) {
    statusEl.classList.remove('hidden');
    statusEl.className = `ai-generate-status ${isError ? 'ai-status-error' : 'ai-status-info'}`;
    statusEl.textContent = msg;
    if (btn) btn.textContent = originalText;
}

// ==================== AI 生成选择题 ====================

export async function startAiMcqGeneration() {
    const count = parseInt(document.getElementById('ai-mcq-count').value) || 10;
    const subject = document.getElementById('practice-subject-filter').value;
    const selectedExams = Array.from(document.querySelectorAll('.practice-exam-checkbox:checked'))
        .map(cb => parseInt(cb.value));

    const btn = document.getElementById('btn-start-ai-mcq');
    const statusEl = document.getElementById('ai-mcq-status');
    const originalText = btn.textContent;

    btn.disabled = true;
    btn.textContent = '⏳ 生成中...';
    statusEl.classList.remove('hidden');
    statusEl.className = 'ai-generate-status ai-status-info';
    statusEl.textContent = '正在加载题目素材...';

    try {
        const allQ = await loadPracticeSourceQuestions(subject, selectedExams.length > 0 ? selectedExams : null);
        const choiceQ = allQ.filter(q => q.options);

        if (choiceQ.length === 0) throw new Error('所选范围内没有选择题，无法生成');

        const sample = shuffleArray([...choiceQ]).slice(0, 15);
        const refText = sample.map((q, i) => {
            const opts = Object.entries(q.options).map(([k, v]) => `${k}. ${v}`).join('\n');
            return `[参考题${i + 1}]\n题目：${q.content}\n选项：\n${opts}\n答案：${q.answer}`;
        }).join('\n\n');

        statusEl.textContent = `已加载 ${choiceQ.length} 道选择题素材，正在调用 AI 生成 ${count} 道新题...`;

        const systemPrompt = `你是一位专业出题专家。请根据参考题目的风格和知识点，生成全新的单选题。必须严格以JSON数组格式输出，不要有任何其他内容。格式：[{"content":"题目内容","question_type":"单选题","options":{"A":"...","B":"...","C":"...","D":"..."},"answer":"A","score":2,"explanation":"解析"}]`;
        const userPrompt = `请基于以下参考题目，生成 ${count} 道新的单选题（内容不要直接照抄，保持相同知识领域和难度）：\n\n${refText}`;

        const questions = await callAiForQuestions(systemPrompt, userPrompt);

        const title = `AI生成选择题 (${questions.length}题)`;
        localStorage.setItem('uploadedExamData', JSON.stringify({
            filename: title, exam_info: { title }, questions
        }));
        setAiGenerateStatus(statusEl, null, null, `✅ 已生成 ${questions.length} 道选择题，即将打开...`);
        window.open('exam.html?mode=upload', '_blank');
    } catch (e) {
        setAiGenerateStatus(statusEl, null, null, `❌ 生成失败：${e.message}`, true);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

// ==================== AI 生成填空题 ====================

export async function startAiFillGeneration() {
    const count = parseInt(document.getElementById('ai-fill-count').value) || 10;
    const subject = document.getElementById('practice-subject-filter').value;
    const selectedExams = Array.from(document.querySelectorAll('.practice-exam-checkbox:checked'))
        .map(cb => parseInt(cb.value));

    const btn = document.getElementById('btn-start-ai-fill');
    const statusEl = document.getElementById('ai-fill-status');
    const originalText = btn.textContent;

    btn.disabled = true;
    btn.textContent = '⏳ 生成中...';
    statusEl.classList.remove('hidden');
    statusEl.className = 'ai-generate-status ai-status-info';
    statusEl.textContent = '正在加载题目素材...';

    try {
        const allQ = await loadPracticeSourceQuestions(subject, selectedExams.length > 0 ? selectedExams : null);
        const subjectiveQ = allQ.filter(q => !q.options);

        if (subjectiveQ.length === 0) throw new Error('所选范围内没有非选择题，无法生成');

        const sample = shuffleArray([...subjectiveQ]).slice(0, 10);
        const refText = sample.map((q, i) =>
            `[参考题${i + 1}]\n题目：${q.content}\n答案：${q.answer}`
        ).join('\n\n');

        statusEl.textContent = `已加载 ${subjectiveQ.length} 道非选择题素材，正在调用 AI 生成 ${count} 道填空题...`;

        const systemPrompt = `你是一位专业出题专家。请根据参考题目的知识点，生成全新的填空题。用 ___ 表示空白处，一道题可有多个空。必须严格以JSON数组格式输出，不要有任何其他内容。格式：[{"content":"题目内容，___为空","question_type":"填空题","answer":"答案（多个空用|分隔）","score":2,"explanation":"解析"}]`;
        const userPrompt = `请基于以下参考题目，生成 ${count} 道新的填空题（内容不要直接照抄，保持相同知识领域）：\n\n${refText}`;

        const questions = await callAiForQuestions(systemPrompt, userPrompt);

        const title = `AI生成填空题 (${questions.length}题)`;
        localStorage.setItem('uploadedExamData', JSON.stringify({
            filename: title, exam_info: { title }, questions
        }));
        setAiGenerateStatus(statusEl, null, null, `✅ 已生成 ${questions.length} 道填空题，即将打开...`);
        window.open('exam.html?mode=upload', '_blank');
    } catch (e) {
        setAiGenerateStatus(statusEl, null, null, `❌ 生成失败：${e.message}`, true);
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}
