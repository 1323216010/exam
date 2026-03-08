// 自定义组卷功能
import { EXAM_LIST } from './config.js';
import { getFilenameFromPath } from './utils.js';

export function loadCustomExamUI() {
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

export function filterCustomExamList() {
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
        const filename = getFilenameFromPath(exam.file || exam.path);
        item.innerHTML = `
            <input type="checkbox" value="${originalIndex}" class="exam-checkbox">
            <span>${filename}</span>
        `;
        checkboxGrid.appendChild(item);
    });
}

async function loadQuestionTypes() {
    try {
        const response = await fetch(EXAM_LIST[0].file || EXAM_LIST[0].path);
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

export function selectAllExams() {
    document.querySelectorAll('.exam-checkbox').forEach(cb => cb.checked = true);
}

export function selectNoneExams() {
    document.querySelectorAll('.exam-checkbox').forEach(cb => cb.checked = false);
}

export function startCustomExam() {
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
