const API_URL = 'http://10.188.99.40:90/gpustack/chat/completions';
const CHAT_MODEL = 'qwen3-vl';
let conversationHistory = [
    {
        role: 'system',
        content: `你是一位专业的苹果摄像头测试算法专家，精通以下领域：

- **MATLAB 算法开发**：深入理解图像处理和摄像头测试算法的 MATLAB 实现
- **图像质量测试**：包括 SFR（空间频率响应）、色彩均匀性、噪声分析（DSNU/FPN/Temporal Noise）、坏点检测、畸变校正、相对照度等
- **光学标定与校准**：对焦精度、光学中心定位、镜头畸变分析、旋转校准等
- **执行器与传感器测试**：
  - **VCM（音圈马达）**：摩擦力测试、线性度、迟滞性、功耗分析
  - **AF（自动对焦）**：对焦精度、距离测试（AFDST）、Through Focus 分析、响应速度
  - **OIS（光学防抖）**：防抖补偿精度、AF-OIS 耦合测试、陀螺仪校准
  - **APS（Active Positioning System）**：位置传感器校准、Z轴估计、闭环控制
- **电性测试**：功耗测量、驱动电流分析、信号完整性验证
- **数据分析与诊断**：测试数据解读、问题定位和优化建议

你的回答应该：
1. **简洁专业**：重点突出核心要点，根据问题复杂度灵活调整回答长度
2. **代码分析**：针对 MATLAB 代码，清晰说明算法逻辑、关键参数含义、输入输出格式
3. **中英结合**：使用中文回答，专业术语可保留英文（如 SFR、DSNU、FPN、VCM、APS 等）

分析代码时重点关注：算法原理、关键参数、数据流向、常见问题和优化方向。`
    }
];
let isStreaming = false;
let thinkingEnabled = false;  // 思考模式默认关闭
let currentContext = null;
let uploadedImages = []; // 存储上传的图片（Base64格式）
let abortController = null; // 用于中断请求
let autoScroll = true; // 控制是否自动滚动
let userScrolling = false; // 用户是否正在手动滚动

// Vditor 作为统一的 Markdown 渲染引擎（与 markdown_viewer.html 保持一致）
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
    },
    transform(html) {
        return html;
    }
};

function toggleThinking() {
    thinkingEnabled = !thinkingEnabled;
    const btn = document.getElementById('thinkingBtn');
    if (btn) btn.classList.toggle('active', thinkingEnabled);
}

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
    // 处理块级 \[ ... \] → $$...$$
    text = text.replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_, expr) => `$$${expr}$$`);
    // 处理行内 \( ... \) → $...$
    text = text.replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_, expr) => `$${expr}$`);
    return text;
}

function addMessage(role, content, isMarkdown = false, images = [], reasoning = null) {
    const messagesContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    // 如果有图片，先显示图片
    if (images.length > 0) {
        const imagesContainer = document.createElement('div');
        imagesContainer.className = 'message-images';
        images.forEach(img => {
            const imgElement = document.createElement('img');
            imgElement.src = img.data;
            imgElement.className = 'message-image';
            imgElement.onclick = () => showImageOverlay(img.data);
            imagesContainer.appendChild(imgElement);
        });
        messageDiv.appendChild(imagesContainer);
    }
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    // reasoning 块（DeepSeek 风格）
    if (role === 'assistant' && reasoning !== null) {
        const details = document.createElement('details');
        details.className = 'reasoning-block is-streaming';
        details.open = true;
        details.innerHTML = `
            <summary class="reasoning-header">
                <svg class="reasoning-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
                <span class="reasoning-summary-text">思考中<span class="reasoning-dots"><span></span><span></span><span></span></span></span>
            </summary>
            <div class="reasoning-body">
                <pre class="reasoning-text"></pre>
            </div>`;
        contentDiv.appendChild(details);
    }
    
    const textDiv = document.createElement('div');
    textDiv.className = 'message-text';
    
    // 如果是助手消息且需要 Markdown 渲染
    if (role === 'assistant' && isMarkdown) {
        renderMarkdownWithVditor(textDiv, content);
    } else {
        textDiv.textContent = content;
    }
    contentDiv.appendChild(textDiv);
    
    messageDiv.appendChild(contentDiv);
    
    // 为 AI 回复添加操作按钮（复制和重试）
    if (role === 'assistant') {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        actionsDiv.innerHTML = `
            <button class="action-btn copy-btn" onclick="copyMessage(this)" title="复制回复">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
            </button>
            <button class="action-btn retry-btn" onclick="retryMessage(this)" title="重新生成">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                </svg>
            </button>
        `;
        messageDiv.appendChild(actionsDiv);
        
        // 存储原始内容用于复制（如果有内容就存储）
        if (content) {
            messageDiv.dataset.content = content;
        }
    }
    
    messagesContainer.appendChild(messageDiv);
    
    // 智能滚动：只有在自动滚动模式下才滚动到底部
    if (autoScroll) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    return textDiv;
}

