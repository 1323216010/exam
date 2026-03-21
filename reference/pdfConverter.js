// PDF 转图片模块 (从 document_to_image 复制)
let pdfjsLib = null;

// 动态加载 PDF.js 库
async function loadPdfJs() {
    if (pdfjsLib) return pdfjsLib;
    
    // 动态导入本地 PDF.js (按需加载)
    const script = document.createElement('script');
    script.src = './pdf.min.js';
    
    await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
    
    pdfjsLib = window.pdfjsLib;
    
    // 配置 worker (只在需要时加载)
    pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.js';
    
    return pdfjsLib;
}

// 转换 PDF 为图片数组 (Base64)
export async function convertPdfToBase64Images(file, options = {}) {
    const { scale = 2, onProgress = null } = options;
    
    // 按需加载 PDF.js
    const lib = await loadPdfJs();
    
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;
    const images = [];
    
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        if (onProgress) {
            onProgress({
                current: pageNum,
                total: numPages,
                percent: (pageNum / numPages) * 100
            });
        }
        
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;
        
        // 直接转换为 Base64
        const base64 = canvas.toDataURL('image/png');
        
        images.push({
            data: base64,
            name: `${file.name}_page_${pageNum}.png`,
            pageNum: pageNum
        });
    }
    
    return images;
}
