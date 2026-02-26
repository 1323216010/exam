// 答题页面主逻辑（精简版）
import { state, resetState } from './state.js';
import { EXAM_LIST, loadExamList } from './config.js';
import { shuffleArray, Timer, getFilenameFromPath } from './utils.js';
import { initChatDB, loadAllChatRecords } from './aiChatStorage.js';
import { openAiChatPanel, initAiChat } from './aiChat.js';
import { 
    saveProgress, 
    loadProgress, 
    clearProgress, 
    restoreProgress, 
    showProgressDialog 
} from './examProgress.js';
import { gradeSubjectiveQuestion } from './examGrading.js';
import { 
    generateQuestionNav, 
    updateNavStatus, 
    showQuestion, 
    selectOption, 
    saveTextAnswer 
} from './examDisplay.js';

// 计时器实例
let timer = null;

// ==================== 移动端侧边栏控制 ====================

function toggleMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');
    const menuBtn = document.getElementById('mobile-menu-btn');
    
    sidebar.classList.toggle('show');
    overlay.classList.toggle('show');
    menuBtn.classList.toggle('active');
}

function closeMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobile-overlay');
    const menuBtn = document.getElementById('mobile-menu-btn');
    
    sidebar.classList.remove('show');
    overlay.classList.remove('show');
    menuBtn.classList.remove('active');
}

function updateMobileMenuVisibility() {
    const menuBtn = document.getElementById('mobile-menu-btn');
    const examLayout = document.getElementById('exam-layout');
    const resultContainer = document.getElementById('result-container');
    
    const shouldShow = !examLayout.classList.contains('hidden') || 
                      resultContainer.classList.contains('show');
    
    if (shouldShow && window.innerWidth <= 768) {
        menuBtn.style.display = 'flex';
    } else {
        menuBtn.style.display = 'none';
    }
}

// ==================== 考试初始化 ====================

async function initExam(skipProgressCheck = false) {
    if (!state.examData || !state.examData.questions || state.examData.questions.length === 0) {
        alert('试题文件格式不正确或没有题目');
        return;
    }

    // 检查是否有保存的进度
    if (!skipProgressCheck) {
        const progress = loadProgress();
        if (progress) {
            const lastSaveDate = new Date(progress.lastSaveTime).toLocaleString('zh-CN');
            const answeredCount = Object.keys(progress.userAnswers).filter(key => {
                const answer = progress.userAnswers[key];
                return answer !== undefined && answer !== '' && 
                       !(Array.isArray(answer) && answer.length === 0);
            }).length;
            
            showProgressDialog({
                lastSaveDate,
                answeredCount,
                totalCount: state.examData.questions.length,
                onContinue: () => {
                    restoreProgress(progress);
                    continueInitExam();
                },
                onRestart: () => {
                    clearProgress();
                    continueInitExam();
                }
            });
            return;
        }
    } else {
        // 如果跳过进度检查，清除旧进度
        clearProgress();
    }

    continueInitExam();
}

// 继续初始化考试（内部函数）
async function continueInitExam() {
    // 如果没有恢复进度，重置状态
    if (!state.userAnswers || Object.keys(state.userAnswers).length === 0) {
        state.userAnswers = {};
        state.aiGradingDetails = {};
        state.aiExplainDetails = {};
        state.currentQuestionIndex = 0;
        state.showingResults = false;
        state.startTime = new Date();
    } else {
        // 恢复进度时，只重置评分相关状态
        state.aiGradingDetails = {};
        state.showingResults = false;
    }

    // 从 IndexedDB 加载聊天记录
    try {
        const savedChats = await loadAllChatRecords(state.examData);
        state.aiExplainDetails = savedChats || {};
    } catch (error) {
        console.error('加载聊天记录失败:', error);
        state.aiExplainDetails = {};
    }

    // 隐藏加载提示
    document.getElementById('exam-loading')?.classList.add('hidden');

    // 显示答题界面和侧边栏
    document.getElementById('result-container').classList.remove('show');
    document.getElementById('exam-layout').classList.remove('hidden');
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('restart-btn').style.display = 'none';

    // 更新移动端菜单显示
    updateMobileMenuVisibility();

    // 更新标题信息
    const filename = state.examData.filename || state.examData.exam_info?.title || '考试';
    document.getElementById('exam-header-title').textContent = filename;
    document.getElementById('exam-header-name').textContent = '';

    document.getElementById('total-count').textContent = state.examData.questions.length;

    // 生成题目导航
    generateQuestionNav();

    // 显示当前题目
    showQuestion(state.currentQuestionIndex);

    // 启动计时器
    startTimer();
}

// ==================== 答卷提交和评分 ====================

