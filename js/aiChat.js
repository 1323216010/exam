// AI 聊天侧边栏功能模块
import { state } from './state.js';
import { getApiKey, getApiUrl, getApiModel, getChoicePromptTemplate, getSubjectivePromptTemplate } from './api.js';
import { saveChatRecord, clearAllChatRecords } from './aiChatStorage.js';

// ==================== 模板替换引擎 ====================

function replacePromptTemplate(template, variables) {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
        const placeholder = `{${key}}`;
        result = result.split(placeholder).join(value || '');
    }
    return result;
}

// ==================== 状态变量 ====================

let isResizing = false;
let lastAiPanelWidth = 450;
let aiAutoScrollEnabled = true;
const AUTO_SCROLL_BOTTOM_THRESHOLD = 24;

// 思考模式 & 图片上传
let aiThinkingEnabled = false;
let uploadedAiImages = []; // [{name, data, type}]

// AI 聊天状态
let currentAiQuestion = null;
let currentAiQuestionIndex = null;

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

// ==================== 同步面板状态 ====================

function syncAiPanelEdgeState() {
    const panel = document.getElementById('aiChatPanel');
    const edge = document.getElementById('aiPanelEdge');
    if (!edge || !panel) return;
    edge.classList.toggle('ai-panel-edge-open', !panel.classList.contains('collapsed'));
}

// ==================== Markdown 渲染 ====================

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
        maybeScrollAiMessagesToBottom();
    }).catch(err => {
        console.error('Markdown 渲染错误:', err);
        targetElement.textContent = markdownText || '';
    });
}

// 兼容 \[ \] 和 \( \) 公式分隔符
function normalizeMathDelimiters(text) {
    if (!text) return text;
    text = text.replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_, expr) => `$$${expr}$$`);
    text = text.replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_, expr) => `$${expr}$`);
    return text;
}

function isNearBottom(container) {
    if (!container) return true;
    return container.scrollHeight - container.scrollTop - container.clientHeight <= AUTO_SCROLL_BOTTOM_THRESHOLD;
}

function maybeScrollAiMessagesToBottom(force = false) {
    const messagesContainer = document.getElementById('aiChatMessages');
    if (!messagesContainer) return;
    if (force || aiAutoScrollEnabled) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        if (force) aiAutoScrollEnabled = true;
    }
}

function updateAiAutoScrollState() {
    const messagesContainer = document.getElementById('aiChatMessages');
    aiAutoScrollEnabled = isNearBottom(messagesContainer);
}

// ==================== AI 聊天面板控制 ====================

export function openAiChatPanel(question, questionIndex) {
    const panel = document.getElementById('aiChatPanel');
    const subtitle = document.getElementById('aiSubtitle');
    const messagesContainer = document.getElementById('aiChatMessages');

    currentAiQuestion = question;
    currentAiQuestionIndex = questionIndex;

    subtitle.textContent = `第 ${questionIndex + 1} 题 - ${question.question_type}`;
    messagesContainer.innerHTML = '';

    panel.classList.remove('collapsed');
    syncAiPanelEdgeState();

    const existing = state.aiExplainDetails[questionIndex];
    if (!existing?.content) {
        setTimeout(() => {
            sendAiExplanation(question, questionIndex);
        }, 300);
    } else {
        displayCachedConversation(questionIndex);
    }

    maybeScrollAiMessagesToBottom(true);
}

function displayCachedConversation(questionIndex) {
    const messagesContainer = document.getElementById('aiChatMessages');
    const existing = state.aiExplainDetails[questionIndex];
    if (!existing?.messages) return;

    messagesContainer.innerHTML = '';
    existing.messages.forEach(msg => {
        addAiMessage(msg.role, msg.content, msg.role === 'assistant');
    });
    document.getElementById('aiChatSendBtn').disabled = false;
    maybeScrollAiMessagesToBottom(true);
}

// ==================== 消息渲染 ====================

