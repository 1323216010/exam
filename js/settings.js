// 设置对话框相关功能
import { 
    getAllConfigs, getActiveConfig, getActiveConfigId, setActiveConfigId, 
    addConfig, updateConfig, deleteConfig, 
    DEFAULT_API_URL, DEFAULT_API_MODEL,
    getChoicePromptTemplate, getSubjectivePromptTemplate, 
    savePromptTemplates, resetPromptTemplates,
    getShuffleOptions, setShuffleOptions 
} from './api.js';
import { Icons } from './icons.js';

export function showSettings() {
    const modal = document.getElementById('settings-modal');
    renderConfigList();
    loadPromptTemplates();
    loadExamSettings();
    switchSettingsTab('ai-config');
    modal.classList.add('show');
}

export function closeSettings() {
    document.getElementById('settings-modal').classList.remove('show');
}

export function switchSettingsTab(tabName) {
    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        }
    });
    
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
                <button class="config-delete-btn" title="删除配置">${Icons.trash}</button>
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
    
    bindConfigEvents();
}

function bindConfigEvents() {
    const container = document.getElementById('config-list');
    
    container.querySelectorAll('.config-radio').forEach(radio => {
        radio.addEventListener('change', function() {
            setActiveConfigId(this.value);
            renderConfigList();
        });
    });
    
    container.querySelectorAll('.config-name-input').forEach(input => {
        input.addEventListener('blur', function() {
            const configId = this.closest('.config-item').dataset.configId;
            updateConfig(configId, { name: this.value.trim() || '未命名配置' });
        });
    });
    
    container.querySelectorAll('.config-field-input').forEach(input => {
        input.addEventListener('blur', function() {
            const configId = this.closest('.config-item').dataset.configId;
            const field = this.dataset.field;
            updateConfig(configId, { [field]: this.value.trim() });
        });
    });
    
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

export function addNewConfig() {
    const newConfig = addConfig('新配置', '', DEFAULT_API_URL, DEFAULT_API_MODEL);
    renderConfigList();
    
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

export function saveSettings() {
    savePromptTemplatesFromUI();
    saveExamSettingsFromUI();
    alert('配置已保存！');
    closeSettings();
}

export function savePromptTemplatesFromUI() {
    const choiceTemplate = document.getElementById('choice-prompt-template')?.value.trim();
    const subjectiveTemplate = document.getElementById('subjective-prompt-template')?.value.trim();
    savePromptTemplates(choiceTemplate, subjectiveTemplate);
}

export async function testApiConnection() {
    const activeConfig = getActiveConfig();
    const testResult = document.getElementById('test-result');
    const testBtn = document.getElementById('test-api-btn');
    
    if (!activeConfig.apiKey) {
        testResult.style.display = 'block';
        testResult.style.background = '#FEF2F2';
        testResult.style.color = '#991B1B';
        testResult.style.border = '1px solid #FCA5A5';
        testResult.innerHTML = `${Icons.alertCircle} 当前配置未设置 API Key`;
        return;
    }
    
    testBtn.disabled = true;
    testBtn.innerHTML = `${Icons.loader} 测试中...`;
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
                enable_thinking: false
            })
        });
        
        if (!response.ok) {
            throw new Error(`API 返回错误: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.choices && data.choices[0] && data.choices[0].message) {
            testResult.style.background = '#ECFDF5';
            testResult.style.color = '#065F46';
            testResult.style.border = '1px solid #6EE7B7';
            testResult.innerHTML = `${Icons.checkCircle} 连接成功！AI 回复: ${data.choices[0].message.content.trim()}`;
        } else {
            throw new Error('API 返回格式异常');
        }
    } catch (error) {
        testResult.style.background = '#FEF2F2';
        testResult.style.color = '#991B1B';
        testResult.style.border = '1px solid #FCA5A5';
        testResult.innerHTML = `${Icons.alertCircle} 连接失败: ${error.message}`;
    } finally {
        testBtn.disabled = false;
        testBtn.innerHTML = `${Icons.search} 测试连接`;
    }
}
