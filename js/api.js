// API 配置管理 - 支持多配置切换
const API_CONFIGS_STORAGE_KEY = 'exam_system_api_configs';
const ACTIVE_CONFIG_ID_KEY = 'exam_system_active_config_id';
const PROMPT_TEMPLATES_STORAGE_KEY = 'exam_system_prompt_templates';
const DEFAULT_API_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const DEFAULT_API_MODEL = 'qwen-plus';

// 默认提示词模板
const DEFAULT_CHOICE_PROMPT_TEMPLATE = `题目：{content}

选项：
{options}

答案：{answer}

请简要解释为什么选择这个答案？`;

const DEFAULT_SUBJECTIVE_PROMPT_TEMPLATE = `题目：{content}

答案：{answer}

请说明这道题的知识点出处和答题要点。`;

// 获取所有配置
export function getAllConfigs() {
    const configs = localStorage.getItem(API_CONFIGS_STORAGE_KEY);
    if (!configs) {
        // 首次使用，创建默认配置
        const defaultConfig = {
            id: Date.now().toString(),
            name: '默认配置',
            apiKey: '',
            apiUrl: DEFAULT_API_URL,
            apiModel: DEFAULT_API_MODEL
        };
        saveAllConfigs([defaultConfig]);
        setActiveConfigId(defaultConfig.id);
        return [defaultConfig];
    }
    return JSON.parse(configs);
}

// 保存所有配置
export function saveAllConfigs(configs) {
    localStorage.setItem(API_CONFIGS_STORAGE_KEY, JSON.stringify(configs));
}

// 获取当前激活的配置ID
export function getActiveConfigId() {
    return localStorage.getItem(ACTIVE_CONFIG_ID_KEY) || null;
}

// 设置激活的配置ID
export function setActiveConfigId(id) {
    localStorage.setItem(ACTIVE_CONFIG_ID_KEY, id);
}

// 获取当前激活的配置
export function getActiveConfig() {
    const configs = getAllConfigs();
    const activeId = getActiveConfigId();
    
    let config = configs.find(c => c.id === activeId);
    if (!config && configs.length > 0) {
        config = configs[0];
        setActiveConfigId(config.id);
    }
    return config || {
        id: Date.now().toString(),
        name: '默认配置',
        apiKey: '',
        apiUrl: DEFAULT_API_URL,
        apiModel: DEFAULT_API_MODEL
    };
}

// 添加新配置
export function addConfig(name, apiKey, apiUrl, apiModel) {
    const configs = getAllConfigs();
    const newConfig = {
        id: Date.now().toString(),
        name: name || `配置 ${configs.length + 1}`,
        apiKey: apiKey || '',
        apiUrl: apiUrl || DEFAULT_API_URL,
        apiModel: apiModel || DEFAULT_API_MODEL
    };
    configs.push(newConfig);
    saveAllConfigs(configs);
    return newConfig;
}

// 更新配置
export function updateConfig(id, updates) {
    const configs = getAllConfigs();
    const index = configs.findIndex(c => c.id === id);
    if (index !== -1) {
        configs[index] = { ...configs[index], ...updates };
        saveAllConfigs(configs);
        return configs[index];
    }
    return null;
}

// 删除配置
export function deleteConfig(id) {
    const configs = getAllConfigs();
    const filtered = configs.filter(c => c.id !== id);
    
    if (filtered.length === 0) {
        // 至少保留一个配置
        return false;
    }
    
    saveAllConfigs(filtered);
    
    // 如果删除的是当前激活的配置，切换到第一个
    if (getActiveConfigId() === id) {
        setActiveConfigId(filtered[0].id);
    }
    return true;
}

// 兼容旧版本的接口
export function getApiKey() {
    return getActiveConfig().apiKey || '';
}

export function getApiUrl() {
    return getActiveConfig().apiUrl || DEFAULT_API_URL;
}

export function getApiModel() {
    return getActiveConfig().apiModel || DEFAULT_API_MODEL;
}

// 保持向后兼容但不推荐使用
export function saveApiKey(apiKey) {
    const active = getActiveConfig();
    updateConfig(active.id, { apiKey });
}

export function saveApiUrl(apiUrl) {
    const active = getActiveConfig();
    updateConfig(active.id, { apiUrl });
}

export function saveApiModel(apiModel) {
    const active = getActiveConfig();
    updateConfig(active.id, { apiModel });
}

// ==================== 全局提示词模板管理 ====================

// 获取提示词模板配置
function getPromptTemplates() {
    const templates = localStorage.getItem(PROMPT_TEMPLATES_STORAGE_KEY);
    if (!templates) {
        return {
            choicePromptTemplate: DEFAULT_CHOICE_PROMPT_TEMPLATE,
            subjectivePromptTemplate: DEFAULT_SUBJECTIVE_PROMPT_TEMPLATE
        };
    }
    return JSON.parse(templates);
}

// 保存提示词模板配置
export function savePromptTemplates(choiceTemplate, subjectiveTemplate) {
    const templates = {
        choicePromptTemplate: choiceTemplate || DEFAULT_CHOICE_PROMPT_TEMPLATE,
        subjectivePromptTemplate: subjectiveTemplate || DEFAULT_SUBJECTIVE_PROMPT_TEMPLATE
    };
    localStorage.setItem(PROMPT_TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
}

// 获取选择题提示词模板
export function getChoicePromptTemplate() {
    const templates = getPromptTemplates();
    return templates.choicePromptTemplate || DEFAULT_CHOICE_PROMPT_TEMPLATE;
}

// 获取主观题提示词模板
export function getSubjectivePromptTemplate() {
    const templates = getPromptTemplates();
    return templates.subjectivePromptTemplate || DEFAULT_SUBJECTIVE_PROMPT_TEMPLATE;
}

// 重置提示词模板为默认值
export function resetPromptTemplates() {
    localStorage.removeItem(PROMPT_TEMPLATES_STORAGE_KEY);
}

export { DEFAULT_API_URL, DEFAULT_API_MODEL, DEFAULT_CHOICE_PROMPT_TEMPLATE, DEFAULT_SUBJECTIVE_PROMPT_TEMPLATE };
