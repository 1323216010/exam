// 答题页面核心逻辑
import { state, resetState } from './state.js';
import { EXAM_LIST, loadExamList } from './config.js';
import { getApiKey, saveApiKey, getApiUrl, saveApiUrl, getApiModel, saveApiModel, DEFAULT_API_URL, DEFAULT_API_MODEL } from './api.js';
import { shuffleArray, Timer, getFilenameFromPath } from './utils.js';
import { initChatDB, loadAllChatRecords } from './aiChatStorage.js';
import { openAiChatPanel, initAiChat } from './aiChat.js';

// 计时器实例
let timer = null;

// ==================== 移动端侧边栏控制 ====================

function toggleMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');
    const menuBtn = document.getElementById('mobile-menu-btn');
    
    sidebar.classList.toggle('show');
    overlay.classList.toggle('show');
    menuBtn.classList.toggle('active');
}

function closeMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');
    const menuBtn = document.getElementById('mobile-menu-btn');
    
    sidebar.classList.remove('show');
    overlay.classList.remove('show');
    menuBtn.classList.remove('active');
}

function updateMobileMenuVisibility() {
    const menuBtn = document.getElementById('mobile-menu-btn');
    const examLayout = document.getElementById('exam-layout');
    const resultContainer = document.getElementById('result-container');
    
    const shouldShow = !examLayout.classList.contains('hidden') || 
                      resultContainer.classList.contains('show');
    
    if (shouldShow && window.innerWidth <= 768) {
        menuBtn.style.display = 'flex';
    } else {
        menuBtn.style.display = 'none';
    }
}

// ==================== 考试初始化 ====================

async function initExam() {
    if (!state.examData || !state.examData.questions || state.examData.questions.length === 0) {
        alert('试题文件格式不正确或没有题目');
        return;
    }

    // 重置状态
    state.userAnswers = {};
    state.aiGradingDetails = {};
    state.aiExplainDetails = {};
    state.currentQuestionIndex = 0;
    state.showingResults = false;
    state.startTime = new Date();

    // 从 IndexedDB 加载聊天记录
    try {
        const savedChats = await loadAllChatRecords(state.examData);
        state.aiExplainDetails = savedChats || {};
    } catch (error) {
        console.error('加载聊天记录失败:', error);
        state.aiExplainDetails = {};
    }

    // 隐藏加载提示
    document.getElementById('exam-loading')?.classList.add('hidden');

    // 显示答题界面和侧边栏
    document.getElementById('result-container').classList.remove('show');
    document.getElementById('exam-layout').classList.remove('hidden');
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('restart-btn').style.display = 'none';

    // 更新移动端菜单显示
    updateMobileMenuVisibility();

    // 更新标题信息
    const filename = state.examData.filename || state.examData.exam_info?.title || '考试';
    document.getElementById('exam-header-title').textContent = filename;
    document.getElementById('exam-header-name').textContent = '';

    document.getElementById('total-count').textContent = state.examData.questions.length;

    // 生成题目导航
    generateQuestionNav();

    // 显示第一题
    showQuestion(0);

    // 启动计时器
    startTimer();
}

// ==================== 题目导航 ====================

