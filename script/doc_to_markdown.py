from openai import OpenAI
import os
import base64
from pathlib import Path
import json
import win32com.client
from pdf2image import convert_from_path
from tkinter import Tk, filedialog
from PIL import Image

# 解除 PIL 图片大小限制（防止 DecompressionBombError）
Image.MAX_IMAGE_PIXELS = None

# 配置 AI 模型
AI_MODEL = "gpt-4.1"  # 可修改为其他模型

# 初始化客户端
client = OpenAI(
    api_key=os.getenv("YINLI_API_KEY"),
    base_url="https://yinli.one/v1"
)

def document_to_images(doc_path):
    """
    将 .doc/.docx/.pdf 文件转换为图片
    需要先安装: pip install pywin32 pillow pdf2image
    Windows 上还需要安装 poppler: https://github.com/oschwartz10612/poppler-windows/releases/
    """
    doc_path = Path(doc_path).absolute()
    file_ext = doc_path.suffix.lower()
    
    # 判断文件类型
    if file_ext == '.pdf':
        # 如果是 PDF，直接转换为图片
        print(f"正在将 PDF 文件 {doc_path.name} 转换为图片...")
        pdf_path = doc_path
    elif file_ext in ['.doc', '.docx']:
        # 如果是 Word 文档，先转换为 PDF
        pdf_path = doc_path.with_suffix('.pdf')
        print(f"正在将 {doc_path.name} 转换为 PDF...")
        word = win32com.client.Dispatch("Word.Application")
        word.Visible = False
        
        try:
            doc = word.Documents.Open(str(doc_path))
            doc.SaveAs(str(pdf_path), FileFormat=17)  # 17 = wdFormatPDF
            doc.Close()
        finally:
            word.Quit()
        
        print(f"PDF 已保存: {pdf_path}")
    else:
        raise ValueError(f"不支持的文件格式: {file_ext}")
    
    # 将 PDF 转换为图片
    print("正在将 PDF 转换为图片...")
    images = convert_from_path(str(pdf_path), dpi=200)
    
    # 保存图片
    image_paths = []
    images_dir = doc_path.parent / f"{doc_path.stem}_images"
    images_dir.mkdir(exist_ok=True)
    
    for i, image in enumerate(images):
        image_path = images_dir / f"page_{i+1}.png"
        image.save(image_path, 'PNG')
        image_paths.append(image_path)
        print(f"  - 页面 {i+1} 已保存: {image_path.name}")
    
    return image_paths

def encode_image(image_path):
    """读取图片并转换为 base64"""
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def images_to_markdown(image_paths):
    """使用 qwen3.5-plus 将多张图片一次性转换为 markdown"""
    print(f"\n正在处理 {len(image_paths)} 页文档...")
    
    # 构建 content 列表：一个文本提示 + 多个图片
    content = [
        {
            "type": "text",
            "text": (
                "请将图片中的所有内容转换为完整的 Markdown 格式文档。"
                "如遇明显笔误，请自动修正。"
                "若不确定是否为笔误，请保持原样，不要擅自改动。"
            )
        }
    ]
    
    # 添加所有图片
    for i, image_path in enumerate(image_paths, 1):
        base64_image = encode_image(image_path)
        content.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:image/png;base64,{base64_image}"
            }
        })
        print(f"  已加载第 {i} 页")
    
    messages = [{"role": "user", "content": content}]
    
    print("\n  正在调用 AI 处理...")
    completion = client.chat.completions.create(
        model=AI_MODEL,
        messages=messages,
        extra_body={"enable_thinking": True},
        stream=True
    )
    
    is_answering = False
    markdown_content = []
    
    print("  思考中...", end="", flush=True)
    
    for chunk in completion:
        if not chunk.choices:
            continue
        delta = chunk.choices[0].delta
        
        # 输出思考过程(可选)
        if hasattr(delta, "reasoning_content") and delta.reasoning_content is not None:
            print(delta.reasoning_content, end="", flush=True)
        
        if hasattr(delta, "content") and delta.content:
            if not is_answering:
                print("\r  生成中...", end="", flush=True)
                is_answering = True
            markdown_content.append(delta.content)
            print(delta.content, end="", flush=True)
    
    result = "".join(markdown_content)
    print(f"\r  ✓ 完成     ")
    return result

def convert_doc_to_markdown(doc_path, output_path=None):
    """主函数：将 .doc 转换为 markdown"""
    doc_path = Path(doc_path)
    
    if not doc_path.exists():
        print(f"错误: 文件不存在 - {doc_path}")
        return
    
    # 步骤1: 转换为图片
    print("=" * 60)
    print("步骤 1/3: 将文档转换为图片")
    print("=" * 60)
    image_paths = document_to_images(doc_path)
    
    if not image_paths:
        print("转换图片失败，无法继续")
        return
    
    # 步骤2: 使用 AI 一次性转换所有页面
    print("\n" + "=" * 60)
    print(f"步骤 2/3: 使用 AI 识别并转换 ({len(image_paths)} 页)")
    print("=" * 60)
    
    final_markdown = images_to_markdown(image_paths)
    
    # 步骤3: 保存结果
    print("\n" + "=" * 60)
    print("步骤 3/3: 保存结果")
    print("=" * 60)
    
    if output_path is None:
        output_path = doc_path.with_suffix('.md')
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(final_markdown)
    
    print(f"✓ Markdown 已保存: {output_path}")
    print(f"  总页数: {len(image_paths)}")
    print(f"  总字符数: {len(final_markdown)}")

if __name__ == "__main__":
    # 创建文件选择对话框
    root = Tk()
    root.withdraw()  # 隐藏主窗口
    
    print("请选择要转换的文件 (可多选)...")
    doc_files = filedialog.askopenfilenames(
        title="选择文档文件 (可多选)",
        filetypes=[
            ("文档文件", "*.doc *.docx *.pdf"),
            ("Word 文档", "*.doc *.docx"),
            ("PDF 文件", "*.pdf"),
            ("所有文件", "*.*")
        ]
    )
    
    if doc_files:
        print(f"已选择 {len(doc_files)} 个文件\n")
        for i, doc_file in enumerate(doc_files, 1):
            print(f"\n{'='*60}")
            print(f"处理文件 {i}/{len(doc_files)}: {Path(doc_file).name}")
            print(f"{'='*60}")
            convert_doc_to_markdown(doc_file)
    else:
        print("未选择文件，程序退出。")
