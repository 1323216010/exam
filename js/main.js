// 导入模块
import { state, resetState } from './state.js';
import { EXAM_LIST, loadExamList } from './config.js';
import { getApiKey, saveApiKey, getApiUrl, saveApiUrl, getApiModel, saveApiModel, DEFAULT_API_URL, DEFAULT_API_MODEL } from './api.js';
import { shuffleArray, Timer } from './utils.js';
import { initChatDB, saveChatRecord, loadChatRecord, loadAllChatRecords, clearAllChatRecords } from './aiChatStorage.js';

// 计时器实例
let timer = null;

// AI 面板宽度调节相关
let isResizing = false;
let lastAiPanelWidth = 450;

// Vditor 配置（与 chat_embed 保持一致）
let vditorRenderToken = 0;
const vditorOptions = {
    mode: 'light',
    cdn: 'https://cdn.jsdelivr.net/npm/vditor@3.10.7',
    markdown: {
        toc: false,
        mark: true,
        footnotes: true,
        autoSpace: true
    },
    math: {
        engine: 'KaTeX',
        inlineDigit: true,
        macros: {}
    },
    theme: {
        current: 'light',
        path: 'https://cdn.jsdelivr.net/npm/vditor@3.10.7/dist/css/content-theme'
    },
    hljs: {
        style: 'github',
        enable: true
    },
    speech: {
        enable: false
    }
};

function renderMarkdownWithVditor(targetElement, markdownText) {
    if (!targetElement) return;
    if (typeof Vditor === 'undefined' || !Vditor.preview) {
        console.error('Vditor 未加载，降级为纯文本');
        targetElement.textContent = markdownText || '';
        return;
    }

    const normalized = normalizeMathDelimiters(markdownText || '');
    const renderId = ++vditorRenderToken;
    Vditor.preview(targetElement, normalized, vditorOptions).then(() => {
        targetElement.dataset.renderId = String(renderId);
    }).catch(err => {
        console.error('Markdown 渲染错误:', err);
        targetElement.textContent = markdownText || '';
    });
}

// 兼容 \[ \] 和 \( \) 公式分隔符，将其转换为 KaTeX/Vditor 更友好的 $$ 与 $
function normalizeMathDelimiters(text) {
    if (!text) return text;
    text = text.replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_, expr) => `$$${expr}$$`);
    text = text.replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_, expr) => `$${expr}$`);
    return text;
}

// 从路径中提取文件名（不含扩展名）
function getFilenameFromPath(path) {
    const filename = path.split('/').pop(); // 获取最后一部分
    return filename.replace('.json', ''); // 移除 .json 扩展名
}

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
    const modeSelection = document.getElementById('mode-selection');
    
    // 只在答题界面或结果页面显示菜单按钮
    const shouldShow = !examLayout.classList.contains('hidden') || 
                      resultContainer.classList.contains('show');
    
    if (shouldShow && window.innerWidth <= 768) {
        menuBtn.style.display = 'flex';
    } else {
        menuBtn.style.display = 'none';
    }
    
    // 更新 body 类名用于 CSS 控制
    if (!modeSelection.classList.contains('hidden')) {
        document.body.classList.add('mode-selection-active');
    } else {
        document.body.classList.remove('mode-selection-active');
    }
}

// ==================== 文件上传处理 ====================
function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            state.examData = JSON.parse(event.target.result);
            initExam();
        } catch (error) {
            alert('JSON 文件格式错误：' + error.message);
        }
    };
    reader.readAsText(file);
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

    // 隐藏所有页面，只显示答题界面和侧边栏
    document.getElementById('mode-selection').classList.add('hidden');
    document.getElementById('upload-container').classList.add('hidden');
    document.getElementById('exam-list-container').classList.add('hidden');
    document.getElementById('practice-config-container').classList.add('hidden');
    document.getElementById('custom-exam-container').classList.add('hidden');
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

async function generateAiExplanationStream(question, userAnswer, contentEl, onUpdate) {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error('未设置 API Key');
    }

    const apiUrl = getApiUrl();
    const apiModel = getApiModel();

    const optionsText = question.options
        ? Object.entries(question.options).map(([k, v]) => `${k}. ${v}`).join('\n')
        : '';
    const userAnswerText = userAnswer
        ? (Array.isArray(userAnswer) ? userAnswer.join(', ') : userAnswer)
        : '未作答';
    const referenceAnswerText = question.answer || '未提供参考答案';

    const prompt = `请以简洁清晰的方式给出题目解析，包含：\n1) 正确答案结论\n2) 关键思路/依据\n3) 常见误区（如有）\n\n题目：${question.content}\n\n选项：\n${optionsText}\n\n参考答案：${referenceAnswerText}\n\n我的作答：${userAnswerText}`;

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
                    content: '你是专业的考试解析老师，输出清晰、简洁的解析，可以使用 Markdown 格式化输出。'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.3,
            max_tokens: 800,
            stream: true
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API 返回错误: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullText = '';
    let lastRenderTime = 0;
    const RENDER_THROTTLE = 150; // 限制渲染频率为每150ms一次

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));

        for (const line of lines) {
            const data = line.replace(/^data:\s*/, '').trim();
            if (data === '[DONE]') continue;
            if (!data) continue;

            try {
                const parsed = JSON.parse(data);
                const content = parsed?.choices?.[0]?.delta?.content;
                if (content) {
                    fullText += content;
                    
                    // 节流渲染：只在距离上次渲染超过150ms时才更新
                    const now = Date.now();
                    if (now - lastRenderTime > RENDER_THROTTLE) {
                        try {
                            renderMarkdownWithVditor(contentEl, fullText);
                        } catch (renderError) {
                            console.error('渲染错误:', renderError);
                            contentEl.textContent = fullText;
                        }
                        lastRenderTime = now;
                        
                        // 自动滚动到解析区域
                        contentEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                    
                    if (onUpdate) onUpdate(fullText);
                }
            } catch (e) {
                console.warn('解析流式数据失败:', e, data);
            }
        }
    }

    // 最终渲染完整的 Markdown
    try {
        renderMarkdownWithVditor(contentEl, fullText);
    } catch (renderError) {
        console.error('最终渲染错误:', renderError);
        contentEl.textContent = fullText;
    }

    if (!fullText) {
        throw new Error('API 未返回任何内容');
    }

    return fullText.trim();
}

