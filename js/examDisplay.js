// 题目显示和导航模块
import { state } from './state.js';
import { saveProgress } from './examProgress.js';
import { openAiChatPanel } from './aiChat.js';
import { Icons } from './icons.js';

// ==================== 题目导航 ====================

export function generateQuestionNav() {
    const nav = document.getElementById('question-nav');
    nav.innerHTML = '';

    if (!state.examData || !state.examData.questions) return;

    // 按题型分组
    const typeGroups = {};
    state.examData.questions.forEach((q, index) => {
        const type = q.question_type;
        if (!typeGroups[type]) {
            typeGroups[type] = [];
        }
        typeGroups[type].push({ question: q, index: index });
    });

    // 生成分组
    Object.keys(typeGroups).forEach(type => {
        const group = typeGroups[type];
        const groupDiv = document.createElement('div');
        groupDiv.className = 'question-type-group';

        const header = document.createElement('div');
        header.className = 'type-header';
        header.innerHTML = `
            <span>${type}</span>
            <span class="type-count">${group.length} 题</span>
        `;
        groupDiv.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'question-grid';

        group.forEach(item => {
            const btn = document.createElement('div');
            btn.className = 'question-item';
            btn.textContent = item.index + 1;
            btn.addEventListener('click', () => jumpToQuestion(item.index));
            btn.dataset.index = item.index;
            grid.appendChild(btn);
        });

        groupDiv.appendChild(grid);
        nav.appendChild(groupDiv);
    });

    updateNavStatus();
}

export function updateNavStatus() {
    const items = document.querySelectorAll('.question-item');
    items.forEach(item => {
        const index = parseInt(item.dataset.index);
        item.classList.remove('current', 'answered');

        if (index === state.currentQuestionIndex) {
            item.classList.add('current');
        } else if (state.userAnswers[index] !== undefined && state.userAnswers[index] !== '' && 
                  !(Array.isArray(state.userAnswers[index]) && state.userAnswers[index].length === 0)) {
            item.classList.add('answered');
        }
    });

    // 更新已答题数
    const answeredCount = Object.keys(state.userAnswers).filter(key => {
        const answer = state.userAnswers[key];
        return answer !== undefined && answer !== '' && 
               !(Array.isArray(answer) && answer.length === 0);
    }).length;
    document.getElementById('answered-count').textContent = answeredCount;
}

export function jumpToQuestion(index) {
    if (!state.examData || !state.examData.questions) return;
    if (index < 0 || index >= state.examData.questions.length) return;
    showQuestion(index);
}

// ==================== 题目显示 ====================

