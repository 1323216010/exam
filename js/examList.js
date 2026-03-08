// 试卷列表相关功能
import { EXAM_LIST } from './config.js';
import { getFilenameFromPath } from './utils.js';
import { clearAllChatDatabase, getChatStats } from './aiChatStorage.js';

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
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: #9CA3AF; font-size: 16px;">🔍 没有找到符合条件的试卷</div>';
        return;
    }
    
    filtered.forEach((exam) => {
        const card = document.createElement('div');
        card.className = 'exam-card';
        const examPath = getExamPath(exam);
        const filename = getFilenameFromPath(examPath);
        
        card.addEventListener('click', () => {
            const url = `exam.html?exam=${encodeURIComponent(examPath)}&filename=${encodeURIComponent(filename)}`;
            window.open(url, '_blank');
        });
        
        card.innerHTML = `
            <div class="exam-card-header">
                <div class="exam-card-title">${filename}</div>
                <div class="exam-card-meta" data-exam-info>
                </div>
            </div>
            <div class="exam-card-footer">
                <div class="exam-card-question-count" data-question-count>
                    <span class="count-icon">📝</span>
                    <span class="count-text">题目加载中...</span>
                </div>
            </div>
        `;
        
        grid.appendChild(card);
        
        if (examPath) {
            loadExamDetails(examPath, card);
        }
    });
}

function getExamPath(exam) {
    if (!exam || typeof exam !== 'object') return '';
    return exam.path || exam.file || '';
}

async function loadExamDetails(path, card) {
    try {
        const response = await fetch(path);
        if (!response.ok) return;
        
        const data = await response.json();
        const questionCount = data.questions ? data.questions.length : 0;
        
        const countElement = card.querySelector('[data-question-count] .count-text');
        if (countElement) {
            countElement.textContent = `共 ${questionCount} 题`;
        }
        
        if (data.exam_info && typeof data.exam_info === 'object') {
            const metaContainer = card.querySelector('[data-exam-info]');
            if (metaContainer) {
                metaContainer.innerHTML = '';
                
                const fieldStyles = {
                    'code': { bg: 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)', color: '#1E40AF' },
                    'date': { bg: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)', color: '#059669' },
                    'subject': { bg: 'linear-gradient(135deg, #FCE7F3 0%, #FBCFE8 100%)', color: '#BE185D' },
                    'title': { bg: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)', color: '#D97706' },
                };
                
                const colorSchemes = [
                    { bg: 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)', color: '#1E40AF' },
                    { bg: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)', color: '#059669' },
                    { bg: 'linear-gradient(135deg, #FCE7F3 0%, #FBCFE8 100%)', color: '#BE185D' },
                    { bg: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)', color: '#D97706' },
                    { bg: 'linear-gradient(135deg, #EDE9FE 0%, #DDD6FE 100%)', color: '#7C3AED' },
                ];
                
                let colorIndex = 0;
                Object.entries(data.exam_info).forEach(([key, value]) => {
                    if (value == null || value === '') return;
                    
                    const style = fieldStyles[key] || colorSchemes[colorIndex % colorSchemes.length];
                    if (!fieldStyles[key]) colorIndex++;
                    
                    const badge = document.createElement('span');
                    badge.className = 'exam-info-badge';
                    badge.style.background = style.bg;
                    badge.style.color = style.color;
                    badge.textContent = value;
                    
                    metaContainer.appendChild(badge);
                });
            }
        }
    } catch (error) {
        console.error('Failed to load exam details:', error);
    }
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