function addAiMessage(role, content, isMarkdown = false, images = []) {
    const messagesContainer = document.getElementById('aiChatMessages');

    const welcome = messagesContainer.querySelector('.ai-welcome');
    if (welcome) welcome.remove();

    const messageDiv = document.createElement('div');
    messageDiv.className = `ai-message ${role}`;

    // 用户消息：先显示图片
    if (role === 'user' && images && images.length > 0) {
        const imagesContainer = document.createElement('div');
        imagesContainer.className = 'ai-message-images';
        images.forEach(img => {
            const imgEl = document.createElement('img');
            imgEl.src = img.data;
            imgEl.className = 'ai-message-image';
            imgEl.addEventListener('click', () => showAiImageOverlay(img.data));
            imagesContainer.appendChild(imgEl);
        });
        messageDiv.appendChild(imagesContainer);
    }

    const contentDiv = document.createElement('div');
    contentDiv.className = 'ai-message-content';

    if (role === 'assistant') {
        // DeepSeek 风格：无气泡，全宽透明，使用 message-text 子元素
        const textDiv = document.createElement('div');
        textDiv.className = 'message-text';
        if (isMarkdown && content) {
            renderMarkdownWithVditor(textDiv, content);
        } else if (content) {
            textDiv.textContent = content;
        }
        contentDiv.appendChild(textDiv);
    } else {
        // 用户消息：灰色圆角气泡（CSS 控制）
        if (content) contentDiv.textContent = content;
    }

    messageDiv.appendChild(contentDiv);

    // 助手消息：添加操作按钮（半透明，hover 显示）
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
        messageDiv.dataset.content = content;
    }

    messagesContainer.appendChild(messageDiv);
    maybeScrollAiMessagesToBottom();

    return contentDiv;
}

// 打字指示器
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
    maybeScrollAiMessagesToBottom();
}

function hideAiTypingIndicator() {
    const indicator = document.getElementById('aiTypingIndicator');
    if (indicator) indicator.remove();
}

// 为流式输出完成的消息添加操作按钮
function addActionButtonsToMessage(messageDiv, content) {
    if (!messageDiv || !content) return;
    if (messageDiv.querySelector('.ai-message-actions')) return;

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
    messageDiv.dataset.content = content;
}

// ==================== 思考模式 ====================

function toggleAiThinking() {
    aiThinkingEnabled = !aiThinkingEnabled;
    const btn = document.getElementById('aiThinkingBtn');
    if (btn) btn.classList.toggle('active', aiThinkingEnabled);
}

// ==================== 图片上传 ====================

function handleAiImageSelect(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    handleAiImageFiles(Array.from(files));
    event.target.value = '';
}

function handleAiImageFiles(files) {
    for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        const reader = new FileReader();
        reader.onload = (e) => {
            uploadedAiImages.push({ name: file.name, data: e.target.result, type: file.type });
            updateAiImagePreview();
        };
        reader.readAsDataURL(file);
    }
}

function updateAiImagePreview() {
    const container = document.getElementById('aiImagePreviewContainer');
    const sendBtn = document.getElementById('aiChatSendBtn');
    const input = document.getElementById('aiChatInput');
    if (!container) return;

    if (uploadedAiImages.length === 0) {
        container.style.display = 'none';
        container.innerHTML = '';
    } else {
        container.style.display = 'flex';
        container.innerHTML = uploadedAiImages.map((img, i) => `
            <div class="ai-image-preview">
                <img src="${img.data}" alt="${img.name}">
                <button class="ai-image-preview-remove" data-index="${i}" title="删除">&#215;</button>
            </div>
        `).join('');
        container.querySelectorAll('.ai-image-preview-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                uploadedAiImages.splice(parseInt(btn.dataset.index), 1);
                updateAiImagePreview();
            });
        });
    }
    if (sendBtn) {
        sendBtn.disabled = !input?.value.trim() && uploadedAiImages.length === 0;
    }
}

function showAiImageOverlay(src) {
    let overlay = document.getElementById('aiImageOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'ai-image-overlay';
        overlay.id = 'aiImageOverlay';
        const img = document.createElement('img');
        img.alt = 'preview';
        overlay.appendChild(img);
        overlay.addEventListener('click', () => overlay.classList.remove('active'));
        document.body.appendChild(overlay);
    }
    const img = overlay.querySelector('img');
    if (img) img.src = src;
    overlay.classList.add('active');
}