// ==================== AI 聊天侧边栏 ====================
let currentAiQuestion = null;
let currentAiQuestionIndex = null;

function openAiChatPanel(question, questionIndex) {
    const panel = document.getElementById('aiChatPanel');
    const subtitle = document.getElementById('aiSubtitle');
    const messagesContainer = document.getElementById('aiChatMessages');
    
    currentAiQuestion = question;
    currentAiQuestionIndex = questionIndex;
    
    // 更新副标题
    subtitle.textContent = `第 ${questionIndex + 1} 题 - ${question.question_type}`;
    
    // 清空聊天框内容
    messagesContainer.innerHTML = `
        <div class="ai-welcome">
            <div class="welcome-icon">💡</div>
            <h3>智能解析就绪</h3>
            <p>正在加载解析...</p>
        </div>
    `;
    
    // 打开面板
    panel.classList.remove('collapsed');
    
    // 如果是新题目或者没有缓存，自动发起解析
    const existing = state.aiExplainDetails[questionIndex];
    if (!existing?.content) {
        setTimeout(() => {
            sendAiExplanation(question, questionIndex);
        }, 300);
    } else {
        // 显示缓存的对话历史
        displayCachedConversation(questionIndex);
    }
}

function displayCachedConversation(questionIndex) {
    const messagesContainer = document.getElementById('aiChatMessages');
    const existing = state.aiExplainDetails[questionIndex];
    
    if (!existing?.messages) return;
    
    messagesContainer.innerHTML = '';
    existing.messages.forEach(msg => {
        addAiMessage(msg.role, msg.content, msg.role === 'assistant');
    });
    
    // 启用输入框
    document.getElementById('aiChatSendBtn').disabled = false;
}

