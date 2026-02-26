// AI评分模块
import { state } from './state.js';
import { getApiKey, getApiUrl, getApiModel } from './api.js';

// ==================== AI 主观题评分 ====================

export async function gradeSubjectiveQuestion(questionContent, referenceAnswer, userAnswer, currentIndex, totalSubjective) {
    const subjectiveIndex = state.examData.questions
        .slice(0, currentIndex + 1)
        .filter(q => !q.options)
        .length;
    
    const currentSpan = document.getElementById('grading-current');
    const progressBar = document.getElementById('grading-progress-bar');
    if (currentSpan) currentSpan.textContent = subjectiveIndex;
    if (progressBar) {
        progressBar.style.width = (subjectiveIndex / totalSubjective * 100) + '%';
    }

    try {
        const apiKey = getApiKey();
        if (!apiKey) {
            console.warn('未设置 API Key，使用默认评分');
            return 0.7;
        }

        let apiUrl = getApiUrl();
        let apiModel = getApiModel();
        
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: apiModel,
                messages: [
                    {
                        role: 'system',
                        content: '你是一个专业的考试评分助手。请根据参考答案评价学生答案的准确性和完整性，给出详细的评分依据。必须严格返回JSON格式，格式如下：{"score": 0.85, "reason": "评分理由", "strengths": "答案的优点", "weaknesses": "答案的不足", "suggestions": "改进建议"}。score为0-1之间的小数。'
                    },
                    {
                        role: 'user',
                        content: `题目：${questionContent}\n\n参考答案：${referenceAnswer}\n\n学生答案：${userAnswer}\n\n请评分并给出详细评价（必须返回JSON格式）：`
                    }
                ],
                temperature: 0.3,
                max_tokens: 3000
            })
        });

        if (!response.ok) {
            throw new Error('API 请求失败');
        }

        const data = await response.json();
        const resultText = data.choices[0].message.content.trim();
        
        let result;
        try {
            let jsonText = resultText;
            if (resultText.includes('```')) {
                const codeBlockMatch = resultText.match(/```(?:json)?\s*([\s\S]*?)```/);
                if (codeBlockMatch) {
                    jsonText = codeBlockMatch[1].trim();
                }
            }
            
            const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                result = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('未找到JSON格式');
            }
        } catch (parseError) {
            console.warn('AI 返回的JSON解析失败:', resultText);
            console.warn('解析错误:', parseError);
            const scoreMatch = resultText.match(/\d+\.?\d*/);
            const score = scoreMatch ? parseFloat(scoreMatch[0]) : 0.5;
            result = {
                score: score > 1 ? score / 100 : score,
                reason: `AI返回格式异常，原始内容：${resultText}`,
                strengths: '无法解析',
                weaknesses: '无法解析',
                suggestions: '请检查API设置或稍后重试'
            };
        }

        if (isNaN(result.score) || result.score < 0 || result.score > 1) {
            console.warn('AI 返回的分数无效:', result.score);
            result.score = 0.5;
        }

        state.aiGradingDetails[currentIndex] = result;
        return result.score;
    } catch (error) {
        console.error('AI 评分错误:', error);
        throw error;
    }
}
