// AI 生成题目历史记录 UI 管理
import { getAllAiGeneratedExams, deleteAiGeneratedExam, clearAllAiGeneratedExams } from './aiChatStorage.js';
import { Icons } from './icons.js';

// 渲染 AI 历史列表
export async function renderAiHistory() {
    const container = document.getElementById('ai-history-list');
    if (!container) return;

    container.innerHTML = `<div class="ai-history-loading">${Icons.loader} 加载中...</div>`;

    try {
        const records = await getAllAiGeneratedExams();

        if (records.length === 0) {
            container.innerHTML = `
                <div class="ai-history-empty">
                    <div class="empty-icon">${Icons.cpu}</div>
                    <div class="empty-text">暂无 AI 生成记录</div>
                    <div class="empty-hint">在「AI 选择题」或「AI 填空题」标签页生成题目后，记录会保存在这里</div>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="ai-history-header">
                <span class="ai-history-count">共 <strong>${records.length}</strong> 条记录</span>
                <button class="btn btn-text btn-danger-text" id="ai-history-clear-all">${Icons.trash} 清空全部</button>
            </div>
            <div class="ai-history-items" id="ai-history-items"></div>
        `;

        document.getElementById('ai-history-clear-all').addEventListener('click', async () => {
            if (confirm(`确定要清空全部 ${records.length} 条 AI 生成记录吗？此操作不可恢复。`)) {
                await clearAllAiGeneratedExams();
                renderAiHistory();
            }
        });

        const itemsContainer = document.getElementById('ai-history-items');
        records.forEach(record => {
            itemsContainer.appendChild(createHistoryItem(record));
        });
    } catch (e) {
        container.innerHTML = `<div class="ai-history-empty" style="color:#991B1B;">${Icons.alertCircle} 加载失败：${e.message}</div>`;
    }
}

function createHistoryItem(record) {
    const item = document.createElement('div');
    item.className = 'ai-history-item';
    item.dataset.id = record.id;

    const isMcq = record.type === 'mcq';
    const typeLabel = isMcq ? 'AI 选择题' : 'AI 填空题';
    const typeIcon = isMcq ? Icons.cpu : Icons.pencil;
    const typeClass = isMcq ? 'badge-mcq' : 'badge-fill';

    const dateStr = new Date(record.createdAt).toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
    });

    item.innerHTML = `
        <div class="ai-history-item-main">
            <div class="ai-history-item-title">
                <span class="ai-type-badge ${typeClass}">${typeIcon} ${typeLabel}</span>
                <span class="ai-history-title-text">${record.title}</span>
            </div>
            <div class="ai-history-item-meta">
                <span>${Icons.book} ${record.subject}</span>
                <span>${Icons.clipboardList} ${record.questionsCount} 题</span>
                <span>${Icons.clock} ${dateStr}</span>
            </div>
        </div>
        <div class="ai-history-item-actions">
            <button class="btn btn-sm btn-secondary btn-continue" title="从上次答题位置继续">${Icons.play} 继续答题</button>
            <button class="btn btn-sm btn-primary btn-restart" title="清除记录，重新开始">${Icons.rotateCcw} 重新开始</button>
            <button class="btn btn-sm btn-icon btn-delete" title="删除此记录">${Icons.trash}</button>
        </div>
    `;

    item.querySelector('.btn-continue').addEventListener('click', () => continueExam(record));
    item.querySelector('.btn-restart').addEventListener('click', () => restartExam(record));
    item.querySelector('.btn-delete').addEventListener('click', async () => {
        if (!confirm(`确定删除「${record.title}」的记录吗？`)) return;
        await deleteAiGeneratedExam(record.id);
        item.remove();
        // 更新计数
        const remaining = document.querySelectorAll('.ai-history-item').length;
        const countEl = document.querySelector('.ai-history-count');
        if (countEl) countEl.innerHTML = `共 <strong>${remaining}</strong> 条记录`;
        if (remaining === 0) renderAiHistory();
    });

    return item;
}

function buildExamPayload(record) {
    return {
        filename: record.id,
        exam_info: { title: record.title },
        questions: record.questions
    };
}

function getProgressKey(record) {
    return `exam_progress_${record.id.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_')}`;
}

function continueExam(record) {
    localStorage.setItem('uploadedExamData', JSON.stringify(buildExamPayload(record)));
    window.open('exam.html?mode=upload', '_blank');
}

function restartExam(record) {
    // 清除 localStorage 中的答题进度
    localStorage.removeItem(getProgressKey(record));
    localStorage.setItem('uploadedExamData', JSON.stringify(buildExamPayload(record)));
    window.open('exam.html?mode=upload', '_blank');
}