function addAiMessage(role, content, isMarkdown = false) {
    const messagesContainer = document.getElementById('aiChatMessages');
    
    // 移除欢迎界面
    const welcome = messagesContainer.querySelector('.ai-welcome');
    if (welcome) welcome.remove();
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `ai-message ${role}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'ai-message-content';
    
    if (role === 'assistant' && isMarkdown) {
        renderMarkdownWithVditor(contentDiv, content);
    } else {
        contentDiv.textContent = content;
    }
    
    messageDiv.appendChild(contentDiv);
    
    // 为 AI 回复添加操作按钮（复制和重新生成）
    if (role === 'assistant' && content) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'ai-message-actions';
        actionsDiv.innerHTML = `
            <button class="ai-action-btn ai-copy-btn" title="复制回复">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
            </button>
            <button class="ai-action-btn ai-retry-btn" title="重新生成">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                </svg>
            </button>
        `;
        messageDiv.appendChild(actionsDiv);
        
        // 存储原始内容用于复制
        messageDiv.dataset.content = content;
    }
    
    messagesContainer.appendChild(messageDiv);
    
    // 滚动到底部
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    return contentDiv;
}

function showAiTypingIndicator() {
    const messagesContainer = document.getElementById('aiChatMessages');
    
    const typingDiv = document.createElement('div');
    typingDiv.className = 'ai-message assistant';
    typingDiv.id = 'aiTypingIndicator';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'ai-message-content';
    contentDiv.innerHTML = `
        <div class="typing-indicator">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
    `;
    
    typingDiv.appendChild(contentDiv);
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    return contentDiv;
}

function hideAiTypingIndicator() {
    const indicator = document.getElementById('aiTypingIndicator');
    if (!indicator) return;
    
    if (indicator.querySelector('.typing-indicator')) {
        indicator.remove();
    } else {
        indicator.removeAttribute('id');
    }
}

async function sendAiExplanation(question, questionIndex) {
    const userAnswer = state.userAnswers[questionIndex];
    
    const contentDiv = showAiTypingIndicator();
    
    try {
        let fullText = '';
        
        await generateAiExplanationStream(question, userAnswer, contentDiv, (text) => {
            fullText = text;
        });
        
        hideAiTypingIndicator();
        
        // 保存到缓存
        if (!state.aiExplainDetails[questionIndex]) {
            state.aiExplainDetails[questionIndex] = { messages: [] };
        }
        state.aiExplainDetails[questionIndex].content = fullText;
        state.aiExplainDetails[questionIndex].messages = [
            { role: 'assistant', content: fullText }
        ];
        
        // 保存到 IndexedDB
        try {
            await saveChatRecord(state.examData, questionIndex, 
                state.aiExplainDetails[questionIndex].messages, fullText);
        } catch (error) {
            console.error('保存聊天记录失败:', error);
        }
        
        // 启用输入框
        document.getElementById('aiChatSendBtn').disabled = false;
        
    } catch (error) {
        hideAiTypingIndicator();
        addAiMessage('assistant', `解析失败：${error.message}`, false);
    }
}

async function sendAiChatMessage() {
    const input = document.getElementById('aiChatInput');
    const sendBtn = document.getElementById('aiChatSendBtn');
    const userMessage = input.value.trim();
    
    if (!userMessage || !currentAiQuestion) return;
    
    // 添加用户消息
    addAiMessage('user', userMessage, false);
    
    // 保存用户消息到缓存
    if (!state.aiExplainDetails[currentAiQuestionIndex].messages) {
        state.aiExplainDetails[currentAiQuestionIndex].messages = [];
    }
    state.aiExplainDetails[currentAiQuestionIndex].messages.push({
        role: 'user',
        content: userMessage
    });
    
    // 清空输入框
    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;
    
    // 显示打字指示器
    const contentDiv = showAiTypingIndicator();
    
    try {
        const apiKey = getApiKey();
        if (!apiKey) {
            throw new Error('未设置 API Key');
        }
        
        const apiUrl = getApiUrl();
        const apiModel = getApiModel();
        
        // 构建对话历史
        const messages = [
            {
                role: 'system',
                content: '你是专业的考试解析老师，可以回答关于题目的各种问题，使用 Markdown 格式化输出。'
            },
            ...state.aiExplainDetails[currentAiQuestionIndex].messages.map(m => ({
                role: m.role,
                content: m.content
            }))
        ];
        
        let fullText = '';
        let lastRenderTime = 0;
        const RENDER_THROTTLE = 150;
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: apiModel,
                messages: messages,
                temperature: 0.3,
                max_tokens: 800,
                stream: true
            })
        });
        
        if (!response.ok) {
            throw new Error(`API 返回错误: ${response.status}`);
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));
            
            for (const line of lines) {
                const data = line.replace(/^data:\s*/, '').trim();
                if (data === '[DONE]') continue;
                if (!data) continue;
                
                try {
                    const parsed = JSON.parse(data);
                    const content = parsed?.choices?.[0]?.delta?.content;
                    if (content) {
                        fullText += content;
                        
                        const now = Date.now();
                        if (now - lastRenderTime > RENDER_THROTTLE) {
                            try {
                                renderMarkdownWithVditor(contentDiv, fullText);
                            } catch (renderError) {
                                contentDiv.textContent = fullText;
                            }
                            lastRenderTime = now;
                        }
                    }
                } catch (e) {
                    console.warn('解析流式数据失败:', e);
                }
            }
        }
        
        // 最终渲染
        try {
            renderMarkdownWithVditor(contentDiv, fullText);
        } catch (renderError) {
            contentDiv.textContent = fullText;
        }
        
        hideAiTypingIndicator();
        
        // 保存 AI 回复到缓存
        state.aiExplainDetails[currentAiQuestionIndex].messages.push({
            role: 'assistant',
            content: fullText
        });
        
        // 保存到 IndexedDB
        try {
            await saveChatRecord(state.examData, currentAiQuestionIndex, 
                state.aiExplainDetails[currentAiQuestionIndex].messages, fullText);
        } catch (error) {
            console.error('保存聊天记录失败:', error);
        }
        
    } catch (error) {
        hideAiTypingIndicator();
        addAiMessage('assistant', `发送失败：${error.message}`, false);
    } finally {
        sendBtn.disabled = false;
    }
}

// ==================== AI 消息操作：复制和重新生成 ====================

// 复制消息内容到剪贴板
function copyAiMessage(button) {
    const messageDiv = button.closest('.ai-message');
    const content = messageDiv.dataset.content;
    
    if (!content) {
        alert('没有可复制的内容');
        return;
    }
    
    copyToClipboard(content).then(() => {
        const svg = button.querySelector('svg');
        const originalSvg = svg.outerHTML;
        
        // 替换为勾选图标
        svg.outerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        button.classList.add('success');
        button.title = '已复制';
        
        setTimeout(() => {
            const btn = button;
            if (btn && btn.querySelector) {
                const currentSvg = btn.querySelector('svg');
                if (currentSvg) currentSvg.outerHTML = originalSvg;
                btn.classList.remove('success');
                btn.title = '复制回复';
            }
        }, 2000);
    }).catch(err => {
        alert('复制失败: ' + err.message);
    });
}

// 兼容性剪贴板复制函数
function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
    }
    
    return new Promise((resolve, reject) => {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.top = '0';
        textArea.style.left = '0';
        textArea.style.opacity = '0';
        
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            if (successful) {
                resolve();
            } else {
                reject(new Error('复制失败'));
            }
        } catch (err) {
            document.body.removeChild(textArea);
            reject(err);
        }
    });
}

// 重新生成 AI 回复
async function retryAiMessage(button) {
    const messageDiv = button.closest('.ai-message');
    const messagesContainer = document.getElementById('aiChatMessages');
    const messages = Array.from(messagesContainer.querySelectorAll('.ai-message'));
    const messageIndex = messages.indexOf(messageDiv);
    
    if (messageIndex === 0) {
        alert('找不到对应的用户消息');
        return;
    }
    
    // 找到对应的用户消息
    const userMessageDiv = messages[messageIndex - 1];
    if (!userMessageDiv || !userMessageDiv.classList.contains('user')) {
        alert('找不到对应的用户消息');
        return;
    }
    
    // 删除这条 AI 消息及之后的所有消息
    for (let i = messages.length - 1; i >= messageIndex; i--) {
        messages[i].remove();
    }
    
    // 从缓存中删除对应的 AI 回复及后续消息
    const messagesInCache = state.aiExplainDetails[currentAiQuestionIndex]?.messages || [];
    const cacheIndexToRemove = messageIndex - 1; // -1 因为第一条是初始解析
    if (cacheIndexToRemove >= 0 && cacheIndexToRemove < messagesInCache.length) {
        messagesInCache.splice(cacheIndexToRemove, messagesInCache.length - cacheIndexToRemove);
    }
    
    // 获取最后一条用户消息
    const lastUserMessage = messagesInCache[messagesInCache.length - 1];
    if (lastUserMessage && lastUserMessage.role === 'user') {
        // 重新发送消息
        const userContent = lastUserMessage.content;
        
        // 显示打字指示器
        const contentDiv = showAiTypingIndicator();
        
        try {
            const apiKey = getApiKey();
            if (!apiKey) throw new Error('未设置 API Key');
            
            const apiUrl = getApiUrl();
            const apiModel = getApiModel();
            
            // 构建对话历史
            const chatMessages = [
                {
                    role: 'system',
                    content: '你是专业的考试解析老师，可以回答关于题目的各种问题，使用 Markdown 格式化输出。'
                },
                ...messagesInCache.map(m => ({
                    role: m.role,
                    content: m.content
                }))
            ];
            
            let fullText = '';
            let lastRenderTime = 0;
            const RENDER_THROTTLE = 150;
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: apiModel,
                    messages: chatMessages,
                    temperature: 0.3,
                    max_tokens: 800,
                    stream: true
                })
            });
            
            if (!response.ok) {
                throw new Error(`API 返回错误: ${response.status}`);
            }
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));
                
                for (const line of lines) {
                    const data = line.replace(/^data:\s*/, '').trim();
                    if (data === '[DONE]') continue;
                    if (!data) continue;
                    
                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed?.choices?.[0]?.delta?.content;
                        if (content) {
                            fullText += content;
                            
                            const now = Date.now();
                            if (now - lastRenderTime > RENDER_THROTTLE) {
                                try {
                                    renderMarkdownWithVditor(contentDiv, fullText);
                                } catch (renderError) {
                                    contentDiv.textContent = fullText;
                                }
                                lastRenderTime = now;
                            }
                        }
                    } catch (e) {
                        console.warn('解析流式数据失败:', e);
                    }
                }
            }
            
            // 最终渲染
            try {
                renderMarkdownWithVditor(contentDiv, fullText);
            } catch (renderError) {
                contentDiv.textContent = fullText;
            }
            
            hideAiTypingIndicator();
            
            // 保存新的 AI 回复
            messagesInCache.push({
                role: 'assistant',
                content: fullText
            });
            
            // 保存到 IndexedDB
            await saveChatRecord(state.examData, currentAiQuestionIndex, 
                messagesInCache, fullText);
                
        } catch (error) {
            hideAiTypingIndicator();
            addAiMessage('assistant', `重新生成失败：${error.message}`, false);
        }
    } else {
        alert('无法找到用户消息内容');
    }
}

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

    // 显示加载提示
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

    // 统计主观题数量
    const subjectiveQuestions = state.examData.questions.filter(q => !q.options);

    // 如果有主观题，显示进度提示
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

    // 对每道题目进行评分
    for (let index = 0; index < state.examData.questions.length; index++) {
        const question = state.examData.questions[index];
        totalScore += question.score || 0;
        const userAnswer = state.userAnswers[index];
        const correctAnswer = question.answer;

        if (correctAnswer) {
            let scoreRatio = 0;

            if (Array.isArray(userAnswer)) {
                // 多选题
                const isCorrect = userAnswer.length === correctAnswer.length && 
                           userAnswer.every(a => correctAnswer.includes(a));
                scoreRatio = isCorrect ? 1 : 0;
                if (isCorrect) objectiveCorrectCount++;
            } else if (typeof userAnswer === 'string') {
                if (question.options) {
                    // 单选题
                    const isCorrect = userAnswer === correctAnswer;
                    scoreRatio = isCorrect ? 1 : 0;
                    if (isCorrect) objectiveCorrectCount++;
                } else {
                    // 主观题
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

    // 移除进度提示
    const progressDiv = document.getElementById('ai-grading-progress');
    if (progressDiv) {
        progressDiv.remove();
    }

    earnedScore = Math.round(earnedScore * 10) / 10;

    // 计算统计数据
    const objectiveCount = state.examData.questions.filter(q => q.options).length;
    const objectiveWrongCount = objectiveCount - objectiveCorrectCount;
    const objectiveAccuracy = objectiveCount > 0 
        ? Math.round((objectiveCorrectCount / objectiveCount) * 100) 
        : 0;
    
    const subjectiveAvgScore = subjectiveCount > 0
        ? Math.round((subjectiveScoreRatioSum / subjectiveCount) * 100)
        : 0;

    // 显示结果
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

    // 更新移动端菜单显示
    updateMobileMenuVisibility();
    closeMobileSidebar();

    // 重新启用提交按钮
    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = false;
    submitBtn.textContent = '提交答卷';
}

async function gradeSubjectiveQuestion(questionContent, referenceAnswer, userAnswer, currentIndex, totalSubjective) {
    // 更新进度
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
        console.log('Testing API:', apiUrl);
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
        
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error:', errorText);
            throw new Error(`API 返回错误: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('API Response:', data);
        
        if (data.choices && data.choices[0] && data.choices[0].message) {
            testResult.style.background = '#ECFDF5';
            testResult.style.color = '#065F46';
            testResult.style.border = '1px solid #6EE7B7';
            testResult.textContent = `✅ 连接成功！AI 回复: ${data.choices[0].message.content.trim()}`;
        } else {
            throw new Error('API 返回格式异常');
        }
    } catch (error) {
        console.error('Test API Error:', error);
        testResult.style.background = '#FEF2F2';
        testResult.style.color = '#991B1B';
        testResult.style.border = '1px solid #FCA5A5';
        testResult.textContent = `❌ 连接失败: ${error.message}`;
    } finally {
        testBtn.disabled = false;
        testBtn.textContent = '🔍 测试连接';
    }
}