// ==================== Reasoning Block ====================

function createReasoningBlock() {
    const details = document.createElement('details');
    details.className = 'ai-reasoning-block is-streaming';
    details.open = true;
    details.innerHTML = `
        <summary class="ai-reasoning-header">
            <svg class="ai-reasoning-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
            <span class="ai-reasoning-summary-text">思考中<span class="ai-reasoning-dots"><span></span><span></span><span></span></span></span>
        </summary>
        <div class="ai-reasoning-body">
            <pre class="ai-reasoning-text"></pre>
        </div>`;
    return details;
}

function finishReasoningBlock(messageDiv, fullReasoning) {
    if (!messageDiv) return;
    const block = messageDiv.querySelector('.ai-reasoning-block');
    if (!block) return;
    block.classList.remove('is-streaming');
    block.open = false;
    const summaryText = block.querySelector('.ai-reasoning-summary-text');
    if (summaryText) summaryText.innerHTML = `已深度思考（共 ${fullReasoning.length} 字）`;
}

// 隐藏打字指示器，创建 assistant 消息结构并插入列表
function startAssistantMessage(withReasoning) {
    hideAiTypingIndicator();
    const messagesContainer = document.getElementById('aiChatMessages');

    const messageDiv = document.createElement('div');
    messageDiv.className = 'ai-message assistant';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'ai-message-content';

    let reasoningTextEl = null;
    if (withReasoning) {
        const details = createReasoningBlock();
        reasoningTextEl = details.querySelector('.ai-reasoning-text');
        contentDiv.appendChild(details);
    }

    const textEl = document.createElement('div');
    textEl.className = 'message-text';
    contentDiv.appendChild(textEl);

    messageDiv.appendChild(contentDiv);
    messagesContainer.appendChild(messageDiv);
    maybeScrollAiMessagesToBottom();

    return { messageDiv, textEl, reasoningTextEl };
}

// ==================== 统一 API 请求 ====================

async function callChatAPI(apiMessages) {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('未设置 API Key');

    const response = await fetch(getApiUrl(), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: getApiModel(),
            messages: apiMessages,
            temperature: 0.3,
            stream: true,
            enable_thinking: aiThinkingEnabled
        })
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`API 返回错误: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`);
    }
    return response;
}

async function readStreamInto(response, textEl, reasoningTextEl) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullText = '';
    let fullReasoning = '';
    let lastRenderTime = 0;
    const RENDER_THROTTLE = 150;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(l => l.trim().startsWith('data:'));

        for (const line of lines) {
            const data = line.replace(/^data:\s*/, '').trim();
            if (data === '[DONE]' || !data) continue;

            try {
                const parsed = JSON.parse(data);
                const delta = parsed?.choices?.[0]?.delta;
                const reasoning = delta?.reasoning_content ?? delta?.reasoning ?? null;
                const content = delta?.content ?? null;

                if (reasoning && reasoningTextEl) {
                    fullReasoning += reasoning;
                    reasoningTextEl.textContent = fullReasoning;
                    reasoningTextEl.scrollTop = reasoningTextEl.scrollHeight;
                }

                if (content) {
                    fullText += content;
                    const now = Date.now();
                    if (now - lastRenderTime > RENDER_THROTTLE) {
                        try {
                            renderMarkdownWithVditor(textEl, fullText);
                        } catch (e) {
                            textEl.textContent = fullText;
                        }
                        lastRenderTime = now;
                        maybeScrollAiMessagesToBottom();
                    }
                }
            } catch (e) {
                console.warn('解析流式数据失败:', e);
            }
        }
    }

    if (fullText) {
        try {
            renderMarkdownWithVditor(textEl, fullText);
        } catch (e) {
            textEl.textContent = fullText;
        }
        maybeScrollAiMessagesToBottom();
    }

    if (!fullText) throw new Error('API 未返回任何内容');
    return { fullText: fullText.trim(), fullReasoning };
}

// ==================== AI 解析发送（自动解析题目） ====================