function generateQuestionNav() {
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

function updateNavStatus() {
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

function jumpToQuestion(index) {
    if (!state.examData || !state.examData.questions) return;
    if (index < 0 || index >= state.examData.questions.length) return;
    showQuestion(index);
}

// ==================== 题目显示 ====================

function showQuestion(index) {
    if (!state.examData) return;

    // 检查 AI 聊天面板是否打开
    const aiPanel = document.getElementById('aiChatPanel');
    const isPanelOpen = aiPanel && !aiPanel.classList.contains('collapsed');

    state.currentQuestionIndex = index;
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
                <span class="ai-explain-label">🧠 AI 解析</span>
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
                    <span class="ai-grading-label">🤖 AI 评分详情</span>
                    <span class="ai-grading-score">${Math.round(detail.score * 100)}%</span>
                </div>
                <div class="ai-grading-item">
                    <div class="ai-grading-item-label">📊 得分依据</div>
                    <div class="ai-grading-item-content">${detail.reason || '无'}</div>
                </div>
                <div class="ai-grading-item">
                    <div class="ai-grading-item-label">✅ 优点</div>
                    <div class="ai-grading-item-content">${detail.strengths || '无'}</div>
                </div>
                <div class="ai-grading-item">
                    <div class="ai-grading-item-label">⚠️ 不足之处</div>
                    <div class="ai-grading-item-content">${detail.weaknesses || '无'}</div>
                </div>
                <div class="ai-grading-item">
                    <div class="ai-grading-item-label">💡 改进建议</div>
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

function selectOption(questionIndex, option, isMultiple) {
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

    showQuestion(questionIndex);
}

function saveTextAnswer(questionIndex, value) {
    state.userAnswers[questionIndex] = value.trim();
    updateNavStatus();
}

// ==================== 答卷提交和评分 ====================

async function handleSubmit() {
    if (!state.examData || !state.examData.questions) {
        alert('请先加载试题');
        return;
    }

    const answeredCount = Object.keys(state.userAnswers).filter(key => {
        const answer = state.userAnswers[key];
        return answer !== undefined && answer !== '' && 
               !(Array.isArray(answer) && answer.length === 0);
    }).length;

    if (!confirm(`确定要提交答案吗？\n\n已答题数：${answeredCount} / ${state.examData.questions.length}`)) {
        return;
    }

    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = '正在评分...';

    try {
        await calculateResults();
    } catch (error) {
        alert('评分过程出错：' + error.message);
        submitBtn.disabled = false;
        submitBtn.textContent = '提交答卷';
    }
}

async function calculateResults() {
    stopTimer();

    let objectiveCorrectCount = 0;
    let subjectiveScoreRatioSum = 0;
    let subjectiveCount = 0;
    let totalScore = 0;
    let earnedScore = 0;

    const subjectiveQuestions = state.examData.questions.filter(q => !q.options);

    if (subjectiveQuestions.length > 0) {
        const progressDiv = document.createElement('div');
        progressDiv.id = 'ai-grading-progress';
        progressDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 30px 40px;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            z-index: 10000;
            text-align: center;
            min-width: 300px;
        `;
        progressDiv.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 15px;">🤖</div>
            <div style="font-size: 18px; font-weight: 600; color: #111827; margin-bottom: 10px;">AI 正在评阅主观题...</div>
            <div style="font-size: 14px; color: #6B7280; margin-bottom: 20px;">
                <span id="grading-current">0</span> / <span id="grading-total">${subjectiveQuestions.length}</span>
            </div>
            <div style="width: 100%; height: 6px; background: #E5E7EB; border-radius: 10px; overflow: hidden;">
                <div id="grading-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #10B981 0%, #06B6D4 100%); transition: width 0.3s;"></div>
            </div>
        `;
        document.body.appendChild(progressDiv);
    }

    for (let index = 0; index < state.examData.questions.length; index++) {
        const question = state.examData.questions[index];
        totalScore += question.score || 0;
        const userAnswer = state.userAnswers[index];
        const correctAnswer = question.answer;

        if (correctAnswer) {
            let scoreRatio = 0;

            if (Array.isArray(userAnswer)) {
                const isCorrect = userAnswer.length === correctAnswer.length && 
                           userAnswer.every(a => correctAnswer.includes(a));
                scoreRatio = isCorrect ? 1 : 0;
                if (isCorrect) objectiveCorrectCount++;
            } else if (typeof userAnswer === 'string') {
                if (question.options) {
                    const isCorrect = userAnswer === correctAnswer;
                    scoreRatio = isCorrect ? 1 : 0;
                    if (isCorrect) objectiveCorrectCount++;
                } else {
                    subjectiveCount++;
                    if (userAnswer.length > 0) {
                        try {
                            scoreRatio = await gradeSubjectiveQuestion(
                                question.content,
                                correctAnswer,
                                userAnswer,
                                index,
                                subjectiveQuestions.length
                            );
                            subjectiveScoreRatioSum += scoreRatio;
                        } catch (error) {
                            console.error('AI 评分失败:', error);
                            scoreRatio = 0.5;
                            subjectiveScoreRatioSum += 0.5;
                        }
                    } else {
                        scoreRatio = 0;
                    }
                }
            }

            earnedScore += (question.score || 0) * scoreRatio;
        }
    }

    const progressDiv = document.getElementById('ai-grading-progress');
    if (progressDiv) progressDiv.remove();

    earnedScore = Math.round(earnedScore * 10) / 10;

    const objectiveCount = state.examData.questions.filter(q => q.options).length;
    const objectiveAccuracy = objectiveCount > 0 
        ? Math.round((objectiveCorrectCount / objectiveCount) * 100) 
        : 0;
    
    const subjectiveAvgScore = subjectiveCount > 0
        ? Math.round((subjectiveScoreRatioSum / subjectiveCount) * 100)
        : 0;

    document.getElementById('result-score').textContent = earnedScore;
    document.getElementById('total-score').textContent = totalScore;
    
    if (subjectiveCount > 0) {
        document.getElementById('objective-correct').textContent = objectiveCorrectCount;
        document.getElementById('objective-total').textContent = objectiveCount;
        document.getElementById('objective-accuracy').textContent = objectiveAccuracy + '%';
        document.getElementById('subjective-score').textContent = subjectiveAvgScore + '%';
        document.getElementById('subjective-total').textContent = subjectiveCount;
        
        document.getElementById('has-subjective').style.display = 'grid';
        document.getElementById('no-subjective').style.display = 'none';
    } else {
        document.getElementById('objective-correct-2').textContent = objectiveCorrectCount;
        document.getElementById('objective-total-2').textContent = objectiveCount;
        document.getElementById('objective-accuracy-2').textContent = objectiveAccuracy + '%';
        
        document.getElementById('has-subjective').style.display = 'none';
        document.getElementById('no-subjective').style.display = 'grid';
    }

    document.getElementById('exam-layout').classList.add('hidden');
    document.getElementById('result-container').classList.add('show');

    updateMobileMenuVisibility();
    closeMobileSidebar();

    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = false;
    submitBtn.textContent = '提交答卷';
}

async function gradeSubjectiveQuestion(questionContent, referenceAnswer, userAnswer, currentIndex, totalSubjective) {
    const subjectiveIndex = state.examData.questions
        .slice(0, currentIndex + 1)
        .filter(q => !q.options)
        .length;
    
    const currentSpan = document.getElementById('grading-current');
    const progressBar = document.getElementById('grading-progress-bar');
    if (currentSpan) currentSpan.textContent = subjectiveIndex;
    if (progressBar) {
        progressBar.style.width = (subjectiveIndex / totalSubjective * 100) + '%';
    }

    try {
        const apiKey = getApiKey();
        if (!apiKey) {
            console.warn('未设置 API Key，使用默认评分');
            return 0.7;
        }

        let apiUrl = getApiUrl();
        let apiModel = getApiModel();
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: apiModel,
                messages: [
                    {
                        role: 'system',
                        content: '你是一个专业的考试评分助手。请根据参考答案评价学生答案的准确性和完整性，给出详细的评分依据。必须严格返回JSON格式，格式如下：{"score": 0.85, "reason": "评分理由", "strengths": "答案的优点", "weaknesses": "答案的不足", "suggestions": "改进建议"}。score为0-1之间的小数。'
                    },
                    {
                        role: 'user',
                        content: `题目：${questionContent}\n\n参考答案：${referenceAnswer}\n\n学生答案：${userAnswer}\n\n请评分并给出详细评价（必须返回JSON格式）：`
                    }
                ],
                temperature: 0.3,
                max_tokens: 3000
            })
        });

        if (!response.ok) {
            throw new Error('API 请求失败');
        }

        const data = await response.json();
        const resultText = data.choices[0].message.content.trim();
        
        let result;
        try {
            let jsonText = resultText;
            if (resultText.includes('```')) {
                const codeBlockMatch = resultText.match(/```(?:json)?\s*([\s\S]*?)```/);
                if (codeBlockMatch) {
                    jsonText = codeBlockMatch[1].trim();
                }
            }
            
            const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                result = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('未找到JSON格式');
            }
        } catch (parseError) {
            console.warn('AI 返回的JSON解析失败:', resultText);
            console.warn('解析错误:', parseError);
            const scoreMatch = resultText.match(/\d+\.?\d*/);
            const score = scoreMatch ? parseFloat(scoreMatch[0]) : 0.5;
            result = {
                score: score > 1 ? score / 100 : score,
                reason: `AI返回格式异常，原始内容：${resultText}`,
                strengths: '无法解析',
                weaknesses: '无法解析',
                suggestions: '请检查API设置或稍后重试'
            };
        }

        if (isNaN(result.score) || result.score < 0 || result.score > 1) {
            console.warn('AI 返回的分数无效:', result.score);
            result.score = 0.5;
        }

        state.aiGradingDetails[currentIndex] = result;
        return result.score;
    } catch (error) {
        console.error('AI 评分错误:', error);
        throw error;
    }
}