// ==================== 模式选择 ====================
function selectMode(mode) {
    state.currentMode = mode;
    
    document.getElementById('mode-selection').classList.add('hidden');
    
    switch(mode) {
        case 'upload':
            document.getElementById('upload-container').classList.remove('hidden');
            break;
        case 'exam-list':
            document.getElementById('exam-list-container').classList.remove('hidden');
            renderExamList();
            break;
        case 'practice':
            document.getElementById('practice-config-container').classList.remove('hidden');
            initPracticeSubjectFilter();
            break;
        case 'custom':
            document.getElementById('custom-exam-container').classList.remove('hidden');
            loadCustomExamUI();
            break;
    }
}

function backToModeSelection() {
    // 隐藏所有页面
    document.getElementById('upload-container').classList.add('hidden');
    document.getElementById('exam-list-container').classList.add('hidden');
    document.getElementById('practice-config-container').classList.add('hidden');
    document.getElementById('custom-exam-container').classList.add('hidden');
    document.getElementById('exam-layout').classList.add('hidden');
    document.getElementById('result-container').classList.remove('show');
    document.getElementById('sidebar').classList.add('hidden');
    
    // 显示模式选择页面
    document.getElementById('mode-selection').classList.remove('hidden');
    
    // 重置状态
    resetState();
    stopTimer();
    
    // 更新移动端菜单显示和关闭侧边栏
    updateMobileMenuVisibility();
    closeMobileSidebar();
    
    // 清空侧边栏
    document.getElementById('question-nav').innerHTML = '';
    document.getElementById('answered-count').textContent = '0';
    document.getElementById('total-count').textContent = '0';
}

