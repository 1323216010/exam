// 首页逻辑：模式选择、试卷列表、练习配置、自定义组卷
import { EXAM_LIST, loadExamList } from './config.js';
import { getAllConfigs, getActiveConfig, getActiveConfigId, setActiveConfigId, addConfig, updateConfig, deleteConfig, DEFAULT_API_URL, DEFAULT_API_MODEL, DEFAULT_CHOICE_PROMPT_TEMPLATE, DEFAULT_SUBJECTIVE_PROMPT_TEMPLATE, getChoicePromptTemplate, getSubjectivePromptTemplate, savePromptTemplates, resetPromptTemplates, getShuffleOptions, setShuffleOptions } from './api.js';
import { getFilenameFromPath } from './utils.js';
import { clearAllChatDatabase, getChatStats } from './aiChatStorage.js';

// ==================== 模式选择 ====================

function selectMode(mode) {
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
    
    // 显示模式选择页面
    document.getElementById('mode-selection').classList.remove('hidden');
}

// ==================== 文件上传处理 ====================

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const examData = JSON.parse(event.target.result);
            // 存储到 localStorage，由 exam.html 读取
            localStorage.setItem('uploadedExamData', JSON.stringify(examData));
            // 打开答题页面
            window.open('exam.html?mode=upload', '_blank');
        } catch (error) {
            alert('JSON 文件格式错误：' + error.message);
        }
    };
    reader.readAsText(file);
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
    
    // 绑定清空聊天记录按钮
    const clearAllChatsBtn = document.getElementById('clear-all-chats-btn');
    if (clearAllChatsBtn) {
        clearAllChatsBtn.addEventListener('click', handleClearAllChats);
    }
    
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
// 清空所有聊天记录
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
// ==================== 练习模式 ====================

function startPracticeMode() {
    const randomOrder = document.getElementById('random-order').checked;
    const questionLimit = document.getElementById('question-limit').value;
    const subject = document.getElementById('practice-subject-filter').value;
    
    // 获取选中的题型
    const selectedTypes = Array.from(document.querySelectorAll('.practice-type-checkbox:checked'))
        .map(cb => cb.value);
    
    if (selectedTypes.length === 0) {
        alert('请至少选择一种题型');
        return;
    }
    
    const params = new URLSearchParams();
    params.set('mode', 'practice');
    params.set('random', randomOrder);
    if (questionLimit) params.set('limit', questionLimit);
    if (subject) params.set('subject', subject);
    if (selectedTypes.length > 0) params.set('types', selectedTypes.join(','));
    
    const url = `exam.html?${params.toString()}`;
    window.open(url, '_blank');
}

async function initPracticeSubjectFilter() {
    const subjectFilter = document.getElementById('practice-subject-filter');
    const subjects = [...new Set(EXAM_LIST.map(e => e.subject))].sort();
    
    subjectFilter.innerHTML = '<option value="">全部科目</option>';
    subjects.forEach(subject => {
        subjectFilter.innerHTML += `<option value="${subject}">${subject}</option>`;
    });
    
    // 加载题型选择
    await loadPracticeQuestionTypes();
}

async function loadPracticeQuestionTypes() {
    try {
        const response = await fetch(EXAM_LIST[0].path);
        const data = await response.json();
        
        const types = [...new Set(data.questions.map(q => q.question_type))];
        const typeFilters = document.getElementById('practice-type-filters');
        
        typeFilters.innerHTML = '';
        types.forEach(type => {
            const item = document.createElement('label');
            item.className = 'config-label';
            item.innerHTML = `
                <input type="checkbox" value="${type}" class="practice-type-checkbox" checked>
                <span>${type}</span>
            `;
            typeFilters.appendChild(item);
        });
    } catch (error) {
        console.error('加载题型失败:', error);
    }
}

// ==================== 自定义组卷 ====================

function loadCustomExamUI() {
    const subjectFilter = document.getElementById('custom-subject-filter');
    const subjects = [...new Set(EXAM_LIST.map(e => e.subject))].sort();
    
    subjectFilter.innerHTML = '<option value="">全部科目</option>';
    subjects.forEach(subject => {
        subjectFilter.innerHTML += `<option value="${subject}">${subject}</option>`;
    });
    
    subjectFilter.removeEventListener('change', filterCustomExamList);
    subjectFilter.addEventListener('change', filterCustomExamList);
    
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
    filtered.forEach((exam) => {
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
        const response = await fetch(EXAM_LIST[0].path);
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
    
    const url = `exam.html?${params.toString()}`;
    window.open(url, '_blank');
}

// ==================== 设置对话框 ====================

function showSettings() {
    const modal = document.getElementById('settings-modal');
    renderConfigList();
    loadPromptTemplates();
    loadExamSettings();
    switchSettingsTab('ai-config'); // 默认显示 AI 配置 tab
    modal.classList.add('show');
}

function closeSettings() {
    document.getElementById('settings-modal').classList.remove('show');
}

function switchSettingsTab(tabName) {
    // 切换 tab 按钮状态
    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        }
    });
    
    // 切换 tab 内容
    document.querySelectorAll('.settings-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    const activeContent = document.getElementById(`tab-${tabName}`);
    if (activeContent) {
        activeContent.classList.add('active');
    }
}