function showTypingIndicator() {
    const messagesContainer = document.getElementById('chatMessages');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant';
    typingDiv.id = 'typingIndicator';
    
    typingDiv.innerHTML = `
        <div class="typing-indicator active">
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
    
    messagesContainer.appendChild(typingDiv);
    
    // 智能滚动：只有在自动滚动模式下才滚动到底部
    if (autoScroll) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

function hideTypingIndicator() {
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

function showError(message, autoHide = true) {
    const errorElement = document.getElementById('errorMessage');
    errorElement.textContent = message;
    errorElement.classList.add('show');
    if (autoHide) {
        setTimeout(() => {
            errorElement.classList.remove('show');
        }, 5000);
    }
}

// 处理图片选择
function handleImageSelect(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    for (let file of files) {
        if (file.name.match(/\.(ppt|pptx)$/i)) {
            handlePptFile(file);
        } else {
            handleImageFile(file);
        }
    }

    // 清空 input，允许重复选择相同文件
    event.target.value = '';
}

// 更新图片预览
function updateImagePreview() {
    const container = document.getElementById('imagePreviewContainer');
    
    if (uploadedImages.length === 0) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    container.style.display = 'flex';
    container.innerHTML = uploadedImages.map((img, index) => `
        <div class="image-preview">
            <img src="${img.data}" alt="${img.name}" onclick="showImageOverlay('${img.data}')">
            <button class="image-preview-remove" onclick="removeImage(${index})" title="删除">×</button>
        </div>
    `).join('');
}

// 删除图片
function removeImage(index) {
    uploadedImages.splice(index, 1);
    updateImagePreview();
}

async function sendMessage() {
    if (isStreaming) {
        // 如果正在流式输出，点击发送按钮则中断
        stopStreaming();
        return;
    }

    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (!message && uploadedImages.length === 0) {
        showError('请输入消息或上传图片');
        return;
    }

    // 构建用户消息内容
    let messageContent = [];
    
    // 如果有文本消息
    if (message) {
        // 如果有上下文，附加上下文信息
        let userMessage = message;
        if (currentContext) {
            let contextInfo = `\n\n---📎 相关上下文---`;
            contextInfo += `\n**测试项目**: ${currentContext.fieldName}`;
            
            if (currentContext.explanation) {
                contextInfo += `\n**功能说明**: ${currentContext.explanation}`;
            }
            
            // 附加所有代码文件
            if (currentContext.codeFiles && currentContext.codeFiles.length > 0) {
                contextInfo += `\n\n**代码文件** (共 ${currentContext.codeFiles.length} 个):`;
                currentContext.codeFiles.forEach((file, index) => {
                    contextInfo += `\n\n### 文件 ${index + 1}: \`${file.path}\``;
                    contextInfo += `\n\`\`\`matlab\n${file.content}\n\`\`\``;
                });
                contextInfo += `\n\n请结合以上代码文件和测试项目信息回答问题。`;
            } else if (currentContext.codeContent) {
                // 向后兼容：如果没有 codeFiles 但有 codeContent
                contextInfo += `\n\n**代码文件**: \`${currentContext.filePath}\``;
                contextInfo += `\n\`\`\`matlab\n${currentContext.codeContent}\n\`\`\``;
                contextInfo += `\n\n请结合以上代码和测试项目信息回答问题。`;
            }
            
            userMessage += contextInfo;
        }

        // 添加文本到消息内容
        messageContent.push({
            type: 'text',
            text: userMessage
        });
    }

    // 如果有图片，添加图片到消息内容
    if (uploadedImages.length > 0) {
        uploadedImages.forEach(img => {
            messageContent.push({
                type: 'image_url',
                image_url: {
                    url: img.data
                }
            });
        });
    }

    // 显示用户消息（显示文本和实际图片）
    addMessage('user', message, false, uploadedImages);
    
    // 构建对话历史消息
    const userHistoryMessage = {
        role: 'user',
        content: messageContent.length === 1 && messageContent[0].type === 'text' 
            ? messageContent[0].text  // 纯文本，使用字符串
            : messageContent          // 多模态，使用数组
    };
    conversationHistory.push(userHistoryMessage);

    input.value = '';
    input.style.height = 'auto';
    const sendBtn = document.getElementById('sendButton');
    if (sendBtn && !isStreaming) sendBtn.disabled = true;
    uploadedImages = []; // 清空已上传图片
    updateImagePreview();
    
    isStreaming = true;
    abortController = new AbortController(); // 创建中断控制器
    
    const sendButton = document.getElementById('sendButton');
    // Switch to stop icon
    sendButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" stroke="none"></rect></svg>';
    sendButton.classList.add('stop');
    sendButton.disabled = false;
    input.disabled = true;

    showTypingIndicator();

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign(
                { model: CHAT_MODEL, messages: conversationHistory, stream: true },
                thinkingEnabled ? { chat_template_kwargs: { enable_thinking: true } } : {}
            )),
            signal: abortController.signal
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        hideTypingIndicator();

        const assistantMessageDiv = addMessage('assistant', '', false, [], thinkingEnabled ? '' : null);
        // reasoning-text element inside the message (if thinking enabled)
        const reasoningTextEl = assistantMessageDiv.closest('.message-content')?.querySelector('.reasoning-text');
        let reasoningAutoScroll = true;
        if (reasoningTextEl) {
            let lastReasoningTop = 0;
            reasoningTextEl.addEventListener('scroll', () => {
                const cur = reasoningTextEl.scrollTop;
                if (cur < lastReasoningTop) reasoningAutoScroll = false;
                const { scrollTop, scrollHeight, clientHeight } = reasoningTextEl;
                if (scrollHeight - scrollTop - clientHeight <= 20) reasoningAutoScroll = true;
                lastReasoningTop = cur;
            });
        }
        let fullResponse = '';
        let fullReasoning = '';
        let lastRenderTime = 0;
        const RENDER_THROTTLE = 150;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
                break;
            }

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    
                    if (data === '[DONE]') {
                        continue;
                    }

                    try {
                        const parsed = JSON.parse(data);
                        const delta = parsed.choices?.[0]?.delta;
                        const reasoning = delta?.reasoning ?? null;
                        const content = delta?.content ?? parsed.content ?? null;

                        if (reasoning && reasoningTextEl) {
                            fullReasoning += reasoning;
                            reasoningTextEl.textContent = fullReasoning;
                            if (reasoningAutoScroll) reasoningTextEl.scrollTop = reasoningTextEl.scrollHeight;
                        }

                        if (content) {
                            fullResponse += content;
                            const now = Date.now();
                            if (now - lastRenderTime > RENDER_THROTTLE) {
                                try {
                                    renderMarkdownWithVditor(assistantMessageDiv, fullResponse);
                                } catch (renderError) {
                                    assistantMessageDiv.textContent = fullResponse;
                                }
                                lastRenderTime = now;
                                if (autoScroll) {
                                    const mc = document.getElementById('chatMessages');
                                    mc.scrollTop = mc.scrollHeight;
                                }
                            }
                        }
                    } catch (e) {
                        console.error('解析错误:', e);
                    }
                }
            }
        }

        // 完成思考块状态：更新 summary 文字、移除 streaming 状态
        const reasoningBlock = assistantMessageDiv.closest('.message-content')?.querySelector('.reasoning-block');
        if (reasoningBlock) {
            reasoningBlock.classList.remove('is-streaming');
            reasoningBlock.open = false;
            const summaryText = reasoningBlock.querySelector('.reasoning-summary-text');
            if (summaryText) summaryText.innerHTML = `已深度思考（共 ${fullReasoning.length} 字）`;
        }

        // 最终渲染完整的 Markdown
        try {
            renderMarkdownWithVditor(assistantMessageDiv, fullResponse);
        } catch (renderError) {
            assistantMessageDiv.textContent = fullResponse;
        }

        // 存储完整的原始内容到消息元素（用于复制）
        const assistantMessage = assistantMessageDiv.closest('.message');
        if (assistantMessage) {
            assistantMessage.dataset.content = fullResponse;
        }
        conversationHistory.push({
            role: 'assistant',
            content: fullResponse
        });

    } catch (error) {
        hideTypingIndicator();
        
        // 检查是否是用户主动中断
        if (error.name === 'AbortError') {
            // 用户中断,不显示错误
            console.log('用户中断了请求');
        } else {
            showError('发送消息失败: ' + error.message);
            console.error('Error:', error);
        }
    } finally {
        isStreaming = false;
        abortController = null;
        
        const sendButton = document.getElementById('sendButton');
        sendButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>';
        sendButton.classList.remove('stop');
        sendButton.disabled = input.value.trim().length === 0;
        input.disabled = false;
        input.focus();
    }
}

