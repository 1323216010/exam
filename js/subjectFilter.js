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

    return [...options.entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label));
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
