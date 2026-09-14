import { getSubjectDisplayName } from './utils.js';

// 同一科目在不同年份可能使用不同课程代码。
// 筛选时将这些代码归为一个选项，但保留试卷自身的原始代码用于展示。
const SUBJECT_GROUPS = [
    {
        value: '12656,15041',
        label: '毛概',
        subjects: ['12656', '15041']
    }
];

export function getSubjectFilterOptions(exams) {
    const options = new Map();

    exams.forEach(exam => {
        const subject = exam.subject;
        if (!subject) return;

        const group = SUBJECT_GROUPS.find(item => item.subjects.includes(subject));
        const value = group ? group.value : subject;
        const label = group ? group.label : getSubjectDisplayName(subject);
        options.set(value, label);
    });

    const preferredOrder = ['00312', '12656,15041', '00341', '00292', '00318', '03333', '00040'];

    return [...options.entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => {
            const indexA = preferredOrder.indexOf(a.value);
            const indexB = preferredOrder.indexOf(b.value);
            if (indexA !== -1 || indexB !== -1) {
                return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
            }
            return a.label.localeCompare(b.label, 'zh');
        });
}

export function matchesSubjectFilter(subject, filterValue) {
    if (!filterValue) return true;

    const group = SUBJECT_GROUPS.find(item =>
        item.value === filterValue || item.subjects.includes(filterValue)
    );

    return group ? group.subjects.includes(subject) : subject === filterValue;
}

export function getSubjectFilterLabel(filterValue) {
    const group = SUBJECT_GROUPS.find(item =>
        item.value === filterValue || item.subjects.includes(filterValue)
    );
    return group ? group.label : getSubjectDisplayName(filterValue);
}

export function getSubjectGroupValue(subject) {
    const group = SUBJECT_GROUPS.find(item => item.subjects.includes(subject));
    return group ? group.value : (subject || '');
}

const SUBJECT_CHIP_STYLES = {
    '00312': { bg: '#DBEAFE', color: '#1E40AF', accent: '#60A5FA' },
    '12656,15041': { bg: '#FCE7F3', color: '#BE185D', accent: '#F472B6' },
    '00341': { bg: '#FEF3C7', color: '#B45309', accent: '#FBBF24' },
    '00292': { bg: '#EDE9FE', color: '#6D28D9', accent: '#A78BFA' },
    '00318': { bg: '#CCFBF1', color: '#0F766E', accent: '#2DD4BF' },
    '03333': { bg: '#E0F2FE', color: '#075985', accent: '#38BDF8' },
    '00040': { bg: '#FFEDD5', color: '#9A3412', accent: '#FB923C' }
};

export function getSubjectChip(subject) {
    const value = getSubjectGroupValue(subject);
    const style = SUBJECT_CHIP_STYLES[value] || { bg: '#F3F4F6', color: '#374151', accent: '#9CA3AF' };

    return {
        value,
        label: getSubjectFilterLabel(value || subject),
        ...style
    };
}

export function groupExamsBySubject(exams) {
    const grouped = new Map();

    exams.forEach(exam => {
        const value = getSubjectGroupValue(exam.subject);
        if (!value) return;

        if (!grouped.has(value)) {
            grouped.set(value, {
                value,
                label: getSubjectFilterLabel(value),
                exams: []
            });
        }
        grouped.get(value).exams.push(exam);
    });

    return getSubjectFilterOptions(exams)
        .map(option => grouped.get(option.value))
        .filter(Boolean);
}

export function bindSubjectTabs(tabContainer, selectEl, exams, { allLabel = '全部' } = {}) {
    if (!tabContainer || !selectEl) return;

    const options = getSubjectFilterOptions(exams);
    const current = selectEl.value;

    selectEl.innerHTML = '<option value="">全部科目</option>';
    options.forEach(({ value, label }) => {
        selectEl.innerHTML += `<option value="${value}">${label}</option>`;
    });
    if ([...selectEl.options].some(option => option.value === current)) {
        selectEl.value = current;
    }
    selectEl.classList.add('hidden');
    selectEl.setAttribute('aria-hidden', 'true');
    selectEl.tabIndex = -1;

    tabContainer.replaceChildren();
    tabContainer.classList.add('subject-tabs');
    tabContainer.setAttribute('role', 'tablist');

    [{ value: '', label: allLabel }, ...options].forEach(({ value, label }) => {
        const button = document.createElement('button');
        const active = selectEl.value === value;
        button.type = 'button';
        button.className = 'subject-tab' + (active ? ' is-active' : '');
        button.textContent = label;
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-selected', active ? 'true' : 'false');
        button.addEventListener('click', () => {
            if (selectEl.value === value) return;
            selectEl.value = value;
            tabContainer.querySelectorAll('.subject-tab').forEach(tab => {
                const isActive = tab === button;
                tab.classList.toggle('is-active', isActive);
                tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });
            selectEl.dispatchEvent(new Event('change'));
        });
        tabContainer.appendChild(button);
    });
}
