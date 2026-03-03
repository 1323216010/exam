// 答题进度管理模块
import { state } from './state.js';

// ==================== 答题进度管理 ====================

// 获取试卷唯一标识
export function getExamKey() {
    if (!state.examData) return null;
    // 使用 filename 或生成一个基于试题内容的哈希
    const filename = state.examData.filename || state.examData.exam_info?.title || 'exam';
    return `exam_progress_${filename.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}`;
}

// 检查是否有有效的答题记录
function hasValidAnswers() {
    if (!state.userAnswers) return false;
    
    const answeredCount = Object.keys(state.userAnswers).filter(key => {
        const answer = state.userAnswers[key];
        return answer !== undefined && answer !== '' && 
               !(Array.isArray(answer) && answer.length === 0);
    }).length;
    
    return answeredCount > 0;
}

// 保存答题进度
export function saveProgress() {
    const examKey = getExamKey();
    if (!examKey || state.showingResults) return;
    
    // 只有当用户至少答了一道题时才保存
    if (!hasValidAnswers()) return;
    
    const progress = {
        userAnswers: state.userAnswers,
        currentQuestionIndex: state.currentQuestionIndex,
        startTime: state.startTime?.toISOString(),
        lastSaveTime: new Date().toISOString(),
        examData: {
            filename: state.examData.filename,
            questionsCount: state.examData.questions?.length
        },
        // 保存打乱后的选项和答案，确保继续答题时一致
        shuffledQuestions: state.examData.questions?.map(q => ({
            options: q.options,
            answer: q.answer
        }))
    };
    
    try {
        localStorage.setItem(examKey, JSON.stringify(progress));
    } catch (error) {
        console.error('保存答题进度失败:', error);
    }
}

// 加载答题进度
export function loadProgress() {
    const examKey = getExamKey();
    if (!examKey) return null;
    
    try {
        const progressStr = localStorage.getItem(examKey);
        if (!progressStr) return null;
        
        const progress = JSON.parse(progressStr);
        
        // 验证进度数据是否匹配当前试卷
        if (progress.examData.questionsCount !== state.examData.questions?.length) {
            console.warn('试卷题目数量不匹配，忽略保存的进度');
            clearProgress();
            return null;
        }
        
        // 检查是否有有效的答题记录
        const answeredCount = Object.keys(progress.userAnswers || {}).filter(key => {
            const answer = progress.userAnswers[key];
            return answer !== undefined && answer !== '' && 
                   !(Array.isArray(answer) && answer.length === 0);
        }).length;
        
        if (answeredCount === 0) {
            console.warn('没有有效的答题记录，清除进度');
            clearProgress();
            return null;
        }
        
        return progress;
    } catch (error) {
        console.error('加载答题进度失败:', error);
        return null;
    }
}

// 清除答题进度
export function clearProgress() {
    const examKey = getExamKey();
    if (examKey) {
        localStorage.removeItem(examKey);
    }
}

// 检查是否有保存的进度
export function hasProgress() {
    const progress = loadProgress();
    return progress !== null;
}

// 恢复答题进度
export function restoreProgress(progress) {
    state.userAnswers = progress.userAnswers || {};
    state.currentQuestionIndex = progress.currentQuestionIndex || 0;
    if (progress.startTime) {
        state.startTime = new Date(progress.startTime);
    }
    
    // 恢复打乱后的选项和答案
    if (progress.shuffledQuestions && state.examData?.questions) {
        progress.shuffledQuestions.forEach((saved, index) => {
            if (state.examData.questions[index] && saved) {
                if (saved.options) {
                    state.examData.questions[index].options = saved.options;
                }
                if (saved.answer !== undefined) {
                    state.examData.questions[index].answer = saved.answer;
                }
            }
        });
    }
}

// 显示进度恢复对话框
export function showProgressDialog({ lastSaveDate, answeredCount, totalCount, onContinue, onRestart }) {
    const dialogHtml = `
        <div class="modal show" id="progress-dialog" style="z-index: 10000;">
            <div class="modal-content" style="max-width: 480px;">
                <div class="modal-header">
                    <h3>📋 发现答题进度</h3>
                </div>
                <div class="modal-body">
                    <div style="margin-bottom: 20px; padding: 16px; background: #F3F4F6; border-radius: 8px;">
                        <div style="margin-bottom: 8px; color: #374151;">
                            <strong>上次保存时间：</strong>${lastSaveDate}
                        </div>
                        <div style="color: #374151;">
                            <strong>答题进度：</strong>${answeredCount} / ${totalCount} 题
                        </div>
                    </div>
                    <div style="color: #6B7280; font-size: 14px; line-height: 1.6;">
                        检测到您有未完成的答题记录，是否要继续上次的答题？
                    </div>
                </div>
                <div class="modal-footer" style="gap: 12px;">
                    <button class="btn btn-secondary" id="progress-restart" style="flex: 1;">重新开始</button>
                    <button class="btn btn-submit" id="progress-continue" style="flex: 1;">继续答题</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', dialogHtml);
    
    document.getElementById('progress-continue').addEventListener('click', () => {
        document.getElementById('progress-dialog').remove();
        onContinue();
    });
    
    document.getElementById('progress-restart').addEventListener('click', () => {
        document.getElementById('progress-dialog').remove();
        onRestart();
    });
}
