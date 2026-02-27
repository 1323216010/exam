from openai import OpenAI
import os
import base64
from pathlib import Path
import json
import win32com.client
from pdf2image import convert_from_path
from tkinter import Tk, filedialog

# 初始化客户端
client = OpenAI(
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
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

def image_to_markdown(image_path, page_num):
    """使用 qwen3.5-plus 将单张图片转换为 markdown"""
    print(f"  正在处理第 {page_num} 页...", end="", flush=True)
    
    try:
        base64_image = encode_image(image_path)
        
        content = [
            {
                "type": "text", 
                "text": "请将图片中的所有内容转换为完整的 Markdown 格式。保持原文的结构和格式。"
            },
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{base64_image}"
                }
            }
        ]
        
        messages = [{"role": "user", "content": content}]
        
        completion = client.chat.completions.create(
            model="qwen3.5-plus",
            messages=messages,
            extra_body={"enable_thinking": True},
            stream=True
        )
        
        markdown_content = []
        
        for chunk in completion:
            delta = chunk.choices[0].delta
            
            if hasattr(delta, "content") and delta.content:
                markdown_content.append(delta.content)
        
        result = "".join(markdown_content)
        print(f" ✓ 完成 ({len(result)} 字符)")
        return result
        
    except Exception as e:
        print(f" ✗ 失败: {str(e)}")
        return None

def convert_doc_to_markdown_page_by_page(doc_path, output_path=None):
    """主函数：将文档逐页转换为 markdown，失败页面跳过"""
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
    
    # 步骤2: 逐页使用 AI 转换
    print("\n" + "=" * 60)
    print(f"步骤 2/3: 逐页使用 AI 识别并转换 (共 {len(image_paths)} 页)")
    print("=" * 60)
    
    all_markdown = []
    success_count = 0
    failed_pages = []
    
    for i, image_path in enumerate(image_paths, 1):
        markdown = image_to_markdown(image_path, i)
        
        if markdown:
            all_markdown.append(f"\n\n---\n**页面 {i}**\n\n{markdown}")
            success_count += 1
        else:
            failed_pages.append(i)
            all_markdown.append(f"\n\n---\n**页面 {i}** (转换失败，已跳过)\n\n")
    
    # 步骤3: 保存结果
    print("\n" + "=" * 60)
    print("步骤 3/3: 保存结果")
    print("=" * 60)
    
    final_markdown = "".join(all_markdown)
    
    if output_path is None:
        output_path = doc_path.with_suffix('.md')
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(final_markdown)
    
    print(f"✓ Markdown 已保存: {output_path}")
    print(f"  总页数: {len(image_paths)}")
    print(f"  成功转换: {success_count} 页")
    print(f"  失败跳过: {len(failed_pages)} 页")
    if failed_pages:
        print(f"  失败页面: {', '.join(map(str, failed_pages))}")
    print(f"  总字符数: {len(final_markdown)}")

if __name__ == "__main__":
    # 创建文件选择对话框
    root = Tk()
    root.withdraw()  # 隐藏主窗口
    
    print("请选择要转换的文件...")
    doc_file = filedialog.askopenfilename(
        title="选择文档文件",
        filetypes=[
            ("文档文件", "*.doc *.docx *.pdf"),
            ("Word 文档", "*.doc *.docx"),
            ("PDF 文件", "*.pdf"),
            ("所有文件", "*.*")
        ]
    )
    
    if doc_file:
        print(f"已选择文件: {Path(doc_file).name}\n")
        convert_doc_to_markdown_page_by_page(doc_file)
    else:
        print("未选择文件，程序退出。")
