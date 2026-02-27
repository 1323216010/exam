from openai import OpenAI
import os
import json
from pathlib import Path
from tkinter import Tk, filedialog

AI_MODEL = "gpt-4.1"  # 可修改为其他模型

# 初始化客户端
client = OpenAI(
    api_key=os.getenv("YINLI_API_KEY"),
    base_url="https://yinli.one/v1",
)

def markdown_to_json(markdown_path, output_path=None):
    """
    使用大模型将 Markdown 格式的试题转换为 JSON 格式
    """
    markdown_path = Path(markdown_path)
    
    if not markdown_path.exists():
        print(f"错误: 文件不存在 - {markdown_path}")
        return
    
    # 读取 Markdown 文件
    print("=" * 60)
    print(f"正在读取文件: {markdown_path.name}")
    print("=" * 60)
    
    with open(markdown_path, 'r', encoding='utf-8') as f:
        markdown_content = f.read()
    
    print(f"✓ 文件读取完成 ({len(markdown_content)} 字符)\n")
    
    # 构建提示词
    prompt = """请将以下 Markdown 格式的试题转换为 JSON 格式。

要求：
1. 识别试题中的所有题型（单项选择题、多项选择题、简答题、论述题等）
2. 对于每道题目，提取题号、题型、题目内容、选项（如果有）、答案（如果有）、分值（如果有）
3. 保持题目的完整性和准确性
4. 输出符合以下格式的 JSON

JSON 格式要求：
{
  "exam_info": {
    "title": "考试标题",
    "subject": "科目名称",
    "code": "课程代码",
    "date": "考试日期"
  },
  "questions": [
    {
      "question_number": "1",
      "question_type": "单项选择题",
      "content": "题目内容",
      "options": {
        "A": "选项A",
        "B": "选项B",
        "C": "选项C",
        "D": "选项D"
      },
      "answer": "B",
      "score": 1
    },
    {
      "question_number": "31",
      "question_type": "多项选择题",
      "content": "题目内容",
      "options": {
        "A": "选项A",
        "B": "选项B",
        "C": "选项C",
        "D": "选项D"
      },
      "answer": "ABCD",
      "score": 2
    },
    {
      "question_number": "41",
      "question_type": "简答题",
      "content": "题目内容",
      "answer": "答案内容",
      "score": 6
    }
  ]
}

Markdown 内容：

"""
    
    # 调用 AI
    print("=" * 60)
    print("正在调用 AI 进行转换...")
    print("=" * 60)
    
    try:
        messages = [
            {
                "role": "user",
                "content": prompt + markdown_content
            }
        ]
        
        completion = client.chat.completions.create(
            model=AI_MODEL,
            messages=messages,
            response_format={"type": "json_object"},
            stream=True
        )
        
        json_content = []
        print("正在接收响应...", flush=True)
        
        for chunk in completion:
            # 检查 choices 是否存在且不为空
            if not chunk.choices:
                continue
            
            delta = chunk.choices[0].delta
            
            if hasattr(delta, "content") and delta.content:
                json_content.append(delta.content)
                print(".", end="", flush=True)
        
        print("\n✓ 响应接收完成\n")
        
        # 合并结果
        result = "".join(json_content)
        
        # 尝试提取 JSON（如果 AI 返回了额外的文字说明）
        # 查找第一个 { 和最后一个 }
        start_idx = result.find('{')
        end_idx = result.rfind('}')
        
        if start_idx != -1 and end_idx != -1:
            json_str = result[start_idx:end_idx+1]
        else:
            json_str = result
        
        # 验证 JSON 格式
        print("=" * 60)
        print("正在验证 JSON 格式...")
        print("=" * 60)
        
        try:
            json_obj = json.loads(json_str)
            print("✓ JSON 格式验证通过\n")
            
            # 显示统计信息
            if "questions" in json_obj:
                question_count = len(json_obj["questions"])
                print(f"  总题目数: {question_count}")
                
                # 按题型统计
                type_counts = {}
                for q in json_obj["questions"]:
                    qtype = q.get("question_type", "未知")
                    type_counts[qtype] = type_counts.get(qtype, 0) + 1
                
                print("  题型分布:")
                for qtype, count in type_counts.items():
                    print(f"    - {qtype}: {count} 题")
        
        except json.JSONDecodeError as e:
            print(f"⚠ JSON 格式验证失败: {e}")
            print("将保存原始输出，请手动检查")
        
        # 保存结果
        print("\n" + "=" * 60)
        print("正在保存 JSON 文件...")
        print("=" * 60)
        
        if output_path is None:
            output_path = markdown_path.with_suffix('.json')
        
        with open(output_path, 'w', encoding='utf-8') as f:
            if 'json_obj' in locals():
                # 如果解析成功，保存格式化的 JSON
                json.dump(json_obj, f, ensure_ascii=False, indent=2)
            else:
                # 否则保存原始字符串
                f.write(json_str)
        
        print(f"✓ JSON 文件已保存: {output_path}")
        print(f"  文件大小: {output_path.stat().st_size} 字节")
        
        return output_path
        
    except Exception as e:
        print(f"✗ 转换失败: {str(e)}")
        return None