async function sendAiExplanation(question, questionIndex) {
    const userAnswer = state.userAnswers[questionIndex];
    const optionsText = question.options
        ? Object.entries(question.options).map(([k, v]) => `${k}. ${v}`).join('\n')
        : '';
    const userAnswerText = userAnswer
        ? (Array.isArray(userAnswer) ? userAnswer.join(', ') : userAnswer)
        : '未作答';
    const referenceAnswerText = question.answer || '未提供参考答案';

    let prompt;
    if (question.options) {
        const template = getChoicePromptTemplate();
        prompt = replacePromptTemplate(template, {
            content: question.content,
            options: optionsText,
            answer: referenceAnswerText,
            userAnswer: userAnswerText
        });
    } else {
        const template = getSubjectivePromptTemplate();
        prompt = replacePromptTemplate(template, {
            content: question.content,
            answer: referenceAnswerText,
            userAnswer: userAnswerText
        });
    }

    const apiMessages = [
        { role: 'system', content: '你是专业的考试解析老师，输出清晰、简洁的解析，可以使用 Markdown 格式化输出。' },
        { role: 'user', content: prompt }
    ];

    showAiTypingIndicator();
    try {
        const response = await callChatAPI(apiMessages);
        const { messageDiv, textEl, reasoningTextEl } = startAssistantMessage(aiThinkingEnabled);
        const { fullText, fullReasoning } = await readStreamInto(response, textEl, reasoningTextEl);
        finishReasoningBlock(messageDiv, fullReasoning);
        try { renderMarkdownWithVditor(textEl, fullText); } catch (e) { textEl.textContent = fullText; }
        addActionButtonsToMessage(messageDiv, fullText);

        if (!state.aiExplainDetails[questionIndex]) {
            state.aiExplainDetails[questionIndex] = { messages: [] };
        }
        state.aiExplainDetails[questionIndex].content = fullText;
        state.aiExplainDetails[questionIndex].messages = [{ role: 'assistant', content: fullText }];

        try {
            await saveChatRecord(state.examData, questionIndex,
                state.aiExplainDetails[questionIndex].messages, fullText);
        } catch (error) {
            console.error('保存聊天记录失败:', error);
        }

        document.getElementById('aiChatSendBtn').disabled = false;
    } catch (error) {
        hideAiTypingIndicator();
        addAiMessage('assistant', `解析失败：${error.message}`, false);
    }
}

// ==================== AI 用户追问 ====================

async function sendAiChatMessage() {
    const input = document.getElementById('aiChatInput');
    const sendBtn = document.getElementById('aiChatSendBtn');
    const userMessage = input.value.trim();

    if (!userMessage && uploadedAiImages.length === 0) return;
    if (!currentAiQuestion) return;

    // 构建用户消息内容（支持多模态）
    const images = [...uploadedAiImages];
    let messageContent;
    if (images.length > 0) {
        messageContent = [];
        if (userMessage) messageContent.push({ type: 'text', text: userMessage });
        images.forEach(img => messageContent.push({ type: 'image_url', image_url: { url: img.data } }));
    } else {
        messageContent = userMessage;
    }

    addAiMessage('user', userMessage, false, images);

    if (!state.aiExplainDetails[currentAiQuestionIndex]) {
        state.aiExplainDetails[currentAiQuestionIndex] = { messages: [] };
    }
    state.aiExplainDetails[currentAiQuestionIndex].messages.push({ role: 'user', content: messageContent });

    input.value = '';
    input.style.height = 'auto';
    sendBtn.disabled = true;
    uploadedAiImages = [];
    updateAiImagePreview();

    showAiTypingIndicator();
    try {
        const cache = state.aiExplainDetails[currentAiQuestionIndex].messages;
        const apiMessages = [
            { role: 'system', content: '你是专业的考试解析老师，可以回答关于题目的各种问题，使用 Markdown 格式化输出。' },
            ...cache.map(m => ({ role: m.role, content: m.content }))
        ];

        const response = await callChatAPI(apiMessages);
        const { messageDiv, textEl, reasoningTextEl } = startAssistantMessage(aiThinkingEnabled);
        const { fullText, fullReasoning } = await readStreamInto(response, textEl, reasoningTextEl);
        finishReasoningBlock(messageDiv, fullReasoning);
        try { renderMarkdownWithVditor(textEl, fullText); } catch (e) { textEl.textContent = fullText; }
        addActionButtonsToMessage(messageDiv, fullText);

        cache.push({ role: 'assistant', content: fullText });

        try {
            await saveChatRecord(state.examData, currentAiQuestionIndex, cache, fullText);
        } catch (error) {
            console.error('保存聊天记录失败:', error);
        }
    } catch (error) {
        hideAiTypingIndicator();
        addAiMessage('assistant', `发送失败：${error.message}`, false);
    } finally {
        sendBtn.disabled = !input.value.trim() && uploadedAiImages.length === 0;
    }
}