// ==================== 结果查看和重新开始 ====================

function handleReview() {
    state.showingResults = true;
    document.getElementById('result-container').classList.remove('show');
    document.getElementById('exam-layout').classList.remove('hidden');
    document.getElementById('restart-btn').style.display = 'inline-block';
    document.getElementById('submit-btn').style.display = 'none';
    showQuestion(0);
    updateMobileMenuVisibility();
    closeMobileSidebar();
}

function restartExam() {
    if (confirm('确定要重新开始吗？当前答题记录将被清除。')) {
        initExam();
    }
}

// ==================== 计时器 ====================

function startTimer() {
    if (timer) {
        timer.stop();
    }
    timer = new Timer(state.startTime, (timeStr) => {
        document.getElementById('time-display').textContent = timeStr;
    });
    timer.start();
}

function stopTimer() {
    if (timer) {
        timer.stop();
    }
}

// ==================== 设置对话框 ====================

function showSettings() {
    const modal = document.getElementById('settings-modal');
    const apiKeyInput = document.getElementById('api-key-input');
    const apiUrlInput = document.getElementById('api-url-input');
    const apiModelInput = document.getElementById('api-model-input');
    
    apiKeyInput.value = getApiKey();
    apiUrlInput.value = getApiUrl();
    apiModelInput.value = getApiModel();
    
    modal.classList.add('show');
}