async function handleSubmit() {
    if (!state.examData || !state.examData.questions) {
        alert('请先加载试题');
        return;
    }

    const answeredCount = Object.keys(state.userAnswers).filter(key => {
        const answer = state.userAnswers[key];
        return answer !== undefined && answer !== '' && 
               !(Array.isArray(answer) && answer.length === 0);
    }).length;

    if (!confirm(`确定要提交答案吗？\n\n已答题数：${answeredCount} / ${state.examData.questions.length}`)) {
        return;
    }

    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = '正在评分...';

    try {
        await calculateResults();
    } catch (error) {
        alert('评分过程出错：' + error.message);
        submitBtn.disabled = false;
        submitBtn.textContent = '提交答卷';
    }
}

async function calculateResults() {
    stopTimer();

    let objectiveCorrectCount = 0;
    let subjectiveScoreRatioSum = 0;
    let subjectiveCount = 0;
    let totalScore = 0;
    let earnedScore = 0;

    const subjectiveQuestions = state.examData.questions.filter(q => !q.options);

    if (subjectiveQuestions.length > 0) {
        const progressDiv = document.createElement('div');
        progressDiv.id = 'ai-grading-progress';
        progressDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 30px 40px;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            z-index: 10000;
            text-align: center;
            min-width: 300px;
        `;
        progressDiv.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 15px;">🤖</div>
            <div style="font-size: 18px; font-weight: 600; color: #111827; margin-bottom: 10px;">AI 正在评阅主观题...</div>
            <div style="font-size: 14px; color: #6B7280; margin-bottom: 20px;">
                <span id="grading-current">0</span> / <span id="grading-total">${subjectiveQuestions.length}</span>
            </div>
            <div style="width: 100%; height: 6px; background: #E5E7EB; border-radius: 10px; overflow: hidden;">
                <div id="grading-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #10B981 0%, #06B6D4 100%); transition: width 0.3s;"></div>
            </div>
        `;
        document.body.appendChild(progressDiv);
    }

    for (let index = 0; index < state.examData.questions.length; index++) {
        const question = state.examData.questions[index];
        totalScore += question.score || 0;
        const userAnswer = state.userAnswers[index];
        const correctAnswer = question.answer;

        if (correctAnswer) {
            let scoreRatio = 0;

            if (Array.isArray(userAnswer)) {
                const isCorrect = userAnswer.length === correctAnswer.length && 
                           userAnswer.every(a => correctAnswer.includes(a));
                scoreRatio = isCorrect ? 1 : 0;
                if (isCorrect) objectiveCorrectCount++;
            } else if (typeof userAnswer === 'string') {
                if (question.options) {
                    const isCorrect = userAnswer === correctAnswer;
                    scoreRatio = isCorrect ? 1 : 0;
                    if (isCorrect) objectiveCorrectCount++;
                } else {
                    subjectiveCount++;
                    if (userAnswer.length > 0) {
                        try {
                            scoreRatio = await gradeSubjectiveQuestion(
                                question.content,
                                correctAnswer,
                                userAnswer,
                                index,
                                subjectiveQuestions.length
                            );
                            subjectiveScoreRatioSum += scoreRatio;
                        } catch (error) {
                            console.error('AI 评分失败:', error);
                            scoreRatio = 0.5;
                            subjectiveScoreRatioSum += 0.5;
                        }
                    } else {
                        scoreRatio = 0;
                    }
                }
            }

            earnedScore += (question.score || 0) * scoreRatio;
        }
    }

    const progressDiv = document.getElementById('ai-grading-progress');
    if (progressDiv) progressDiv.remove();

    earnedScore = Math.round(earnedScore * 10) / 10;

    const objectiveCount = state.examData.questions.filter(q => q.options).length;
    const objectiveAccuracy = objectiveCount > 0 
        ? Math.round((objectiveCorrectCount / objectiveCount) * 100) 
        : 0;
    
    const subjectiveAvgScore = subjectiveCount > 0
        ? Math.round((subjectiveScoreRatioSum / subjectiveCount) * 100)
        : 0;

    document.getElementById('result-score').textContent = earnedScore;
    document.getElementById('total-score').textContent = totalScore;
    
    if (subjectiveCount > 0) {
        document.getElementById('objective-correct').textContent = objectiveCorrectCount;
        document.getElementById('objective-total').textContent = objectiveCount;
        document.getElementById('objective-accuracy').textContent = objectiveAccuracy + '%';
        document.getElementById('subjective-score').textContent = subjectiveAvgScore + '%';
        document.getElementById('subjective-total').textContent = subjectiveCount;
        
        document.getElementById('has-subjective').style.display = 'grid';
        document.getElementById('no-subjective').style.display = 'none';
    } else {
        document.getElementById('objective-correct-2').textContent = objectiveCorrectCount;
        document.getElementById('objective-total-2').textContent = objectiveCount;
        document.getElementById('objective-accuracy-2').textContent = objectiveAccuracy + '%';
        
        document.getElementById('has-subjective').style.display = 'none';
        document.getElementById('no-subjective').style.display = 'grid';
    }

    document.getElementById('exam-layout').classList.add('hidden');
    document.getElementById('result-container').classList.add('show');

    updateMobileMenuVisibility();
    closeMobileSidebar();

    const submitBtn = document.getElementById('submit-btn');
    submitBtn.disabled = false;
    submitBtn.textContent = '提交答卷';
    
    // 提交后清除答题进度
    clearProgress();
}