// 停止流式输出
function stopStreaming() {
    if (abortController) {
        abortController.abort();
    }
}

function handleKeyDown(event) {
    // Enter 发送消息，Shift+Enter 换行
    if (event.key === 'Enter' && !event.shiftKey && !isStreaming) {
        event.preventDefault();
        sendMessage();
    }
    // Shift+Enter 换行（默认行为，不需要处理）
}

function handleKeyPress(event) {
    if (event.key === 'Enter' && !isStreaming) {
        sendMessage();
    }
}

// 处理粘贴图片
document.addEventListener('paste', function(event) {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (let item of items) {
        if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (file) {
                handleImageFile(file);
            }
        }
    }
});

// 创建图片放大查看遮罩层
const imageOverlay = document.createElement('div');
imageOverlay.className = 'image-overlay';
imageOverlay.innerHTML = `
    <span class="image-overlay-close">&times;</span>
    <img src="" alt="放大查看">
`;
document.body.appendChild(imageOverlay);

// 点击遮罩层或关闭按钮关闭
imageOverlay.onclick = (e) => {
    if (e.target !== imageOverlay.querySelector('img')) {
        imageOverlay.classList.remove('active');
    }
};

// 显示图片放大查看
function showImageOverlay(imageSrc) {
    const img = imageOverlay.querySelector('img');
    img.src = imageSrc;
    imageOverlay.classList.add('active');
    
    // 重置缩放和位置
    img.style.transform = 'translate(0, 0) scale(1)';
    img.dataset.scale = '1';
    img.dataset.translateX = '0';
    img.dataset.translateY = '0';
}