// ==================== 消息操作：复制和重新生成 ====================

function copyAiMessage(button) {
    const messageDiv = button.closest('.ai-message');
    const content = messageDiv ? messageDiv.dataset.content : null;
    if (!content) {
        alert('没有可复制的内容');
        return;
    }
    copyToClipboard(content).then(() => {
        const svg = button.querySelector('svg');
        if (!svg) return;
        const originalHTML = svg.outerHTML;
        svg.outerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        button.classList.add('success');
        button.title = '已复制';
        setTimeout(() => {
            const currentSvg = button.querySelector('svg');
            if (currentSvg) currentSvg.outerHTML = originalHTML;
            button.classList.remove('success');
            button.title = '复制回复';
        }, 2000);
    }).catch(err => {
        alert('复制失败: ' + err.message);
    });
}

function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            const ok = document.execCommand('copy');
            document.body.removeChild(textArea);
            if (ok) resolve();
            else reject(new Error('复制失败'));
        } catch (err) {
            document.body.removeChild(textArea);
            reject(err);
        }
    });
}

async function retryAiMessage(button) {
    const messageDiv = button.closest('.ai-message');
    const messagesContainer = document.getElementById('aiChatMessages');
    const messages = Array.from(messagesContainer.querySelectorAll('.ai-message'));
    const messageIndex = messages.indexOf(messageDiv);

    // 第一条消息（初次解析）
    if (messageIndex === 0) {
        const cache = state.aiExplainDetails[currentAiQuestionIndex]?.messages || [];
        if (cache.length === 1 && cache[0].role === 'assistant') {
            messageDiv.remove();
            cache.length = 0;
            await sendAiExplanation(currentAiQuestion, currentAiQuestionIndex);
            return;
        }
    }

    const userMessageDiv = messages[messageIndex - 1];
    if (!userMessageDiv?.classList.contains('user')) {
        alert('找不到对应的用户消息');
        return;
    }

    // 删除此 AI 消息及之后的所有消息
    for (let i = messages.length - 1; i >= messageIndex; i--) {
        messages[i].remove();
    }

    // 从缓存中删除对应消息
    const cache = state.aiExplainDetails[currentAiQuestionIndex]?.messages || [];
    const cacheIdx = messageIndex - 1;
    if (cacheIdx >= 0 && cacheIdx < cache.length) {
        cache.splice(cacheIdx);
    }

    const lastUserMsg = cache[cache.length - 1];
    if (!lastUserMsg || lastUserMsg.role !== 'user') {
        alert('无法找到用户消息内容');
        return;
    }

    showAiTypingIndicator();
    try {
        const apiMessages = [
            { role: 'system', content: '你是专业的考试解析老师，可以回答关于题目的各种问题，使用 Markdown 格式化输出。' },
            ...cache.map(m => ({ role: m.role, content: m.content }))
        ];
        const response = await callChatAPI(apiMessages);
        const { messageDiv: newDiv, textEl, reasoningTextEl } = startAssistantMessage(aiThinkingEnabled);
        const { fullText, fullReasoning } = await readStreamInto(response, textEl, reasoningTextEl);
        finishReasoningBlock(newDiv, fullReasoning);
        try { renderMarkdownWithVditor(textEl, fullText); } catch (e) { textEl.textContent = fullText; }
        addActionButtonsToMessage(newDiv, fullText);
        cache.push({ role: 'assistant', content: fullText });
        await saveChatRecord(state.examData, currentAiQuestionIndex, cache, fullText);
    } catch (error) {
        hideAiTypingIndicator();
        addAiMessage('assistant', `重新生成失败：${error.message}`, false);
    }
}

