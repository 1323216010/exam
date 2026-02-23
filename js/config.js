// 试卷清单配置
// 从 exam-list.json 动态加载，使用 generate_exam_list.py 脚本生成

// 试卷列表（初始化时从 JSON 加载）
export let EXAM_LIST = [];

/**
 * 从 JSON 文件加载试卷列表
 * 使用方法: await loadExamList();
 */
export async function loadExamList() {
    try {
        const response = await fetch('json/exam-list.json');
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        EXAM_LIST.length = 0; // 清空数组
        EXAM_LIST.push(...data); // 填充新数据
        console.log(`✅ 已加载 ${EXAM_LIST.length} 套试卷`);
        return EXAM_LIST;
    } catch (error) {
        console.error('❌ 加载试卷列表失败:', error);
        throw error;
    }
}