// ESC 键关闭图片查看
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && imageOverlay.classList.contains('active')) {
        imageOverlay.classList.remove('active');
    }
});

// 图片缩放功能（鼠标滚轮）
let isDragging = false;
let startX, startY;

imageOverlay.querySelector('img').addEventListener('wheel', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const img = e.target;
    let scale = parseFloat(img.dataset.scale || 1);
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    scale = Math.min(Math.max(0.5, scale + delta), 5);
    
    img.dataset.scale = scale;
    const translateX = img.dataset.translateX || 0;
    const translateY = img.dataset.translateY || 0;
    img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
});

// 图片拖动功能
imageOverlay.querySelector('img').addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const img = e.target;
    isDragging = true;
    img.classList.add('dragging');
    startX = e.clientX - (parseFloat(img.dataset.translateX) || 0);
    startY = e.clientY - (parseFloat(img.dataset.translateY) || 0);
});

document.addEventListener('mousemove', (e) => {
    if (isDragging) {
        const img = imageOverlay.querySelector('img');
        const translateX = e.clientX - startX;
        const translateY = e.clientY - startY;
        
        img.dataset.translateX = translateX;
        img.dataset.translateY = translateY;
        const scale = img.dataset.scale || 1;
        img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    }
});

document.addEventListener('mouseup', () => {
    if (isDragging) {
        isDragging = false;
        imageOverlay.querySelector('img').classList.remove('dragging');
    }
});