function closeSettings() {
    document.getElementById('settings-modal').classList.remove('show');
}

function saveSettings() {
    const apiKey = document.getElementById('api-key-input').value.trim();
    const apiUrl = document.getElementById('api-url-input').value.trim();
    const apiModel = document.getElementById('api-model-input').value.trim();
    
    saveApiKey(apiKey);
    saveApiUrl(apiUrl || DEFAULT_API_URL);
    saveApiModel(apiModel || DEFAULT_API_MODEL);
    
    alert('设置已保存！');
    closeSettings();
}

async function testApiConnection() {
    const apiKey = document.getElementById('api-key-input').value.trim();
    let apiUrl = document.getElementById('api-url-input').value.trim() || DEFAULT_API_URL;
    const testResult = document.getElementById('test-result');
    const testBtn = document.getElementById('test-api-btn');
    
    if (!apiKey) {
        testResult.style.display = 'block';
        testResult.style.background = '#FEF2F2';
        testResult.style.color = '#991B1B';
        testResult.style.border = '1px solid #FCA5A5';
        testResult.textContent = '❌ 请先输入 API Key';
        return;
    }
    
    testBtn.disabled = true;
    testBtn.textContent = '🔄 测试中...';
    testResult.style.display = 'block';
    testResult.style.background = '#F3F4F6';
    testResult.style.color = '#4B5563';
    testResult.style.border = '1px solid #D1D5DB';
    testResult.textContent = '正在连接 AI 服务...';
    
    try {
        const apiModel = document.getElementById('api-model-input').value.trim() || DEFAULT_API_MODEL;
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: apiModel,
                messages: [
                    {
                        role: 'user',
                        content: '你好，请回复"测试成功"'
                    }
                ],
                temperature: 0.3,
                max_tokens: 20
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API 返回错误: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.choices && data.choices[0] && data.choices[0].message) {
            testResult.style.background = '#ECFDF5';
            testResult.style.color = '#065F46';
            testResult.style.border = '1px solid #6EE7B7';
            testResult.textContent = `✅ 连接成功！AI 回复: ${data.choices[0].message.content.trim()}`;
        } else {
            throw new Error('API 返回格式异常');
        }
    } catch (error) {
        testResult.style.background = '#FEF2F2';
        testResult.style.color = '#991B1B';
        testResult.style.border = '1px solid #FCA5A5';
        testResult.textContent = `❌ 连接失败: ${error.message}`;
    } finally {
        testBtn.disabled = false;
        testBtn.textContent = '🔍 测试连接';
    }
}