// ==================== 结果查看和重新开始 ====================

function handleReview() {
    state.showingResults = true;
    document.getElementById('result-container').classList.remove('show');
    document.getElementById('exam-layout').classList.remove('hidden');
    document.getElementById('restart-btn').style.display = 'inline-block';
    document.getElementById('submit-btn').style.display = 'none';
    showQuestion(0);
    updateMobileMenuVisibility();
    closeMobileSidebar();
}

function restartExam() {
    if (confirm('确定要重新开始吗？当前答题记录将被清除。')) {
        initExam(true); // 跳过进度检查
    }
}

// ==================== 计时器 ====================

function startTimer() {
    if (timer) {
        timer.stop();
    }
    timer = new Timer(state.startTime, (timeStr) => {
        document.getElementById('time-display').textContent = timeStr;
    });
    timer.start();
}

function stopTimer() {
    if (timer) {
        timer.stop();
    }
}

// ==================== 试卷加载 ====================

async function startExam(filePath, filename = null) {
    try {
        const response = await fetch(filePath);
        if (!response.ok) throw new Error('无法加载试卷文件');
        
        state.examData = await response.json();
        if (filename) {
            state.examData.filename = filename;
        }
        initExam();
    } catch (error) {
        alert('加载试卷失败：' + error.message);
    }
}

async function loadAllQuestions(subjectFilter = null) {
    const allQuestions = [];
    
    for (const exam of EXAM_LIST) {
        if (subjectFilter && exam.subject !== subjectFilter) {
            continue;
        }
        
        try {
            const response = await fetch(exam.path);
            if (!response.ok) continue;
            
            const data = await response.json();
            if (data.questions && Array.isArray(data.questions)) {
                const filename = getFilenameFromPath(exam.path);
                data.questions.forEach(q => {
                    q.source = filename;
                    allQuestions.push(q);
                });
            }
        } catch (error) {
            console.error(`加载 ${exam.path} 失败:`, error);
        }
    }
    
    return allQuestions;
}

// ==================== URL参数处理 ====================

