// API Key 和 URL 管理
const API_KEY_STORAGE_KEY = 'exam_system_api_key';
const API_URL_STORAGE_KEY = 'exam_system_api_url';
const API_MODEL_STORAGE_KEY = 'exam_system_api_model';
const DEFAULT_API_URL = 'https://proxy-hazel-theta-17.vercel.app/qwen/chat/completions';
const DEFAULT_API_MODEL = 'qwen3.5-plus';

export function getApiKey() {
    return localStorage.getItem(API_KEY_STORAGE_KEY) || '';
}

export function saveApiKey(apiKey) {
    localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
}

export function getApiUrl() {
    return localStorage.getItem(API_URL_STORAGE_KEY) || DEFAULT_API_URL;
}

export function saveApiUrl(apiUrl) {
    localStorage.setItem(API_URL_STORAGE_KEY, apiUrl);
}

export function getApiModel() {
    return localStorage.getItem(API_MODEL_STORAGE_KEY) || DEFAULT_API_MODEL;
}

export function saveApiModel(apiModel) {
    localStorage.setItem(API_MODEL_STORAGE_KEY, apiModel);
}

export { DEFAULT_API_URL, DEFAULT_API_MODEL };