// ==================== 试卷加载 ====================

async function startExam(filePath, filename = null) {
    try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error('无法加载试卷文件');
        
        state.examData = await response.json();
        if (filename) {
            state.examData.filename = filename;
        }
        initExam();
    } catch (error) {
        alert('加载试卷失败：' + error.message);
    }
}

async function loadAllQuestions(subjectFilter = null) {
    const allQuestions = [];
    
    for (const exam of EXAM_LIST) {
        if (subjectFilter && exam.subject !== subjectFilter) {
            continue;
        }
        
        try {
            const response = await fetch(exam.path);
            if (!response.ok) continue;
            
            const data = await response.json();
            if (data.questions && Array.isArray(data.questions)) {
                const filename = getFilenameFromPath(exam.path);
                data.questions.forEach(q => {
                    q.source = filename;
                    allQuestions.push(q);
                });
            }
        } catch (error) {
            console.error(`加载 ${exam.path} 失败:`, error);
        }
    }
    
    return allQuestions;
}

// ==================== URL参数处理 ====================

async function handleURLParams() {
    const params = new URLSearchParams(window.location.search);
    
    // 上传模式：从 localStorage 读取数据
    if (params.get('mode') === 'upload') {
        try {
            const examDataStr = localStorage.getItem('uploadedExamData');
            if (!examDataStr) {
                throw new Error('未找到上传的试题数据，请重新上传');
            }
            localStorage.removeItem('uploadedExamData');
            state.examData = JSON.parse(examDataStr);
            state.examData.filename = state.examData.filename || '上传试卷';
            initExam();
        } catch (error) {
            showLoadError(error.message);
        }
        return;
    }
    
    // 单个试卷模式
    if (params.has('exam')) {
        const examPath = params.get('exam');
        const filename = params.get('filename');
        await startExam(examPath, filename);
        return;
    }
    
    // 练习模式
    if (params.get('mode') === 'practice') {
        const randomOrder = params.get('random') === 'true';
        const limit = params.get('limit');
        const subject = params.get('subject');
        
        try {
            const allQuestions = await loadAllQuestions(subject);
            
            if (allQuestions.length === 0) {
                showLoadError('没有可用的题目');
                return;
            }
            
            let questions = allQuestions;
            if (limit && limit > 0) {
                questions = questions.slice(0, parseInt(limit));
            }
            
            if (randomOrder) {
                questions = shuffleArray(questions);
            }
            
            const subjectText = subject ? subject : '全部科目';
            const title = `题库练习 - ${subjectText} (${questions.length}题)`;
            state.examData = {
                filename: title,
                exam_info: {
                    title: title
                },
                questions: questions
            };
            
            initExam();
        } catch (error) {
            showLoadError('加载题库失败：' + error.message);
        }
        return;
    }
    
    // 自定义组卷模式
    if (params.get('mode') === 'custom') {
        const selectedIndices = params.get('exams').split(',').map(n => parseInt(n));
        const typeConfigs = JSON.parse(params.get('typeConfig'));
        const randomOrder = params.get('random') === 'true';
        const deduplicate = params.get('dedup') === 'true';
        
        try {
            let allQuestions = [];
            for (const index of selectedIndices) {
                const exam = EXAM_LIST[index];
                try {
                    const response = await fetch(exam.path);
                    if (!response.ok) continue;
                    
                    const data = await response.json();
                    if (data.questions && Array.isArray(data.questions)) {
                        const filename = getFilenameFromPath(exam.path);
                        data.questions.forEach(q => {
                            q.source = filename;
                            allQuestions.push(q);
                        });
                    }
                } catch (error) {
                    console.error(`加载 ${exam.path} 失败:`, error);
                }
            }
            
            // 按题型分组
            const questionsByType = {};
            allQuestions.forEach(q => {
                if (!questionsByType[q.question_type]) {
                    questionsByType[q.question_type] = [];
                }
                questionsByType[q.question_type].push(q);
            });
            
            // 去重处理
            if (deduplicate) {
                Object.keys(questionsByType).forEach(type => {
                    const seen = new Set();
                    questionsByType[type] = questionsByType[type].filter(q => {
                        const key = q.content + JSON.stringify(q.options || '');
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                    });
                });
            }
            
            // 按题型数量抽取题目
            let finalQuestions = [];
            Object.keys(typeConfigs).forEach(type => {
                const count = typeConfigs[type];
                const questions = questionsByType[type] || [];
                
                if (questions.length === 0 || count === 0) return;
                
                if (randomOrder) {
                    shuffleArray(questions);
                }
                
                const selectedQuestions = count === -1 ? questions : questions.slice(0, count);
                finalQuestions.push(...selectedQuestions);
            });
            
            if (randomOrder) {
                finalQuestions = shuffleArray(finalQuestions);
            }
            
            if (finalQuestions.length === 0) {
                showLoadError('没有符合条件的题目');
                return;
            }
            
            const typeStats = {};
            finalQuestions.forEach(q => {
                typeStats[q.question_type] = (typeStats[q.question_type] || 0) + 1;
            });
            const title = `自定义组卷 (${finalQuestions.length}题)`;
            
            state.examData = {
                filename: title,
                exam_info: {
                    title: title
                },
                questions: finalQuestions
            };
            
            initExam();
        } catch (error) {
            showLoadError('生成试卷失败：' + error.message);
        }
        return;
    }
    
    // 没有有效参数
    showLoadError('未找到有效的试题参数');
}