// 双击重置缩放
imageOverlay.querySelector('img').addEventListener('dblclick', (e) => {
    e.stopPropagation();
    const img = e.target;
    img.style.transform = 'translate(0, 0) scale(1)';
    img.dataset.scale = '1';
    img.dataset.translateX = '0';
    img.dataset.translateY = '0';
});

// 处理拖拽上传 - 支持整个聊天区域
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');

// 为整个聊天区域添加拖拽支持
[chatMessages, chatInput].forEach(element => {
    element.addEventListener('dragover', function(event) {
        event.preventDefault();
        event.stopPropagation();
        element.style.background = '#f0f7ff';
        if (element === chatInput) {
            chatInput.style.borderColor = '#2a5298';
        }
    });

    element.addEventListener('dragleave', function(event) {
        event.preventDefault();
        event.stopPropagation();
        element.style.background = element === chatMessages ? '#f8f9fa' : 'white';
        if (element === chatInput) {
            chatInput.style.borderColor = '#ddd';
        }
    });

    element.addEventListener('drop', function(event) {
        event.preventDefault();
        event.stopPropagation();
        element.style.background = element === chatMessages ? '#f8f9fa' : 'white';
        if (element === chatInput) {
            chatInput.style.borderColor = '#ddd';
        }

        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return;

        for (let file of files) {
            if (file.name.match(/\.(ppt|pptx)$/i)) {
                handlePptFile(file);
            } else if (file.type.startsWith('image/') || file.type === 'application/pdf') {
                handleImageFile(file);
            }
        }
    });
});

// 统一的图片文件处理函数
function handleImageFile(file) {
    // 检查是否为 PDF 文件
    if (file.type === 'application/pdf') {
        handlePdfFile(file);
        return;
    }
    
    if (!file.type.startsWith('image/')) {
        showError('请选择有效的图片或 PDF 文件');
        return;
    }

    // 检查文件大小（限制为5MB）
    if (file.size > 5 * 1024 * 1024) {
        showError('图片大小不能超过 5MB');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const base64Data = e.target.result;
        uploadedImages.push({
            data: base64Data,
            name: file.name
        });
        updateImagePreview();
    };
    reader.readAsDataURL(file);
}