async function handleURLParams() {
    const params = new URLSearchParams(window.location.search);
    
    // 上传模式：从 localStorage 读取数据
    if (params.get('mode') === 'upload') {
        try {
            const examDataStr = localStorage.getItem('uploadedExamData');
            if (!examDataStr) {
                throw new Error('未找到上传的试题数据，请重新上传');
            }
            localStorage.removeItem('uploadedExamData');
            state.examData = JSON.parse(examDataStr);
            state.examData.filename = state.examData.filename || '上传试卷';
            initExam();
        } catch (error) {
            showLoadError(error.message);
        }
        return;
    }
    
    // 单个试卷模式
    if (params.has('exam')) {
        const examPath = params.get('exam');
        const filename = params.get('filename');
        await startExam(examPath, filename);
        return;
    }
    
    // 练习模式
    if (params.get('mode') === 'practice') {
        const randomOrder = params.get('random') === 'true';
        const limit = params.get('limit');
        const subject = params.get('subject');
        
        try {
            const allQuestions = await loadAllQuestions(subject);
            
            if (allQuestions.length === 0) {
                showLoadError('没有可用的题目');
                return;
            }
            
            let questions = allQuestions;
            if (limit && limit > 0) {
                questions = questions.slice(0, parseInt(limit));
            }
            
            if (randomOrder) {
                questions = shuffleArray(questions);
            }
            
            const subjectText = subject ? subject : '全部科目';
            const title = `题库练习 - ${subjectText} (${questions.length}题)`;
            state.examData = {
                filename: title,
                exam_info: {
                    title: title
                },
                questions: questions
            };
            
            initExam();
        } catch (error) {
            showLoadError('加载题库失败：' + error.message);
        }
        return;
    }
    
    // 自定义组卷模式
    if (params.get('mode') === 'custom') {
        const selectedIndices = params.get('exams').split(',').map(n => parseInt(n));
        const typeConfigs = JSON.parse(params.get('typeConfig'));
        const randomOrder = params.get('random') === 'true';
        const deduplicate = params.get('dedup') === 'true';
        
        try {
            let allQuestions = [];
            for (const index of selectedIndices) {
                const exam = EXAM_LIST[index];
                try {
                    const response = await fetch(exam.path);
                    if (!response.ok) continue;
                    
                    const data = await response.json();
                    if (data.questions && Array.isArray(data.questions)) {
                        const filename = getFilenameFromPath(exam.path);
                        data.questions.forEach(q => {
                            q.source = filename;
                            allQuestions.push(q);
                        });
                    }
                } catch (error) {
                    console.error(`加载 ${exam.path} 失败:`, error);
                }
            }
            
            // 按题型分组
            const questionsByType = {};
            allQuestions.forEach(q => {
                if (!questionsByType[q.question_type]) {
                    questionsByType[q.question_type] = [];
                }
                questionsByType[q.question_type].push(q);
            });
            
            // 去重处理
            if (deduplicate) {
                Object.keys(questionsByType).forEach(type => {
                    const seen = new Set();
                    questionsByType[type] = questionsByType[type].filter(q => {
                        const key = q.content + JSON.stringify(q.options || '');
                        if (seen.has(key)) return false;
                        seen.add(key);
                        return true;
                    });
                });
            }
            
            // 按题型数量抽取题目
            let finalQuestions = [];
            Object.keys(typeConfigs).forEach(type => {
                const count = typeConfigs[type];
                const questions = questionsByType[type] || [];
                
                if (questions.length === 0 || count === 0) return;
                
                if (randomOrder) {
                    shuffleArray(questions);
                }
                
                const selectedQuestions = count === -1 ? questions : questions.slice(0, count);
                finalQuestions.push(...selectedQuestions);
            });
            
            if (randomOrder) {
                finalQuestions = shuffleArray(finalQuestions);
            }
            
            if (finalQuestions.length === 0) {
                showLoadError('没有符合条件的题目');
                return;
            }
            
            const title = `自定义组卷 (${finalQuestions.length}题)`;
            
            state.examData = {
                filename: title,
                exam_info: {
                    title: title
                },
                questions: finalQuestions
            };
            
            initExam();
        } catch (error) {
            showLoadError('生成试卷失败：' + error.message);
        }
        return;
    }
    
    // 没有有效参数
    showLoadError('未找到有效的试题参数');
}

function showLoadError(message) {
    const loading = document.getElementById('exam-loading');
    if (loading) {
        loading.innerHTML = `
            <div style="font-size: 48px;">❌</div>
            <div style="margin: 16px 0;">${message}</div>
            <a href="index.html" style="color: #10B981; text-decoration: underline; font-size: 14px;">返回首页</a>
        `;
    }
}

// ==================== 页面初始化 ====================

async function initializeExamApp() {
    // 加载试卷列表（练习模式和自定义组卷需要）
    try {
        await loadExamList();
    } catch (error) {
        console.error('加载试卷列表失败:', error);
    }
    
    // 初始化侧边栏
    document.getElementById('question-nav').innerHTML = '';
    document.getElementById('answered-count').textContent = '0';
    document.getElementById('total-count').textContent = '0';
    
    // 移动端菜单控制
    document.getElementById('mobile-menu-btn').addEventListener('click', toggleMobileSidebar);
    document.getElementById('mobile-overlay').addEventListener('click', closeMobileSidebar);
    
    document.addEventListener('click', function(e) {
        if (e.target.closest('.question-nav-item') && window.innerWidth <= 768) {
            setTimeout(closeMobileSidebar, 300);
        }
    });
    
    window.addEventListener('resize', function() {
        updateMobileMenuVisibility();
        if (window.innerWidth > 768) {
            closeMobileSidebar();
        }
    });
    
    // 提交和查看按钮
    document.getElementById('submit-btn').addEventListener('click', handleSubmit);
    document.getElementById('review-btn').addEventListener('click', handleReview);
    document.getElementById('restart-btn').addEventListener('click', restartExam);
    document.getElementById('restart-result-btn').addEventListener('click', restartExam);
    
    // 初始化 AI 聊天面板
    initAiChat();
    
    // 页面卸载前保存进度
    window.addEventListener('beforeunload', () => {
        if (!state.showingResults && state.examData) {
            saveProgress();
        }
    });
    
    // 处理 URL 参数并加载试卷
    handleURLParams();
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
        await initChatDB().catch(err => console.error('IndexedDB 初始化失败:', err));
        initializeExamApp();
    });
} else {
    (async () => {
        await initChatDB().catch(err => console.error('IndexedDB 初始化失败:', err));
        initializeExamApp();
    })();
}