function loadPromptTemplates() {
    const choiceTemplate = getChoicePromptTemplate();
    const subjectiveTemplate = getSubjectivePromptTemplate();
    
    document.getElementById('choice-prompt-template').value = choiceTemplate;
    document.getElementById('subjective-prompt-template').value = subjectiveTemplate;
}

function loadExamSettings() {
    const shuffleOptions = getShuffleOptions();
    const checkbox = document.getElementById('shuffle-options-checkbox');
    if (checkbox) {
        checkbox.checked = shuffleOptions;
    }
}

function saveExamSettingsFromUI() {
    const checkbox = document.getElementById('shuffle-options-checkbox');
    if (checkbox) {
        setShuffleOptions(checkbox.checked);
    }
}

function renderConfigList() {
    const container = document.getElementById('config-list');
    const configs = getAllConfigs();
    const activeId = getActiveConfigId();
    
    container.innerHTML = '';
    
    configs.forEach(config => {
        const item = document.createElement('div');
        item.className = 'config-item' + (config.id === activeId ? ' active' : '');
        item.dataset.configId = config.id;
        
        item.innerHTML = `
            <div class="config-item-header">
                <input type="radio" name="active-config" value="${config.id}" 
                    ${config.id === activeId ? 'checked' : ''} 
                    class="config-radio">
                <input type="text" class="config-name-input" value="${config.name}" 
                    placeholder="配置名称">
                <button class="config-delete-btn" title="删除配置">🗑️</button>
            </div>
            <div class="config-item-body">
                <div class="config-field">
                    <label>API URL</label>
                    <input type="text" class="config-field-input" data-field="apiUrl" 
                        value="${config.apiUrl}" placeholder="${DEFAULT_API_URL}">
                </div>
                <div class="config-field">
                    <label>API Key</label>
                    <input type="password" class="config-field-input" data-field="apiKey" 
                        value="${config.apiKey}" placeholder="请输入 API Key">
                </div>
                <div class="config-field">
                    <label>模型名称</label>
                    <input type="text" class="config-field-input" data-field="apiModel" 
                        value="${config.apiModel}" placeholder="${DEFAULT_API_MODEL}">
                </div>
            </div>
        `;
        
        container.appendChild(item);
    });
    
    // 绑定事件
    bindConfigEvents();
}

function bindConfigEvents() {
    const container = document.getElementById('config-list');
    
    // 切换激活配置
    container.querySelectorAll('.config-radio').forEach(radio => {
        radio.addEventListener('change', function() {
            setActiveConfigId(this.value);
            renderConfigList();
        });
    });
    
    // 更新配置名称
    container.querySelectorAll('.config-name-input').forEach(input => {
        input.addEventListener('blur', function() {
            const configId = this.closest('.config-item').dataset.configId;
            updateConfig(configId, { name: this.value.trim() || '未命名配置' });
        });
    });
    
    // 更新配置字段
    container.querySelectorAll('.config-field-input').forEach(input => {
        input.addEventListener('blur', function() {
            const configId = this.closest('.config-item').dataset.configId;
            const field = this.dataset.field;
            updateConfig(configId, { [field]: this.value.trim() });
        });
    });
    
    // 删除配置
    container.querySelectorAll('.config-delete-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const configId = this.closest('.config-item').dataset.configId;
            const configs = getAllConfigs();
            
            if (configs.length <= 1) {
                alert('至少需要保留一个配置！');
                return;
            }
            
            if (confirm('确定要删除这个配置吗？')) {
                deleteConfig(configId);
                renderConfigList();
            }
        });
    });
}

function addNewConfig() {
    const newConfig = addConfig('新配置', '', DEFAULT_API_URL, DEFAULT_API_MODEL);
    renderConfigList();
    
    // 聚焦到新配置的名称输入框
    setTimeout(() => {
        const configItem = document.querySelector(`[data-config-id="${newConfig.id}"]`);
        if (configItem) {
            const nameInput = configItem.querySelector('.config-name-input');
            if (nameInput) {
                nameInput.focus();
                nameInput.select();
            }
        }
    }, 100);
}

function saveSettings() {
    // 保存提示词模板
    savePromptTemplatesFromUI();
    // 保存答题设置
    saveExamSettingsFromUI();
    alert('配置已保存！');
    closeSettings();
}

