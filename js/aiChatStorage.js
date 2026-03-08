// AI 聊天记录的 IndexedDB 存储管理

const DB_NAME = 'ExamAIChatDB';
const DB_VERSION = 2;
const STORE_NAME = 'chatRecords';
const AI_EXAMS_STORE = 'aiGeneratedExams';

let db = null;

// 初始化数据库
export async function initChatDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const upgradeDb = event.target.result;
            
            // chatRecords store（版本 1 已有）
            if (!upgradeDb.objectStoreNames.contains(STORE_NAME)) {
                const objectStore = upgradeDb.createObjectStore(STORE_NAME, { keyPath: 'id' });
                objectStore.createIndex('examId', 'examId', { unique: false });
                objectStore.createIndex('examQuestion', ['examId', 'questionIndex'], { unique: true });
            }
            
            // aiGeneratedExams store（版本 2 新增）
            if (!upgradeDb.objectStoreNames.contains(AI_EXAMS_STORE)) {
                const aiStore = upgradeDb.createObjectStore(AI_EXAMS_STORE, { keyPath: 'id' });
                aiStore.createIndex('createdAt', 'createdAt', { unique: false });
                aiStore.createIndex('type', 'type', { unique: false });
            }
        };
    });
}

// ==================== AI 生成记录 CRUD ====================

// 保存 AI 生成的试卷记录
export async function saveAiGeneratedExam(record) {
    if (!db) await initChatDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([AI_EXAMS_STORE], 'readwrite');
        const store = transaction.objectStore(AI_EXAMS_STORE);
        const request = store.put(record);
        request.onsuccess = () => resolve(record);
        request.onerror = () => reject(request.error);
    });
}

// 获取所有 AI 生成记录（按时间倒序）
export async function getAllAiGeneratedExams() {
    if (!db) await initChatDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([AI_EXAMS_STORE], 'readonly');
        const store = transaction.objectStore(AI_EXAMS_STORE);
        const request = store.getAll();
        request.onsuccess = () => {
            const records = request.result || [];
            records.sort((a, b) => b.createdAt - a.createdAt);
            resolve(records);
        };
        request.onerror = () => reject(request.error);
    });
}

// 删除单条 AI 生成记录
export async function deleteAiGeneratedExam(id) {
    if (!db) await initChatDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([AI_EXAMS_STORE], 'readwrite');
        const store = transaction.objectStore(AI_EXAMS_STORE);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// 清空所有 AI 生成记录
export async function clearAllAiGeneratedExams() {
    if (!db) await initChatDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([AI_EXAMS_STORE], 'readwrite');
        const store = transaction.objectStore(AI_EXAMS_STORE);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// 获取当前考试的唯一标识
function getExamId(examData) {
    if (!examData) return null;
    // 优先使用 filename，其次使用 exam_info.title 作为唯一标识
    const identifier = examData.filename || examData.exam_info?.title || 'unknown_exam';
    // 将标识转换为安全的字符串格式
    return identifier.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_');
}

// 生成存储的唯一 ID
function generateRecordId(examId, questionIndex) {
    return `${examId}_q${questionIndex}`;
}

// 保存单个题目的聊天记录
export async function saveChatRecord(examData, questionIndex, messages, content) {
    if (!db) await initChatDB();
    
    const examId = getExamId(examData);
    if (!examId) {
        console.warn('无法获取考试 ID，跳过保存');
        return;
    }
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        const record = {
            id: generateRecordId(examId, questionIndex),
            examId: examId,
            questionIndex: questionIndex,
            messages: messages || [],
            content: content || '',
            lastUpdated: Date.now()
        };
        
        const request = store.put(record);
        request.onsuccess = () => resolve(record);
        request.onerror = () => reject(request.error);
    });
}

// 读取单个题目的聊天记录
export async function loadChatRecord(examData, questionIndex) {
    if (!db) await initChatDB();
    
    const examId = getExamId(examData);
    if (!examId) return null;
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        
        const recordId = generateRecordId(examId, questionIndex);
        const request = store.get(recordId);
        
        request.onsuccess = () => {
            const record = request.result;
            if (record) {
                resolve({
                    messages: record.messages || [],
                    content: record.content || ''
                });
            } else {
                resolve(null);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

// 读取当前考试的所有聊天记录
export async function loadAllChatRecords(examData) {
    if (!db) await initChatDB();
    
    const examId = getExamId(examData);
    if (!examId) return {};
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('examId');
        
        const request = index.getAll(examId);
        
        request.onsuccess = () => {
            const records = request.result;
            const chatDetails = {};
            
            records.forEach(record => {
                chatDetails[record.questionIndex] = {
                    messages: record.messages || [],
                    content: record.content || ''
                };
            });
            
            resolve(chatDetails);
        };
        request.onerror = () => reject(request.error);
    });
}

// 删除当前考试的所有聊天记录
export async function clearAllChatRecords(examData) {
    if (!db) await initChatDB();
    
    const examId = getExamId(examData);
    if (!examId) return 0;
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('examId');
        
        const request = index.getAllKeys(examId);
        
        request.onsuccess = () => {
            const keys = request.result;
            let deleteCount = 0;
            
            keys.forEach(key => {
                store.delete(key);
                deleteCount++;
            });
            
            transaction.oncomplete = () => resolve(deleteCount);
        };
        request.onerror = () => reject(request.error);
    });
}

// 删除单个题目的聊天记录
export async function deleteChatRecord(examData, questionIndex) {
    if (!db) await initChatDB();
    
    const examId = getExamId(examData);
    if (!examId) return;
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        const recordId = generateRecordId(examId, questionIndex);
        const request = store.delete(recordId);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// 获取数据库统计信息
export async function getChatStats() {
    if (!db) await initChatDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        
        const countRequest = store.count();
        
        countRequest.onsuccess = () => {
            resolve({
                totalRecords: countRequest.result
            });
        };
        countRequest.onerror = () => reject(countRequest.error);
    });
}

// 清除所有试卷的聊天记录
export async function clearAllChatDatabase() {
    if (!db) await initChatDB();
    
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        const request = store.clear();
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}
