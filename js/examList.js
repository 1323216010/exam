// 试卷列表相关功能
import { EXAM_LIST } from './config.js';
import { compareExamsByDate, getExamDateLabel, getExamDisplayName, getFilenameFromPath, getSubjectDisplayName } from './utils.js';
import { clearAllChatDatabase, getChatStats } from './aiChatStorage.js';
import { Icons } from './icons.js';
import { bindSubjectTabs, getSubjectChip, groupExamsBySubject, matchesSubjectFilter } from './subjectFilter.js?v=20260914a';

export function renderExamList() {
    const grid = document.getElementById('exam-list-grid');
    const examCount = document.getElementById('exam-count');
    const subjectFilter = document.getElementById('subject-filter');
    const searchInput = document.getElementById('exam-search');
    const sortFilter = document.getElementById('sort-filter');

    examCount.textContent = EXAM_LIST.length;
    bindSubjectTabs(document.getElementById('subject-tabs'), subjectFilter, EXAM_LIST);

    if (!subjectFilter.dataset.bound) {
        subjectFilter.dataset.bound = '1';
        subjectFilter.addEventListener('change', filterExamList);
        sortFilter.addEventListener('change', filterExamList);
        searchInput.addEventListener('input', filterExamList);

        const clearAllChatsBtn = document.getElementById('clear-all-chats-btn');
        if (clearAllChatsBtn) {
            clearAllChatsBtn.addEventListener('click', handleClearAllChats);
        }

        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const view = btn.dataset.view;
                grid.classList.remove('view-grid', 'view-list');
                grid.classList.add(`view-${view}`);
            });
        });
    }

    filterExamList();
}

export function filterExamList() {
    const grid = document.getElementById('exam-list-grid');
    const examCount = document.getElementById('exam-count');
    const subjectFilter = document.getElementById('subject-filter').value;
    const searchInput = document.getElementById('exam-search').value.toLowerCase();
    const sortFilter = document.getElementById('sort-filter').value;
    const sortDirection = sortFilter === 'date-asc' ? 'asc' : 'desc';

    let filtered = EXAM_LIST;

    if (subjectFilter) {
        filtered = filtered.filter(e => matchesSubjectFilter(e.subject, subjectFilter));
    }

    if (searchInput) {
        filtered = filtered.filter(e => examMatchesSearch(e, searchInput));
    }

    filtered = [...filtered].sort((a, b) => compareExamsByDate(a, b, sortDirection));
    examCount.textContent = filtered.length;
    grid.innerHTML = '';

    if (filtered.length === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:#9CA3AF;font-size:16px;">${Icons.search} 没有找到符合条件的试卷</div>`;
        return;
    }

    if (subjectFilter) {
        filtered.forEach(exam => grid.appendChild(createExamCard(exam)));
        return;
    }

    groupExamsBySubject(filtered).forEach(group => {
        const heading = document.createElement('div');
        heading.className = 'exam-subject-heading';
        heading.textContent = `${group.label} · ${group.exams.length} 套`;
        grid.appendChild(heading);
        group.exams.forEach(exam => grid.appendChild(createExamCard(exam)));
    });
}

function examMatchesSearch(exam, searchInput) {
    const filename = getFilenameFromPath(getExamPath(exam)).toLowerCase();
    const displayName = getExamDisplayName(exam).toLowerCase();
    const dateLabel = getExamDateLabel(exam).toLowerCase();
    const subjectName = getSubjectDisplayName(exam.subject).toLowerCase();
    const code = String(exam.exam_info?.code || exam.subject || '').toLowerCase();

    return filename.includes(searchInput)
        || displayName.includes(searchInput)
        || dateLabel.includes(searchInput)
        || subjectName.includes(searchInput)
        || code.includes(searchInput);
}

function createExamCard(exam) {
    const card = document.createElement('div');
    card.className = 'exam-card';
    card.setAttribute('role', 'button');
    card.tabIndex = 0;

    const examPath = getExamPath(exam);
    const displayName = getExamDisplayName(exam);
    const title = getExamDateLabel(exam) || displayName;
    const subjectChip = getSubjectChip(exam.subject);
    const countText = exam.question_count != null ? `共 ${exam.question_count} 题` : '题目数未知';

    const openExam = () => {
        const url = `exam.html?exam=${encodeURIComponent(examPath)}&filename=${encodeURIComponent(displayName)}`;
        if (window.matchMedia('(max-width: 768px)').matches) {
            window.location.assign(url);
        } else {
            window.open(url, '_blank');
        }
    };

    card.setAttribute('aria-label', `开始模拟：${displayName}`);
    card.addEventListener('click', openExam);
    card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openExam();
        }
    });

    card.style.setProperty('--subject-accent', subjectChip.accent);
    card.innerHTML = `
        <div class="exam-card-header">
            <div class="exam-card-title">${title}</div>
            <div class="exam-card-meta">
                <span class="exam-subject-chip" style="background:${subjectChip.bg};color:${subjectChip.color}">${subjectChip.label}</span>
            </div>
        </div>
        <div class="exam-card-footer">
            <div class="exam-card-question-count">
                <span class="count-icon">${Icons.clipboardList}</span>
                <span class="count-text">${countText}</span>
            </div>
            <span class="exam-card-start" aria-hidden="true">开始模拟 <span>→</span></span>
        </div>
    `;

    return card;
}

function getExamPath(exam) {
    if (!exam || typeof exam !== 'object') return '';
    return exam.path || exam.file || '';
}

async function handleClearAllChats() {
    try {
        const stats = await getChatStats();
        const totalRecords = stats.totalRecords || 0;

        if (totalRecords === 0) {
            alert('当前没有任何聊天记录');
            return;
        }

        if (!confirm(`确定要清除所有试卷的 AI 聊天记录吗？\n\n共有 ${totalRecords} 条记录将被删除，此操作不可恢复。`)) {
            return;
        }

        const btn = document.getElementById('clear-all-chats-btn');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = '清除中...';

        await clearAllChatDatabase();

        btn.textContent = '✓ 已清除';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.disabled = false;
        }, 2000);

        alert('所有聊天记录已清除');
    } catch (error) {
        console.error('清除聊天记录失败:', error);
        alert('清除失败：' + error.message);
        const btn = document.getElementById('clear-all-chats-btn');
        if (btn) btn.disabled = false;
    }
}
