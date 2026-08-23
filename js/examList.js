// 试卷列表相关功能
import { EXAM_LIST } from './config.js';
import { getFilenameFromPath } from './utils.js';
import { clearAllChatDatabase, getChatStats } from './aiChatStorage.js';
import { Icons } from './icons.js';

export function renderExamList() {
    const grid = document.getElementById('exam-list-grid');
    const examCount = document.getElementById('exam-count');
    const subjectFilter = document.getElementById('subject-filter');
    const searchInput = document.getElementById('exam-search');
    const sortFilter = document.getElementById('sort-filter');
    
    examCount.textContent = EXAM_LIST.length;
    
    const subjects = [...new Set(EXAM_LIST.map(e => e.subject))].sort();
    subjectFilter.innerHTML = '<option value="">全部科目</option>';
    subjects.forEach(subject => {
        subjectFilter.innerHTML += `<option value="${subject}">${subject}</option>`;
    });
    
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
    
    filterExamList();
}

export function filterExamList() {
    const grid = document.getElementById('exam-list-grid');
    const subjectFilter = document.getElementById('subject-filter').value;
    const searchInput = document.getElementById('exam-search').value.toLowerCase();
    const sortFilter = document.getElementById('sort-filter').value;
    
    let filtered = EXAM_LIST;
    
    if (subjectFilter) {
        filtered = filtered.filter(e => e.subject === subjectFilter);
    }
    
    if (searchInput) {
        filtered = filtered.filter(e => {
            const filename = getFilenameFromPath(getExamPath(e)).toLowerCase();
            return filename.includes(searchInput);
        });
    }
    
    filtered.sort((a, b) => {
        const nameA = getFilenameFromPath(getExamPath(a));
        const nameB = getFilenameFromPath(getExamPath(b));
        
        if (sortFilter === 'name-asc') {
            return nameA.localeCompare(nameB);
        } else if (sortFilter === 'name-desc') {
            return nameB.localeCompare(nameA);
        }
        return 0;
    });
    
    grid.innerHTML = '';
    
    if (filtered.length === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:#9CA3AF;font-size:16px;">${Icons.search} 没有找到符合条件的试卷</div>`;
        return;
    }
    
    filtered.forEach((exam) => {
        const card = document.createElement('div');
        card.className = 'exam-card';
        card.setAttribute('role', 'button');
        card.tabIndex = 0;
        const examPath = getExamPath(exam);
        const filename = getFilenameFromPath(examPath);

        const openExam = () => {
            const url = `exam.html?exam=${encodeURIComponent(examPath)}&filename=${encodeURIComponent(filename)}`;
            if (window.matchMedia('(max-width: 768px)').matches) {
                window.location.assign(url);
            } else {
                window.open(url, '_blank');
            }
        };

        card.setAttribute('aria-label', `开始模拟：${filename}`);
        card.addEventListener('click', openExam);
        card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openExam();
            }
        });
        
        const metaBadges = buildExamInfoBadges(exam.exam_info);
        const countText = exam.question_count != null ? `共 ${exam.question_count} 题` : '题目数未知';

        card.innerHTML = `
            <div class="exam-card-header">
                <div class="exam-card-title">${filename}</div>
                <div class="exam-card-meta">${metaBadges}</div>
            </div>
            <div class="exam-card-footer">
                <div class="exam-card-question-count">
                    <span class="count-icon">${Icons.clipboardList}</span>
                    <span class="count-text">${countText}</span>
                </div>
                <span class="exam-card-start" aria-hidden="true">开始模拟 <span>→</span></span>
            </div>
        `;
        
        grid.appendChild(card);
    });
}

function getExamPath(exam) {
    if (!exam || typeof exam !== 'object') return '';
    return exam.path || exam.file || '';
}

const FIELD_STYLES = {
    'code':    { bg: 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)', color: '#1E40AF' },
    'date':    { bg: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)', color: '#059669' },
    'subject': { bg: 'linear-gradient(135deg, #FCE7F3 0%, #FBCFE8 100%)', color: '#BE185D' },
    'title':   { bg: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)', color: '#D97706' },
};
const COLOR_SCHEMES = [
    { bg: 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)', color: '#1E40AF' },
    { bg: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)', color: '#059669' },
    { bg: 'linear-gradient(135deg, #FCE7F3 0%, #FBCFE8 100%)', color: '#BE185D' },
    { bg: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)', color: '#D97706' },
    { bg: 'linear-gradient(135deg, #EDE9FE 0%, #DDD6FE 100%)', color: '#7C3AED' },
];

function buildExamInfoBadges(examInfo) {
    if (!examInfo || typeof examInfo !== 'object') return '';
    let colorIndex = 0;
    return Object.entries(examInfo).map(([key, value]) => {
        if (value == null || value === '') return '';
        const style = FIELD_STYLES[key] || COLOR_SCHEMES[colorIndex++ % COLOR_SCHEMES.length];
        return `<span class="exam-info-badge" style="background:${style.bg};color:${style.color}">${value}</span>`;
    }).join('');
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