function savePromptTemplatesFromUI() {
    const choiceTemplate = document.getElementById('choice-prompt-template')?.value.trim();
    const subjectiveTemplate = document.getElementById('subjective-prompt-template')?.value.trim();
    savePromptTemplates(choiceTemplate, subjectiveTemplate);
}

async function testApiConnection() {
    const activeConfig = getActiveConfig();
    const testResult = document.getElementById('test-result');
    const testBtn = document.getElementById('test-api-btn');
    
    if (!activeConfig.apiKey) {
        testResult.style.display = 'block';
        testResult.style.background = '#FEF2F2';
        testResult.style.color = '#991B1B';
        testResult.style.border = '1px solid #FCA5A5';
        testResult.textContent = '❌ 当前配置未设置 API Key';
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
        const response = await fetch(activeConfig.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${activeConfig.apiKey}`
            },
            body: JSON.stringify({
                model: activeConfig.apiModel,
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

// ==================== 页面初始化 ====================

async function initializeApp() {
    // 加载试卷列表
    try {
        await loadExamList();
    } catch (error) {
        console.error('加载试卷列表失败，将使用空列表:', error);
    }
    
    // 设置初始页面状态
    document.getElementById('mode-selection').classList.remove('hidden');
    document.getElementById('upload-container').classList.add('hidden');
    document.getElementById('exam-list-container').classList.add('hidden');
    document.getElementById('practice-config-container').classList.add('hidden');
    document.getElementById('custom-exam-container').classList.add('hidden');
    
    // 文件上传
    document.getElementById('file-input').addEventListener('change', handleFileUpload);
    
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
    
    // 设置对话框
    document.getElementById('settings-btn').addEventListener('click', showSettings);
    document.getElementById('close-settings').addEventListener('click', closeSettings);
    document.getElementById('cancel-settings').addEventListener('click', closeSettings);
    document.getElementById('save-settings').addEventListener('click', saveSettings);
    document.getElementById('add-config-btn')?.addEventListener('click', addNewConfig);
    
    // Tab 切换
    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            switchSettingsTab(tabName);
        });
    });
    
    // 点击模态框背景关闭 - 只在点击背景层时关闭
    const settingsModal = document.getElementById('settings-modal');
    settingsModal.addEventListener('mousedown', function(e) {
        // 只有当点击目标是模态框本身（背景层）时才关闭
        if (e.target === settingsModal) {
            closeSettings();
        }
    });
    
    // 阻止模态框内容区域的所有事件冒泡
    const modalContent = settingsModal.querySelector('.modal-content');
    if (modalContent) {
        // 阻止所有鼠标事件冒泡
        ['mousedown', 'mouseup', 'click'].forEach(eventType => {
            modalContent.addEventListener(eventType, function(e) {
                e.stopPropagation();
            });
        });
    }
    
    document.getElementById('test-api-btn').addEventListener('click', testApiConnection);
    
    // 提示词模板保存
    document.getElementById('choice-prompt-template')?.addEventListener('blur', savePromptTemplatesFromUI);
    document.getElementById('subjective-prompt-template')?.addEventListener('blur', savePromptTemplatesFromUI);
    document.getElementById('reset-templates-btn')?.addEventListener('click', () => {
        if (confirm('确定要恢复默认提示词模板吗？')) {
            resetPromptTemplates();
            loadPromptTemplates();
        }
    });
    
    // 试卷列表筛选
    const subjectFilter = document.getElementById('subject-filter');
    if (subjectFilter) subjectFilter.addEventListener('change', filterExamList);
    
    // 练习模式按钮
    const btnStartPractice = document.getElementById('btn-start-practice');
    if (btnStartPractice) {
        btnStartPractice.addEventListener('click', startPracticeMode);
    }
    
    // 练习模式题型全选/全不选
    const btnSelectAllTypes = document.getElementById('btn-select-all-types');
    const btnSelectNoneTypes = document.getElementById('btn-select-none-types');
    if (btnSelectAllTypes) {
        btnSelectAllTypes.addEventListener('click', () => {
            document.querySelectorAll('.practice-type-checkbox').forEach(cb => cb.checked = true);
        });
    }
    if (btnSelectNoneTypes) {
        btnSelectNoneTypes.addEventListener('click', () => {
            document.querySelectorAll('.practice-type-checkbox').forEach(cb => cb.checked = false);
        });
    }
    
    // 自定义组卷按钮
    const btnSelectAll = document.getElementById('btn-select-all');
    const btnSelectNone = document.getElementById('btn-select-none');
    const btnStartCustom = document.getElementById('btn-start-custom');
    
    if (btnSelectAll) btnSelectAll.addEventListener('click', selectAllExams);
    if (btnSelectNone) btnSelectNone.addEventListener('click', selectNoneExams);
    if (btnStartCustom) btnStartCustom.addEventListener('click', startCustomExam);
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