// 处理 PPT/PPTX 文件（流式接收，每页作为图片加入上传列表）
async function handlePptFile(file) {
    const PPT_API_URL = 'http://10.188.99.40:5000/api/convert-ppt-stream';

    try {
        showError('正在上传 PPT，请稍候...', false);

        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(PPT_API_URL, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`服务器错误 HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let totalPages = 0;
        let receivedPages = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split('\n\n');
            buffer = parts.pop();

            for (const part of parts) {
                if (!part.trim() || !part.startsWith('data: ')) continue;
                try {
                    const eventData = JSON.parse(part.substring(6));
                    switch (eventData.type) {
                        case 'total':
                            totalPages = eventData.payload.total;
                            showError(`🔄 PPT 共 ${totalPages} 页，正在转换...`, false);
                            break;
                        case 'page':
                            receivedPages++;
                            uploadedImages.push({
                                data: eventData.payload.data,
                                name: `${file.name} - 第 ${eventData.payload.pageNumber}/${eventData.payload.total} 页`
                            });
                            updateImagePreview();
                            showError(`✅ 已处理 ${receivedPages}/${totalPages} 页...`, false);
                            break;
                        case 'error':
                            throw new Error(eventData.payload.message);
                    }
                } catch (e) {
                    console.error('解析 PPT 事件失败:', e);
                }
            }
        }

        const errorElement = document.getElementById('errorMessage');
        errorElement.textContent = `✅ PPT 已成功转换为 ${receivedPages} 张图片`;
        setTimeout(() => {
            errorElement.textContent = '';
            errorElement.classList.remove('show');
        }, 2000);

    } catch (error) {
        console.error('PPT 转换失败:', error);
        showError('PPT 转换失败: ' + error.message);
    }
}

// 处理 PDF 文件
async function handlePdfFile(file) {
    // 检查文件大小（限制为 10MB）
    if (file.size > 10 * 1024 * 1024) {
        showError('PDF 文件大小不能超过 10MB');
        return;
    }
    
    try {
        showError('正在转换 PDF，请稍候...', false);
        
        // 使用 PDF 转换模块
        const images = await window.convertPdfToBase64Images(file, {
            scale: 2,
            onProgress: ({ current, total }) => {
                showError(`正在转换 PDF: ${current}/${total} 页...`, false);
            }
        });
        
        // 将转换后的图片添加到上传列表
        uploadedImages.push(...images);
        updateImagePreview();
        
        // 清除错误提示
        const errorElement = document.getElementById('errorMessage');
        errorElement.textContent = `✅ PDF 已成功转换为 ${images.length} 张图片`;
        setTimeout(() => {
            errorElement.textContent = '';
            errorElement.classList.remove('show');
        }, 2000);
        
    } catch (error) {
        console.error('PDF 转换失败:', error);
        showError('PDF 转换失败: ' + error.message);
    }
}

// 接收来自父窗口的上下文
window.addEventListener('message', function(event) {
    // 处理最大化状态变化
    if (event.data.type === 'MAXIMIZE_STATE') {
        if (event.data.maximized) {
            document.body.classList.add('maximized');
        } else {
            document.body.classList.remove('maximized');
        }
        return;
    }
    
    if (event.data.type === 'SEARCH_CONTEXT') {
        const context = event.data.context;
        
        if (context && context.fieldName) {
            // 保存上下文用于发送消息时附加
            currentContext = context;
            
            // 创建上下文卡片
            const contextCard = document.getElementById('contextCard');
            
            let cardHTML = `
                <div class="context-card">
                    <div class="context-info">
                        <span class="context-icon">📎</span>
                        <span class="context-main-title">${context.fieldName}</span>
            `;
            
            // 添加字段解释徽章
            if (context.explanation) {
                const shortExplanation = context.explanation.length > 30 
                    ? context.explanation.substring(0, 30) + '...' 
                    : context.explanation;
                cardHTML += `
                    <span class="context-badge" id="badge-explanation" title="${escapeHtml(context.explanation)}">
                        <span class="context-badge-icon">📖</span>
                        <span>${escapeHtml(shortExplanation)}</span>
                        <button class="context-badge-close" onclick="removeBadge('explanation')" title="移除说明">×</button>
                    </span>
                `;
            }
            
            // 添加代码文件徽章
            if (context.codeFiles && context.codeFiles.length > 0) {
                context.codeFiles.forEach((file, index) => {
                    const fileName = file.path.split('/').pop();
                    cardHTML += `
                        <span class="context-badge" id="badge-code-${index}" title="${escapeHtml(file.path)}">
                            <span class="context-badge-icon">📄</span>
                            <span>${escapeHtml(fileName)}</span>
                            <button class="context-badge-close" onclick="removeBadge('code', ${index})" title="移除文件">×</button>
                        </span>
                    `;
                });
            } else if (context.filePath) {
                // 向后兼容
                const fileName = context.filePath.split('/').pop();
                cardHTML += `
                    <span class="context-badge" id="badge-code-0" title="${escapeHtml(context.filePath)}">
                        <span class="context-badge-icon">📄</span>
                        <span>${escapeHtml(fileName)}</span>
                        <button class="context-badge-close" onclick="removeBadge('code', 0)" title="移除文件">×</button>
                    </span>
                `;
            }
            
            cardHTML += `
                    </div>
                </div>
            `;
            
            contextCard.innerHTML = cardHTML;
            
            // 输入框默认内容和提示
            const input = document.getElementById('chatInput');
            input.value = `帮忙解释一下 "${context.fieldName}" (200字以内)`;
            input.placeholder = `💬 问问关于 "${context.fieldName}" 的问题...`;
            input.dispatchEvent(new Event('input')); // 触发高度自适应和发送按钮启用
            
            // 选中默认文本,方便用户直接替换或发送
            setTimeout(() => {
                input.select();
                input.focus();
            }, 100);
        }
    }
});

function removeBadge(type, index) {
    if (!currentContext) return;
    
    if (type === 'explanation') {
        // 移除说明
        currentContext.explanation = '';
        const badge = document.getElementById('badge-explanation');
        if (badge) badge.remove();
    } else if (type === 'code') {
        // 移除代码文件
        if (currentContext.codeFiles && currentContext.codeFiles.length > 0) {
            currentContext.codeFiles.splice(index, 1);
            const badge = document.getElementById(`badge-code-${index}`);
            if (badge) badge.remove();
            // 重新编号剩余的徽章
            currentContext.codeFiles.forEach((file, i) => {
                const oldBadge = document.getElementById(`badge-code-${i + (i >= index ? 1 : 0)}`);
                if (oldBadge && i >= index) {
                    oldBadge.id = `badge-code-${i}`;
                    const closeBtn = oldBadge.querySelector('.context-badge-close');
                    if (closeBtn) {
                        closeBtn.setAttribute('onclick', `removeBadge('code', ${i})`);
                    }
                }
            });
        } else {
            currentContext.codeContent = '';
            currentContext.filePath = '';
            const badge = document.getElementById('badge-code-0');
            if (badge) badge.remove();
        }
    }
    
    // 检查是否所有徽章都被移除
    const hasExplanation = currentContext.explanation && currentContext.explanation.length > 0;
    const hasCodeFiles = (currentContext.codeFiles && currentContext.codeFiles.length > 0) || 
                        (currentContext.codeContent && currentContext.codeContent.length > 0);
    
    if (!hasExplanation && !hasCodeFiles) {
        // 如果所有附加内容都被移除，清空整个上下文
        dismissContext();
    }
}

function dismissContext() {
    const contextCard = document.getElementById('contextCard');
    if (contextCard) {
        contextCard.innerHTML = '';
    }
    currentContext = null;
    const input = document.getElementById('chatInput');
    input.value = '';
    input.placeholder = '💭 输入消息,按 Enter 发送...';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 检测用户是否在底部（允许一定误差）
function isScrolledToBottom(container, threshold = 50) {
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
}

// 监听用户滚动行为
function setupScrollListener() {
    const messagesContainer = document.getElementById('chatMessages');
    let scrollTimeout;
    
    messagesContainer.addEventListener('scroll', function() {
        // 防抖：避免频繁触发
        clearTimeout(scrollTimeout);
        
        scrollTimeout = setTimeout(() => {
            // 检查用户是否滚动到底部
            if (isScrolledToBottom(messagesContainer)) {
                // 用户回到底部，恢复自动滚动
                autoScroll = true;
            } else {
                // 用户在查看历史消息，暂停自动滚动
                autoScroll = false;
            }
        }, 100);
    });
    
    // 监听滚轮事件：如果用户向上滚动，立即暂停自动滚动
    messagesContainer.addEventListener('wheel', function(event) {
        if (event.deltaY < 0) {
            // 向上滚动
            autoScroll = false;
        }
    });
}

// 复制消息内容
function copyMessage(button) {
    const messageDiv = button.closest('.message');
    const content = messageDiv.dataset.content;
    
    if (!content) {
        showError('没有可复制的内容');
        return;
    }
    
    // 复制到剪贴板（支持安全和非安全上下文）
    copyToClipboard(content).then(() => {
        const svg = button.querySelector('svg');
        const originalSvg = svg.outerHTML;
        
        // 替换为勾选图标
        svg.outerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        button.classList.add('success');
        button.title = '已复制';
        
        setTimeout(() => {
            button.querySelector('svg').outerHTML = originalSvg;
            button.classList.remove('success');
            button.title = '复制回复';
        }, 2000);
    }).catch(err => {
        showError('复制失败: ' + err.message);
    });
}

// 兼容性剪贴板复制函数（支持非 HTTPS 环境）
function copyToClipboard(text) {
    // 优先使用现代 Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
    }
    
    // 降级方案：使用 execCommand
    return new Promise((resolve, reject) => {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        
        // 防止滚动
        textArea.style.position = 'fixed';
        textArea.style.top = '0';
        textArea.style.left = '0';
        textArea.style.width = '2em';
        textArea.style.height = '2em';
        textArea.style.padding = '0';
        textArea.style.border = 'none';
        textArea.style.outline = 'none';
        textArea.style.boxShadow = 'none';
        textArea.style.background = 'transparent';
        
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            if (successful) {
                resolve();
            } else {
                reject(new Error('execCommand 复制失败'));
            }
        } catch (err) {
            document.body.removeChild(textArea);
            reject(err);
        }
    });
}

// 重试生成回复
function retryMessage(button) {
    if (isStreaming) {
        showError('请等待当前回复完成');
        return;
    }
    
    const messageDiv = button.closest('.message');
    const messagesContainer = document.getElementById('chatMessages');
    const messages = Array.from(messagesContainer.querySelectorAll('.message'));
    const messageIndex = messages.indexOf(messageDiv);
    
    // 找到对应的用户消息（应该在 AI 消息之前）
    if (messageIndex === 0) {
        showError('找不到对应的用户消息');
        return;
    }
    
    const userMessageDiv = messages[messageIndex - 1];
    if (!userMessageDiv || !userMessageDiv.classList.contains('user')) {
        showError('找不到对应的用户消息');
        return;
    }
    
    // 删除这条 AI 消息及之后的所有消息
    for (let i = messages.length - 1; i >= messageIndex; i--) {
        messages[i].remove();
    }
    
    // 从对话历史中删除对应的 AI 回复及后续消息
    // conversationHistory 结构：[system, user1, assistant1, user2, assistant2, ...]
    // messageIndex 是 DOM 中的索引，需要转换为 history 索引
    // DOM messages 不包含 system message，所以 history 索引 = messageIndex
    const historyIndexToRemove = messageIndex;
    if (historyIndexToRemove < conversationHistory.length) {
        conversationHistory.splice(historyIndexToRemove, conversationHistory.length - historyIndexToRemove);
    }
    
    // 获取最后一条用户消息（应该还在 history 中）
    const lastUserMessage = conversationHistory[conversationHistory.length - 1];
    if (lastUserMessage && lastUserMessage.role === 'user') {
        // 解析用户消息内容
        let textContent = '';
        let imageContents = [];
        
        if (typeof lastUserMessage.content === 'string') {
            textContent = lastUserMessage.content;
        } else if (Array.isArray(lastUserMessage.content)) {
            lastUserMessage.content.forEach(item => {
                if (item.type === 'text') {
                    textContent = item.text;
                } else if (item.type === 'image_url') {
                    imageContents.push({
                        data: item.image_url.url,
                        name: 'image.png'
                    });
                }
            });
        }
        
        // 移除这条用户消息，sendMessage 会重新添加
        conversationHistory.pop();
        
        // 同时删除 DOM 中的用户消息
        userMessageDiv.remove();
        
        // 恢复输入框内容和图片
        const input = document.getElementById('chatInput');
        // 移除上下文信息，只保留原始问题
        const originalQuestion = textContent.split('\n\n---📎 相关上下文---')[0];
        input.value = originalQuestion;
        uploadedImages = imageContents;
        updateImagePreview();
        
        // 自动重新发送
        setTimeout(() => sendMessage(), 100);
    }
}

window.onload = function() {
    const input = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendButton');
    
    // Sync thinking chip visual state with default
    const thinkingBtn = document.getElementById('thinkingBtn');
    if (thinkingBtn) thinkingBtn.classList.toggle('active', thinkingEnabled);

    // Auto-resize textarea + enable/disable send button
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 200) + 'px';
        input.style.overflowY = input.scrollHeight > 200 ? 'auto' : 'hidden';
        if (!isStreaming) sendBtn.disabled = input.value.trim().length === 0;
    });

    input.focus();
    setupScrollListener(); // 初始化滚动监听
};