export function showQuestion(index) {
    if (!state.examData) return;

    // 检查 AI 聊天面板是否打开
    const aiPanel = document.getElementById('aiChatPanel');
    const isPanelOpen = aiPanel && !aiPanel.classList.contains('collapsed');

    state.currentQuestionIndex = index;
    
    // 保存当前进度
    saveProgress();
    
    const question = state.examData.questions[index];
    const container = document.getElementById('question-container');

    let html = `
        <div class="question-card">
            <div class="question-header">
                <div class="question-number">${index + 1}</div>
                <div class="question-meta">
                    <span class="question-type-badge">${question.question_type}</span>
                    <span class="question-score-badge">${question.score} 分</span>
                </div>
            </div>
            <div class="question-content">${question.content}</div>
    `;

    // 生成选项或输入框
    if (question.options) {
        const isMultiple = question.question_type.includes('多项');
        const inputType = isMultiple ? 'checkbox' : 'radio';
        const userAnswer = state.userAnswers[index] || (isMultiple ? [] : '');

        html += '<div class="options">';
        for (const [key, value] of Object.entries(question.options)) {
            const isChecked = isMultiple ? userAnswer.includes(key) : userAnswer === key;
            const checkedAttr = isChecked ? 'checked' : '';
            const selectedClass = isChecked ? 'selected' : '';

            let resultClass = '';
            if (state.showingResults && question.answer) {
                if (isMultiple) {
                    if (question.answer.includes(key)) {
                        resultClass = 'correct';
                    }
                } else {
                    if (question.answer === key) {
                        resultClass = 'correct';
                    } else if (userAnswer === key) {
                        resultClass = 'wrong';
                    }
                }
            }

            html += `
                <div class="option ${selectedClass} ${resultClass}" 
                     data-question-index="${index}" data-option="${key}" data-is-multiple="${isMultiple}">
                    <input type="${inputType}" name="q${index}" value="${key}" ${checkedAttr} 
                        ${state.showingResults ? 'disabled' : ''}>
                    <span class="option-text"><strong>${key}.</strong> ${value}</span>
                </div>
            `;
        }
        html += '</div>';
    } else {
        const userAnswer = state.userAnswers[index] || '';
        const disabled = state.showingResults ? 'disabled' : '';
        html += `
            <textarea class="textarea-answer" data-question-index="${index}" placeholder="请输入你的答案..." ${disabled}>${userAnswer}</textarea>
        `;
    }

    // 答案区域
    if (question.answer) {
        const showAnswer = state.showingResults;
        html += `
            <div class="answer-section ${showAnswer ? 'show' : ''}" id="answer-${index}">
                <div class="answer-label">参考答案</div>
                <div class="answer-content">${question.answer}</div>
            </div>
        `;
    }

    // AI 解析区域（按需显示）
    const explainState = state.aiExplainDetails[index];
    const explainShow = explainState?.show;
    html += `
        <div class="ai-explain-section ${explainShow ? 'show' : ''}" id="ai-explain-${index}">
            <div class="ai-explain-header">
                <span class="ai-explain-label">${Icons.brain} AI 解析</span>
                <span class="ai-explain-status" id="ai-explain-status-${index}"></span>
            </div>
            <div class="ai-explain-content" id="ai-explain-content-${index}"></div>
        </div>
    `;

    // AI评分详情（仅主观题且已评分时显示）
    if (!question.options && state.aiGradingDetails[index] && state.showingResults) {
        const detail = state.aiGradingDetails[index];
        html += `
            <div class="ai-grading-section show">
                <div class="ai-grading-header">
                    <span class="ai-grading-label">${Icons.cpu} AI 评分详情</span>
                    <span class="ai-grading-score">${Math.round(detail.score * 100)}%</span>
                </div>
                <div class="ai-grading-item">
                    <div class="ai-grading-item-label">${Icons.barChart} 得分依据</div>
                    <div class="ai-grading-item-content">${detail.reason || '无'}</div>
                </div>
                <div class="ai-grading-item">
                    <div class="ai-grading-item-label">${Icons.checkCircle} 优点</div>
                    <div class="ai-grading-item-content">${detail.strengths || '无'}</div>
                </div>
                <div class="ai-grading-item">
                    <div class="ai-grading-item-label">${Icons.alertTriangle} 不足之处</div>
                    <div class="ai-grading-item-content">${detail.weaknesses || '无'}</div>
                </div>
                <div class="ai-grading-item">
                    <div class="ai-grading-item-label">${Icons.lightbulb} 改进建议</div>
                    <div class="ai-grading-item-content">${detail.suggestions || '无'}</div>
                </div>
            </div>
        `;
    }

    // 导航按钮
    html += `
        <div class="navigation-buttons">
            <button class="btn-nav btn-prev" id="btn-prev" 
                ${index === 0 ? 'disabled' : ''}>← 上一题</button>
            <div class="nav-center-actions">
                <button class="btn-show-answer" id="btn-show-answer" 
                    ${!question.answer ? 'style="display:none"' : ''}>
                    ${state.showingResults ? '已显示答案' : '显示答案'}
                </button>
                <button class="btn-ai-explain" id="btn-ai-explain" 
                    ${!question.answer ? 'style="display:none"' : ''}>
                    AI 解析
                </button>
            </div>
            <button class="btn-nav btn-next" id="btn-next" 
                ${index === state.examData.questions.length - 1 ? 'disabled' : ''}>下一题 →</button>
        </div>
    `;

    html += '</div>';
    container.innerHTML = html;

    // 绑定选项点击事件
    document.querySelectorAll('.option').forEach(option => {
        option.addEventListener('click', function() {
            const questionIndex = parseInt(this.dataset.questionIndex);
            const optionKey = this.dataset.option;
            const isMultiple = this.dataset.isMultiple === 'true';
            selectOption(questionIndex, optionKey, isMultiple);
        });
    });

    // 绑定文本框输入事件
    const textarea = document.querySelector('.textarea-answer');
    if (textarea) {
        textarea.addEventListener('change', function() {
            const questionIndex = parseInt(this.dataset.questionIndex);
            saveTextAnswer(questionIndex, this.value);
        });
    }

    // 绑定导航按钮事件
    document.getElementById('btn-prev')?.addEventListener('click', () => {
        if (state.currentQuestionIndex > 0) showQuestion(state.currentQuestionIndex - 1);
    });

    document.getElementById('btn-next')?.addEventListener('click', () => {
        if (state.currentQuestionIndex < state.examData.questions.length - 1) 
            showQuestion(state.currentQuestionIndex + 1);
    });

    document.getElementById('btn-show-answer')?.addEventListener('click', function() {
        const answerSection = document.getElementById(`answer-${index}`);
        if (answerSection) {
            answerSection.classList.toggle('show');
            this.textContent = answerSection.classList.contains('show') ? '隐藏答案' : '显示答案';
        }
    });

    document.getElementById('btn-ai-explain')?.addEventListener('click', async function() {
        openAiChatPanel(question, index);
    });

    updateNavStatus();
    
    // 如果 AI 聊天面板是打开状态，自动切换到新题目的聊天记录
    if (isPanelOpen) {
        openAiChatPanel(question, index);
    }
}

// ==================== 答案处理 ====================

export function selectOption(questionIndex, option, isMultiple) {
    if (state.showingResults) return;

    if (isMultiple) {
        if (!state.userAnswers[questionIndex]) {
            state.userAnswers[questionIndex] = [];
        }
        const index = state.userAnswers[questionIndex].indexOf(option);
        if (index > -1) {
            state.userAnswers[questionIndex].splice(index, 1);
        } else {
            state.userAnswers[questionIndex].push(option);
        }
        state.userAnswers[questionIndex].sort();
    } else {
        state.userAnswers[questionIndex] = option;
    }

    // 保存答题进度
    saveProgress();
    
    showQuestion(questionIndex);
}

export function saveTextAnswer(questionIndex, value) {
    state.userAnswers[questionIndex] = value.trim();
    updateNavStatus();
    
    // 保存答题进度
    saveProgress();
}