def batch_convert(directory, pattern="*.md"):
    """
    批量转换目录下的所有 Markdown 文件
    """
    directory = Path(directory)
    md_files = list(directory.glob(pattern))
    
    if not md_files:
        print(f"在 {directory} 中没有找到匹配 {pattern} 的文件")
        return
    
    print(f"找到 {len(md_files)} 个文件，开始批量转换...\n")
    
    success_count = 0
    failed_files = []
    
    for i, md_file in enumerate(md_files, 1):
        print(f"\n{'=' * 60}")
        print(f"[{i}/{len(md_files)}] 正在处理: {md_file.name}")
        print(f"{'=' * 60}\n")
        
        result = markdown_to_json(md_file)
        
        if result:
            success_count += 1
        else:
            failed_files.append(md_file.name)
    
    # 输出汇总
    print("\n" + "=" * 60)
    print("批量转换完成")
    print("=" * 60)
    print(f"  总文件数: {len(md_files)}")
    print(f"  成功转换: {success_count}")
    print(f"  失败数量: {len(failed_files)}")
    
    if failed_files:
        print(f"  失败文件:")
        for fname in failed_files:
            print(f"    - {fname}")

if __name__ == "__main__":
    # 创建文件选择对话框
    root = Tk()
    root.withdraw()  # 隐藏主窗口
    
    print("请选择要转换的 Markdown 文件（可多选）...")
    md_files = filedialog.askopenfilenames(
        title="选择 Markdown 文件（可多选）",
        filetypes=[
            ("Markdown 文件", "*.md"),
            ("所有文件", "*.*")
        ]
    )
    
    if md_files:
        print(f"已选择 {len(md_files)} 个文件\n")
        
        success_count = 0
        failed_files = []
        
        for i, md_file in enumerate(md_files, 1):
            if len(md_files) > 1:
                print(f"\n{'=' * 60}")
                print(f"[{i}/{len(md_files)}] 正在处理: {Path(md_file).name}")
                print(f"{'=' * 60}\n")
            else:
                print(f"正在处理: {Path(md_file).name}\n")
            
            result = markdown_to_json(md_file)
            
            if result:
                success_count += 1
            else:
                failed_files.append(Path(md_file).name)
        
        # 如果是多文件，输出汇总
        if len(md_files) > 1:
            print("\n" + "=" * 60)
            print("全部转换完成")
            print("=" * 60)
            print(f"  总文件数: {len(md_files)}")
            print(f"  成功转换: {success_count}")
            print(f"  失败数量: {len(failed_files)}")
            
            if failed_files:
                print(f"  失败文件:")
                for fname in failed_files:
                    print(f"    - {fname}")
    else:
        print("未选择文件，程序退出。")
