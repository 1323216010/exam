// 工具函数

// 从路径中提取文件名（不含扩展名）
export function getFilenameFromPath(path) {
    if (typeof path !== 'string') return '';
    const normalized = path.split('?')[0];
    const filename = normalized.split(/[/\\]/).pop() || '';
    return filename.replace(/\.json$/i, '');
}

// 数组随机排序（Fisher-Yates 算法）
export function shuffleArray(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

// 格式化时间
export function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// 计时器管理
export class Timer {
    constructor(startTime, callback) {
        this.startTime = startTime;
        this.callback = callback;
        this.interval = null;
    }

    start() {
        this.interval = setInterval(() => {
            const elapsed = Math.floor((new Date() - this.startTime) / 1000);
            this.callback(formatTime(elapsed));
        }, 1000);
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
}