// ==================== 初始化 AI 聊天面板事件 ====================

export function initAiChat() {
    // 关闭面板按钮
    document.getElementById('closeAiPanel')?.addEventListener('click', () => {
        document.getElementById('aiChatPanel').classList.add('collapsed');
        syncAiPanelEdgeState();
    });

    // AI 面板折叠边按钮
    document.getElementById('aiPanelToggleBtn')?.addEventListener('click', () => {
        const panel = document.getElementById('aiChatPanel');
        if (!panel.classList.contains('collapsed')) {
            panel.classList.add('collapsed');
            syncAiPanelEdgeState();
        } else if (currentAiQuestion !== null && currentAiQuestionIndex !== null) {
            openAiChatPanel(currentAiQuestion, currentAiQuestionIndex);
        } else {
            panel.classList.remove('collapsed');
            syncAiPanelEdgeState();
        }
    });

    // AI 消息操作按钮事件委托
    const aiMessagesEl = document.getElementById('aiChatMessages');
    aiMessagesEl?.addEventListener('click', (e) => {
        const copyBtn = e.target.closest('.ai-copy-btn');
        const retryBtn = e.target.closest('.ai-retry-btn');
        if (copyBtn) copyAiMessage(copyBtn);
        else if (retryBtn) retryAiMessage(retryBtn);
    });

    // 用户上滑后暂停自动滚动；回到底部后恢复
    aiMessagesEl?.addEventListener('scroll', updateAiAutoScrollState);

    // 思考模式切换
    document.getElementById('aiThinkingBtn')?.addEventListener('click', toggleAiThinking);

    // 图片上传
    document.getElementById('aiImageInput')?.addEventListener('change', handleAiImageSelect);

    // 拖拽上传图片
    const inputBox = document.querySelector('.ai-input-box');
    if (inputBox) {
        inputBox.addEventListener('dragover', (e) => {
            e.preventDefault();
            inputBox.classList.add('drag-over');
        });
        inputBox.addEventListener('dragleave', () => inputBox.classList.remove('drag-over'));
        inputBox.addEventListener('drop', (e) => {
            e.preventDefault();
            inputBox.classList.remove('drag-over');
            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
                handleAiImageFiles(Array.from(files).filter(f => f.type.startsWith('image/')));
            }
        });
    }

    // AI 面板宽度调节（拖拽分隔条）
    const layoutResizer = document.querySelector('.layout-resizer');
    const aiPanel = document.getElementById('aiChatPanel');

    if (layoutResizer && aiPanel) {
        const savedWidth = localStorage.getItem('aiPanelWidth');
        if (savedWidth) {
            lastAiPanelWidth = parseInt(savedWidth);
            document.documentElement.style.setProperty('--ai-panel-width', `${lastAiPanelWidth}px`);
        }

        layoutResizer.addEventListener('mousedown', (e) => {
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
            const containerWidth = document.documentElement.clientWidth;
            const newWidth = containerWidth - e.clientX;
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
                localStorage.setItem('aiPanelWidth', lastAiPanelWidth);
            }
        });
    }

    // AI 聊天输入框
    const aiChatInput = document.getElementById('aiChatInput');
    const aiChatSendBtn = document.getElementById('aiChatSendBtn');

    if (aiChatInput) {
        aiChatInput.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 200) + 'px';
            if (aiChatSendBtn) {
                aiChatSendBtn.disabled = !this.value.trim() && uploadedAiImages.length === 0;
            }
        });

        aiChatInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (this.value.trim() || uploadedAiImages.length > 0) {
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
                const deletedCount = await clearAllChatRecords(state.examData);
                state.aiExplainDetails = {};

                const panel = document.getElementById('aiChatPanel');
                if (panel && !panel.classList.contains('collapsed')) {
                    panel.classList.add('collapsed');
                    syncAiPanelEdgeState();
                }
                document.getElementById('aiChatMessages').innerHTML = '';
                alert(`成功清空 ${deletedCount} 条聊天记录`);
            } catch (error) {
                console.error('清空聊天记录失败:', error);
                alert('清空失败：' + error.message);
            }
        });
    }
}
