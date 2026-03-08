// 首页逻辑：模式选择、文件上传、面包屑导航
import { loadExamList } from './config.js';
import { renderExamList, filterExamList } from './examList.js';
import { 
    initPracticeSubjectFilter, startPracticeMode, updateSourceSummary, 
    switchPracticeTab, startAiMcqGeneration, startAiFillGeneration 
} from './practiceMode.js';
import { renderAiHistory } from './aiHistory.js';
import { loadCustomExamUI, selectAllExams, selectNoneExams, startCustomExam } from './customExam.js';
import { 
    showSettings, closeSettings, switchSettingsTab, addNewConfig, 
    saveSettings, savePromptTemplatesFromUI, testApiConnection 
} from './settings.js';
import { resetPromptTemplates } from './api.js';
import { initIcons } from './icons.js';

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
    
    // 试卷多选下拉交互
    const examMultiselectTrigger = document.getElementById('exam-multiselect-trigger');
    const examMultiselectDropdown = document.getElementById('exam-multiselect-dropdown');
    if (examMultiselectTrigger && examMultiselectDropdown) {
        examMultiselectTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            examMultiselectDropdown.classList.toggle('hidden');
        });
        // 点击外部关闭下拉
        document.addEventListener('click', (e) => {
            const wrap = document.getElementById('exam-multiselect');
            if (wrap && !wrap.contains(e.target)) {
                examMultiselectDropdown.classList.add('hidden');
            }
        });
    }

    // 试卷复选框变化时更新摘要
    const examGrid = document.getElementById('practice-exam-checkbox-grid');
    if (examGrid) examGrid.addEventListener('change', updateSourceSummary);

    // 练习模式按钮
    const btnStartPractice = document.getElementById('btn-start-practice');
    if (btnStartPractice) {
        btnStartPractice.addEventListener('click', startPracticeMode);
    }

    // 练习模式 Tab 切换
    document.querySelectorAll('.practice-mode-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.practiceTab;
            switchPracticeTab(tabName);
            // 切到历史 tab 时自动加载
            if (tabName === 'ai-history') renderAiHistory();
        });
    });

    // AI 生成按钮
    const btnStartAiMcq = document.getElementById('btn-start-ai-mcq');
    if (btnStartAiMcq) btnStartAiMcq.addEventListener('click', startAiMcqGeneration);
    const btnStartAiFill = document.getElementById('btn-start-ai-fill');
    if (btnStartAiFill) btnStartAiFill.addEventListener('click', startAiFillGeneration);
    
    // 练习模式题型快速选择：选择题 / 非选择题
    const btnSelectChoiceTypes = document.getElementById('btn-select-choice-types');
    const btnSelectSubjectiveTypes = document.getElementById('btn-select-subjective-types');
    if (btnSelectChoiceTypes) {
        btnSelectChoiceTypes.addEventListener('click', () => {
            document.querySelectorAll('.practice-type-checkbox').forEach(cb => {
                cb.checked = cb.value.includes('选');
            });
        });
    }
    if (btnSelectSubjectiveTypes) {
        btnSelectSubjectiveTypes.addEventListener('click', () => {
            document.querySelectorAll('.practice-type-checkbox').forEach(cb => {
                cb.checked = !cb.value.includes('选');
            });
        });
    }
    
    // 练习模式试卷快速选择
    const btnPracticeSelectAll = document.getElementById('btn-practice-select-all-exams');
    const btnPracticeSelectNone = document.getElementById('btn-practice-select-none-exams');
    if (btnPracticeSelectAll) {
        btnPracticeSelectAll.addEventListener('click', () => {
            document.querySelectorAll('.practice-exam-checkbox').forEach(cb => cb.checked = true);
            updateSourceSummary();
        });
    }
    if (btnPracticeSelectNone) {
        btnPracticeSelectNone.addEventListener('click', () => {
            document.querySelectorAll('.practice-exam-checkbox').forEach(cb => cb.checked = false);
            updateSourceSummary();
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
    document.addEventListener('DOMContentLoaded', () => { initializeApp(); initIcons(); });
} else {
    initializeApp(); initIcons();
}