function showLoadError(message) {
    const loading = document.getElementById('exam-loading');
    if (loading) {
        loading.innerHTML = `
            <div style="font-size: 48px;">❌</div>
            <div style="margin: 16px 0;">${message}</div>
            <a href="index.html" style="color: #10B981; text-decoration: underline; font-size: 14px;">返回首页</a>
        `;
    }
}

// ==================== 页面初始化 ====================

async function initializeExamApp() {
    // 加载试卷列表（练习模式和自定义组卷需要）
    try {
        await loadExamList();
    } catch (error) {
        console.error('加载试卷列表失败:', error);
    }
    
    // 初始化侧边栏
    document.getElementById('question-nav').innerHTML = '';
    document.getElementById('answered-count').textContent = '0';
    document.getElementById('total-count').textContent = '0';
    
    // 移动端菜单控制
    document.getElementById('mobile-menu-btn').addEventListener('click', toggleMobileSidebar);
    document.getElementById('mobile-overlay').addEventListener('click', closeMobileSidebar);
    
    document.addEventListener('click', function(e) {
        if (e.target.closest('.question-nav-item') && window.innerWidth <= 768) {
            setTimeout(closeMobileSidebar, 300);
        }
    });
    
    window.addEventListener('resize', function() {
        updateMobileMenuVisibility();
        if (window.innerWidth > 768) {
            closeMobileSidebar();
        }
    });
    
    // 提交和查看按钮
    document.getElementById('submit-btn').addEventListener('click', handleSubmit);
    document.getElementById('review-btn').addEventListener('click', handleReview);
    document.getElementById('restart-btn').addEventListener('click', restartExam);
    document.getElementById('restart-result-btn').addEventListener('click', restartExam);
    
    // 设置对话框
    document.getElementById('exam-settings-btn')?.addEventListener('click', showSettings);
    document.getElementById('close-settings').addEventListener('click', closeSettings);
    document.getElementById('cancel-settings').addEventListener('click', closeSettings);
    document.getElementById('save-settings').addEventListener('click', saveSettings);
    document.getElementById('settings-modal').addEventListener('click', function(e) {
        if (e.target === this) closeSettings();
    });
    document.getElementById('test-api-btn').addEventListener('click', testApiConnection);
    
    // 初始化 AI 聊天面板
    initAiChat();
    
    // 处理 URL 参数并加载试卷
    handleURLParams();
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        await initChatDB().catch(err => console.error('IndexedDB 初始化失败:', err));
        initializeExamApp();
    });
} else {
    (async () => {
        await initChatDB().catch(err => console.error('IndexedDB 初始化失败:', err));
        initializeExamApp();
    })();
}
