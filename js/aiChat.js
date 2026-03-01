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

// AI 聊天状态
let currentAiQuestion = null;
let currentAiQuestionIndex = null;

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

// ==================== AI 聊天面板控制 ====================

export function openAiChatPanel(question, questionIndex) {
    const panel = document.getElementById('aiChatPanel');
    const subtitle = document.getElementById('aiSubtitle');
    const messagesContainer = document.getElementById('aiChatMessages');
    
    currentAiQuestion = question;
    currentAiQuestionIndex = questionIndex;
    
    // 更新副标题
    subtitle.textContent = `第 ${questionIndex + 1} 题 - ${question.question_type}`;
    
    // 清空聊天框内容
    messagesContainer.innerHTML = '';
    
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

// ==================== 消息管理 ====================

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
    
    return indicator;
}

// 为流式输出完成后的消息 div 补上操作按钮（复制 & 重新生成）
function addActionButtonsToMessage(messageDiv, content) {
    if (!messageDiv || !content) return;
    // 避免重复添加
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

// ==================== AI 流式输出 ====================

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

    // 根据题目类型使用不同的模板
    let prompt;
    if (question.options) {
        // 选择题
        const template = getChoicePromptTemplate();
        prompt = replacePromptTemplate(template, {
            content: question.content,
            options: optionsText,
            answer: referenceAnswerText,
            userAnswer: userAnswerText
        });
    } else {
        // 主观题
        const template = getSubjectivePromptTemplate();
        prompt = replacePromptTemplate(template, {
            content: question.content,
            answer: referenceAnswerText,
            userAnswer: userAnswerText
        });
    }

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
    const RENDER_THROTTLE = 150;

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
                            renderMarkdownWithVditor(contentEl, fullText);
                        } catch (renderError) {
                            console.error('渲染错误:', renderError);
                            contentEl.textContent = fullText;
                        }
                        lastRenderTime = now;
                        
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

// ==================== AI 解析发送 ====================

async function sendAiExplanation(question, questionIndex) {
    const userAnswer = state.userAnswers[questionIndex];
    
    const contentDiv = showAiTypingIndicator();
    
    try {
        let fullText = '';
        
        await generateAiExplanationStream(question, userAnswer, contentDiv, (text) => {
            fullText = text;
        });
        
        const messageDiv = hideAiTypingIndicator();
        addActionButtonsToMessage(messageDiv, fullText);
        
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
        
        const messageDiv = hideAiTypingIndicator();
        addActionButtonsToMessage(messageDiv, fullText);
        
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

// ==================== 消息操作：复制和重新生成 ====================

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

async function retryAiMessage(button) {
    const messageDiv = button.closest('.ai-message');
    const messagesContainer = document.getElementById('aiChatMessages');
    const messages = Array.from(messagesContainer.querySelectorAll('.ai-message'));
    const messageIndex = messages.indexOf(messageDiv);
    
    // 特殊处理：如果是第一条消息（初次解析），直接重新调用 sendAiExplanation
    if (messageIndex === 0) {
        const messagesInCache = state.aiExplainDetails[currentAiQuestionIndex]?.messages || [];
        
        // 如果缓存中只有一条 assistant 消息，说明是初次解析
        if (messagesInCache.length === 1 && messagesInCache[0].role === 'assistant') {
            // 删除这条消息
            messageDiv.remove();
            messagesInCache.length = 0;
            
            // 重新生成
            await sendAiExplanation(currentAiQuestion, currentAiQuestionIndex);
            return;
        }
    }
    
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
    const cacheIndexToRemove = messageIndex - 1;
    if (cacheIndexToRemove >= 0 && cacheIndexToRemove < messagesInCache.length) {
        messagesInCache.splice(cacheIndexToRemove, messagesInCache.length - cacheIndexToRemove);
    }
    
    const lastUserMessage = messagesInCache[messagesInCache.length - 1];
    if (lastUserMessage && lastUserMessage.role === 'user') {
        const contentDiv = showAiTypingIndicator();
        
        try {
            const apiKey = getApiKey();
            if (!apiKey) throw new Error('未设置 API Key');
            
            const apiUrl = getApiUrl();
            const apiModel = getApiModel();
            
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

// ==================== 初始化 AI 聊天面板事件 ====================

export function initAiChat() {
    // 关闭面板按钮
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
                const deletedCount = await clearAllChatRecords(state.examData);
                
                state.aiExplainDetails = {};
                
                const aiPanel = document.getElementById('aiChatPanel');
                if (aiPanel && !aiPanel.classList.contains('collapsed')) {
                    aiPanel.classList.add('collapsed');
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
