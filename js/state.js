// 全局状态管理
export const state = {
    examData: null,
    currentQuestionIndex: 0,
    userAnswers: {},
    aiGradingDetails: {},
    showingResults: false,
    startTime: null,
    timerInterval: null,
    currentMode: null, // 'upload', 'exam-list', 'practice', 'custom'
    allExamData: [],
    selectedExams: []
};

// 重置状态
export function resetState() {
    state.examData = null;
    state.currentQuestionIndex = 0;
    state.userAnswers = {};
    state.aiGradingDetails = {};
    state.showingResults = false;
    state.startTime = null;
    state.currentMode = null;
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
}