// ==================== 试卷列表 ====================
function renderExamList() {
    const grid = document.getElementById('exam-list-grid');
    const examCount = document.getElementById('exam-count');
    const subjectFilter = document.getElementById('subject-filter');
    const searchInput = document.getElementById('exam-search');
    const sortFilter = document.getElementById('sort-filter');
    
    examCount.textContent = EXAM_LIST.length;
    
    // 按科目筛选
    const subjects = [...new Set(EXAM_LIST.map(e => e.subject))].sort();
    subjectFilter.innerHTML = '<option value="">全部科目</option>';
    subjects.forEach(subject => {
        subjectFilter.innerHTML += `<option value="${subject}">${subject}</option>`;
    });
    
    // 绑定筛选事件
    subjectFilter.addEventListener('change', filterExamList);
    sortFilter.addEventListener('change', filterExamList);
    searchInput.addEventListener('input', filterExamList);
    
    // 绑定视图切换
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

function filterExamList() {
    const grid = document.getElementById('exam-list-grid');
    const subjectFilter = document.getElementById('subject-filter').value;
    const searchInput = document.getElementById('exam-search').value.toLowerCase();
    const sortFilter = document.getElementById('sort-filter').value;
    
    let filtered = EXAM_LIST;
    
    // 科目筛选
    if (subjectFilter) {
        filtered = filtered.filter(e => e.subject === subjectFilter);
    }
    
    // 搜索筛选
    if (searchInput) {
        filtered = filtered.filter(e => {
            const filename = getFilenameFromPath(e.path).toLowerCase();
            return filename.includes(searchInput);
        });
    }
    
    // 排序
    filtered.sort((a, b) => {
        const nameA = getFilenameFromPath(a.path);
        const nameB = getFilenameFromPath(b.path);
        
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
    
    filtered.forEach((exam, index) => {
        const card = document.createElement('div');
        card.className = 'exam-card';
        const filename = getFilenameFromPath(exam.path);
        
        card.addEventListener('click', () => {
            const url = `${window.location.pathname}?exam=${encodeURIComponent(exam.path)}&filename=${encodeURIComponent(filename)}`;
            window.open(url, '_blank');
        });
        
        card.innerHTML = `
            <div class="exam-card-header">
                <div class="exam-card-title">${filename}</div>
                <div class="exam-card-meta" data-exam-info>
                    <!-- exam_info 字段将在这里动态生成 -->
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
        
        // 异步加载试卷详情
        loadExamDetails(exam.path, card);
    });
}

// 异步加载试卷详情
async function loadExamDetails(path, card) {
    try {
        const response = await fetch(path);
        if (!response.ok) return;
        
        const data = await response.json();
        const questionCount = data.questions ? data.questions.length : 0;
        
        // 更新题目数量
        const countElement = card.querySelector('[data-question-count] .count-text');
        if (countElement) {
            countElement.textContent = `共 ${questionCount} 题`;
        }
        
        // 动态生成 exam_info 标签
        if (data.exam_info && typeof data.exam_info === 'object') {
            const metaContainer = card.querySelector('[data-exam-info]');
            if (metaContainer) {
                metaContainer.innerHTML = '';
                
                // 预定义常见字段的样式（可选，用于美化显示）
                const fieldStyles = {
                    'code': { bg: 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)', color: '#1E40AF' },
                    'date': { bg: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)', color: '#059669' },
                    'subject': { bg: 'linear-gradient(135deg, #FCE7F3 0%, #FBCFE8 100%)', color: '#BE185D' },
                    'title': { bg: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)', color: '#D97706' },
                };
                
                // 默认样式（用于未预定义的字段）
                const defaultStyle = { 
                    bg: 'linear-gradient(135deg, #F3F4F6 0%, #E5E7EB 100%)', 
                    color: '#4B5563' 
                };
                
                // 颜色数组，用于为不同字段分配不同颜色
                const colorSchemes = [
                    { bg: 'linear-gradient(135deg, #DBEAFE 0%, #BFDBFE 100%)', color: '#1E40AF' },
                    { bg: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)', color: '#059669' },
                    { bg: 'linear-gradient(135deg, #FCE7F3 0%, #FBCFE8 100%)', color: '#BE185D' },
                    { bg: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)', color: '#D97706' },
                    { bg: 'linear-gradient(135deg, #EDE9FE 0%, #DDD6FE 100%)', color: '#7C3AED' },
                ];
                
                // 遍历所有字段并生成标签
                let colorIndex = 0;
                Object.entries(data.exam_info).forEach(([key, value]) => {
                    // 跳过空值
                    if (value == null || value === '') return;
                    
                    // 获取样式（优先使用预定义，否则循环使用颜色数组）
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
        // 加载失败静默处理
        console.error('Failed to load exam details:', error);
    }
}

async function startExam(filePath, filename = null) {
    try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error('无法加载试卷文件');
        
        state.examData = await response.json();
        // 保存 filename
        if (filename) {
            state.examData.filename = filename;
        }
        initExam();
    } catch (error) {
        alert('加载试卷失败：' + error.message);
    }
}

// ==================== 练习模式 ====================
function startPracticeMode() {
    const randomOrder = document.getElementById('random-order').checked;
    const questionLimit = document.getElementById('question-limit').value;
    const subject = document.getElementById('practice-subject-filter').value;
    
    const params = new URLSearchParams();
    params.set('mode', 'practice');
    params.set('random', randomOrder);
    if (questionLimit) params.set('limit', questionLimit);
    if (subject) params.set('subject', subject);
    
    const url = `${window.location.pathname}?${params.toString()}`;
    window.open(url, '_blank');
}

function initPracticeSubjectFilter() {
    const subjectFilter = document.getElementById('practice-subject-filter');
    const subjects = [...new Set(EXAM_LIST.map(e => e.subject))].sort();
    
    subjectFilter.innerHTML = '<option value="">全部科目</option>';
    subjects.forEach(subject => {
        subjectFilter.innerHTML += `<option value="${subject}">${subject}</option>`;
    });
}

async function loadAllQuestions(subjectFilter = null) {
    const allQuestions = [];
    
    for (const exam of EXAM_LIST) {
        // 如果指定了科目筛选，则跳过不匹配的试卷
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

// ==================== 自定义组卷 ====================
function loadCustomExamUI() {
    // 初始化科目筛选器
    const subjectFilter = document.getElementById('custom-subject-filter');
    const subjects = [...new Set(EXAM_LIST.map(e => e.subject))].sort();
    
    subjectFilter.innerHTML = '<option value="">全部科目</option>';
    subjects.forEach(subject => {
        subjectFilter.innerHTML += `<option value="${subject}">${subject}</option>`;
    });
    
    // 绑定筛选事件
    subjectFilter.removeEventListener('change', filterCustomExamList);
    subjectFilter.addEventListener('change', filterCustomExamList);
    
    // 渲染试卷列表
    filterCustomExamList();
    
    loadQuestionTypes();
}

function filterCustomExamList() {
    const checkboxGrid = document.getElementById('exam-checkbox-grid');
    const subjectFilter = document.getElementById('custom-subject-filter').value;
    
    let filtered = EXAM_LIST;
    if (subjectFilter) {
        filtered = filtered.filter(e => e.subject === subjectFilter);
    }
    
    checkboxGrid.innerHTML = '';
    filtered.forEach((exam, index) => {
        // 使用原始索引确保后续操作的一致性
        const originalIndex = EXAM_LIST.indexOf(exam);
        const item = document.createElement('label');
        item.className = 'exam-checkbox-item';
        const filename = getFilenameFromPath(exam.path);
        item.innerHTML = `
            <input type="checkbox" value="${originalIndex}" class="exam-checkbox">
            <span>${filename}</span>
        `;
        checkboxGrid.appendChild(item);
    });
}

async function loadQuestionTypes() {
    try {
        const response = await fetch(EXAM_LIST[0].file);
        const data = await response.json();
        
        const types = [...new Set(data.questions.map(q => q.question_type))];
        const typeFilters = document.getElementById('question-type-filters');
        
        typeFilters.innerHTML = '';
        types.forEach(type => {
            const item = document.createElement('div');
            item.className = 'type-count-item';
            item.innerHTML = `
                <input type="checkbox" value="${type}" class="type-checkbox" checked>
                <span class="type-count-label">${type}</span>
                <input type="number" class="type-count-input" placeholder="全部" min="1" data-type="${type}">
            `;
            typeFilters.appendChild(item);
        });
    } catch (error) {
        console.error('加载题型失败:', error);
    }
}

function selectAllExams() {
    document.querySelectorAll('.exam-checkbox').forEach(cb => cb.checked = true);
}

function selectNoneExams() {
    document.querySelectorAll('.exam-checkbox').forEach(cb => cb.checked = false);
}

function startCustomExam() {
    const selectedIndices = Array.from(document.querySelectorAll('.exam-checkbox:checked'))
        .map(cb => parseInt(cb.value));
    
    if (selectedIndices.length === 0) {
        alert('请至少选择一套试卷');
        return;
    }
    
    // 收集选中的题型和对应的数量
    const typeConfigs = {};
    document.querySelectorAll('.type-checkbox:checked').forEach(cb => {
        const type = cb.value;
        const countInput = document.querySelector(`.type-count-input[data-type="${type}"]`);
        const count = countInput.value ? parseInt(countInput.value) : 0;
        typeConfigs[type] = count;
    });
    
    if (Object.keys(typeConfigs).length === 0) {
        alert('请至少选择一种题型');
        return;
    }
    
    const randomOrder = document.getElementById('custom-random').checked;
    const deduplicate = document.getElementById('custom-deduplicate').checked;
    
    const params = new URLSearchParams();
    params.set('mode', 'custom');
    params.set('exams', selectedIndices.join(','));
    params.set('typeConfig', JSON.stringify(typeConfigs));
    params.set('random', randomOrder);
    params.set('dedup', deduplicate);
    
    const url = `${window.location.pathname}?${params.toString()}`;
    window.open(url, '_blank');
}

// ==================== URL参数处理 ====================
async function handleURLParams() {
    const params = new URLSearchParams(window.location.search);
    
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
                alert('没有可用的题目');
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
            alert('加载题库失败：' + error.message);
            console.error(error);
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
                    console.error(`加载 ${exam.file} 失败:`, error);
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
            
            // 去重处理（如果启用）
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
                
                // 随机打乱该题型的题目
                if (randomOrder) {
                    shuffleArray(questions);
                }
                
                // count 为 -1 时取全部题目，否则取指定数量
                const selectedQuestions = count === -1 ? questions : questions.slice(0, count);
                finalQuestions.push(...selectedQuestions);
            });
            
            // 最后整体打乱（如果启用随机顺序）
            if (randomOrder) {
                finalQuestions = shuffleArray(finalQuestions);
            }
            
            if (finalQuestions.length === 0) {
                alert('没有符合条件的题目');
                return;
            }
            
            // 生成题型统计信息
            const typeStats = {};
            finalQuestions.forEach(q => {
                typeStats[q.question_type] = (typeStats[q.question_type] || 0) + 1;
            });
            const statsText = Object.entries(typeStats)
                .map(([type, count]) => `${type}${count}题`)
                .join('、');
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
            alert('生成试卷失败：' + error.message);
            console.error(error);
        }
        return;
    }
}

// ==================== 页面初始化和事件绑定 ====================
async function initializeApp() {
    // 加载试卷列表
    try {
        await loadExamList();
    } catch (error) {
        console.error('加载试卷列表失败，将使用空列表:', error);
    }
    
    // 设置初始页面状态
    document.getElementById('sidebar').classList.add('hidden');
    document.getElementById('mode-selection').classList.remove('hidden');
    document.getElementById('upload-container').classList.add('hidden');
    document.getElementById('exam-list-container').classList.add('hidden');
    document.getElementById('practice-config-container').classList.add('hidden');
    document.getElementById('custom-exam-container').classList.add('hidden');
    document.getElementById('exam-layout').classList.add('hidden');
    document.getElementById('result-container').classList.remove('show');
    
    // 初始化侧边栏
    document.getElementById('question-nav').innerHTML = '';
    document.getElementById('answered-count').textContent = '0';
    document.getElementById('total-count').textContent = '0';
    
    // 文件上传
    document.getElementById('file-input').addEventListener('change', handleFileUpload);
    
    // 移动端菜单控制
    document.getElementById('mobile-menu-btn').addEventListener('click', toggleMobileSidebar);
    document.getElementById('mobile-overlay').addEventListener('click', closeMobileSidebar);
    
    // 点击题目导航后在移动端自动关闭侧边栏
    document.addEventListener('click', function(e) {
        if (e.target.closest('.question-nav-item') && window.innerWidth <= 768) {
            setTimeout(closeMobileSidebar, 300);
        }
    });
    
    // 窗口大小改变时更新菜单显示
    window.addEventListener('resize', function() {
        updateMobileMenuVisibility();
        if (window.innerWidth > 768) {
            closeMobileSidebar();
        }
    });
    
    // 模式选择
    document.querySelectorAll('.mode-card[data-mode]').forEach(card => {
        card.addEventListener('click', function() {
            selectMode(this.dataset.mode);
        });
    });
    
    // 面包屑导航 - 返回首页
    document.querySelectorAll('[id^="breadcrumb-home-"]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            backToModeSelection();
        });
    });
    
    // 提交和查看按钮
    document.getElementById('submit-btn').addEventListener('click', handleSubmit);
    document.getElementById('review-btn').addEventListener('click', handleReview);
    document.getElementById('restart-btn').addEventListener('click', restartExam);
    document.getElementById('restart-result-btn').addEventListener('click', restartExam);
    
    // 设置对话框
    document.getElementById('settings-btn').addEventListener('click', showSettings);
    document.getElementById('close-settings').addEventListener('click', closeSettings);
    document.getElementById('cancel-settings').addEventListener('click', closeSettings);
    document.getElementById('save-settings').addEventListener('click', saveSettings);
    document.getElementById('settings-modal').addEventListener('click', function(e) {
        if (e.target === this) closeSettings();
    });
    document.getElementById('test-api-btn').addEventListener('click', testApiConnection);
    
    // 试卷列表筛选
    const subjectFilter = document.getElementById('subject-filter');
    if (subjectFilter) subjectFilter.addEventListener('change', filterExamList);
    
    // 练习模式按钮
    const btnStartPractice = document.getElementById('btn-start-practice');
    if (btnStartPractice) {
        btnStartPractice.addEventListener('click', startPracticeMode);
    }
    
    // 自定义组卷按钮
    const btnSelectAll = document.getElementById('btn-select-all');
    const btnSelectNone = document.getElementById('btn-select-none');
    const btnStartCustom = document.getElementById('btn-start-custom');
    
    if (btnSelectAll) btnSelectAll.addEventListener('click', selectAllExams);
    if (btnSelectNone) btnSelectNone.addEventListener('click', selectNoneExams);
    if (btnStartCustom) btnStartCustom.addEventListener('click', startCustomExam);
    
    // AI 聊天面板控制
    document.getElementById('closeAiPanel')?.addEventListener('click', () => {
        document.getElementById('aiChatPanel').classList.add('collapsed');
    });
    
    // AI 消息操作按钮事件委托
    document.getElementById('aiChatMessages')?.addEventListener('click', (e) => {
        const copyBtn = e.target.closest('.ai-copy-btn');
        const retryBtn = e.target.closest('.ai-retry-btn');
        
        if (copyBtn) {
            copyAiMessage(copyBtn);
        } else if (retryBtn) {
            retryAiMessage(retryBtn);
        }
    });
    
    // AI 面板宽度调节
    const layoutResizer = document.querySelector('.layout-resizer');
    const aiPanel = document.getElementById('aiChatPanel');
    
    if (layoutResizer && aiPanel) {
        // 从 localStorage 加载保存的宽度
        const savedWidth = localStorage.getItem('aiPanelWidth');
        if (savedWidth) {
            lastAiPanelWidth = parseInt(savedWidth);
            document.documentElement.style.setProperty('--ai-panel-width', `${lastAiPanelWidth}px`);
        }
        
        layoutResizer.addEventListener('mousedown', (e) => {
            // 如果面板是折叠的，不允许拖拽
            if (aiPanel.classList.contains('collapsed')) return;
            
            isResizing = true;
            document.body.classList.add('resizing');
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';
            aiPanel.classList.add('resizing');
            
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            
            // 计算新的宽度（从右边界往左计算）
            const containerWidth = document.documentElement.clientWidth;
            const newWidth = containerWidth - e.clientX;
            
            // 限制宽度范围: 300px 至 containerWidth - 400px（确保左侧至少有 400px）
            const minWidth = 300;
            const maxWidth = Math.max(containerWidth - 400, minWidth);
            const clampedWidth = Math.min(Math.max(newWidth, minWidth), maxWidth);
            
            lastAiPanelWidth = clampedWidth;
            document.documentElement.style.setProperty('--ai-panel-width', `${clampedWidth}px`);
        });
        
        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                aiPanel.classList.remove('resizing');
                
                // 保存宽度到 localStorage
                localStorage.setItem('aiPanelWidth', lastAiPanelWidth);
            }
        });
    }
    
    // AI 聊天输入框
    const aiChatInput = document.getElementById('aiChatInput');
    const aiChatSendBtn = document.getElementById('aiChatSendBtn');
    
    if (aiChatInput) {
        aiChatInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
            aiChatSendBtn.disabled = !this.value.trim();
        });
        
        aiChatInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (this.value.trim()) {
                    sendAiChatMessage();
                }
            }
        });
    }
    
    if (aiChatSendBtn) {
        aiChatSendBtn.addEventListener('click', sendAiChatMessage);
    }
    
    // 清空 AI 聊天记录
    const clearAiChatsBtn = document.getElementById('clear-ai-chats-btn');
    if (clearAiChatsBtn) {
        clearAiChatsBtn.addEventListener('click', async () => {
            if (!state.examData) {
                alert('请先加载试卷');
                return;
            }
            
            const confirmed = confirm('确定要清空当前试卷的所有 AI 聊天记录吗？此操作不可恢复。');
            if (!confirmed) return;
            
            try {
                // 清空 IndexedDB
                const deletedCount = await clearAllChatRecords(state.examData);
                
                // 清空内存中的记录
                state.aiExplainDetails = {};
                
                // 如果 AI 面板打开，关闭它并清空消息
                const aiPanel = document.getElementById('aiChatPanel');
                if (aiPanel && !aiPanel.classList.contains('collapsed')) {
                    aiPanel.classList.add('collapsed');
                }
                document.getElementById('aiChatMessages').innerHTML = `
                    <div class="ai-welcome">
                        <div class="welcome-icon">💡</div>
                        <h3>智能解析就绪</h3>
                        <p>点击题目下方的"AI 解析"按钮开始分析</p>
                    </div>
                `;
                
                alert(`成功清空 ${deletedCount} 条聊天记录`);
            } catch (error) {
                console.error('清空聊天记录失败:', error);
                alert('清空失败：' + error.message);
            }
        });
    }
    
    // 检查URL参数
    handleURLParams();
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        await initChatDB().catch(err => console.error('IndexedDB 初始化失败:', err));
        initializeApp();
    });
} else {
    (async () => {
        await initChatDB().catch(err => console.error('IndexedDB 初始化失败:', err));
        initializeApp();
    })();
}
