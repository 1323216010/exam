#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
自动生成试卷列表配置文件
扫描 exam/json/ 目录下所有子目录中的 JSON 文件
生成 exam/json/exam-list.json 供前端使用
"""

import json
import re
from pathlib import Path

def parse_filename(filename):
    # 匹配模式: 5位数字开头的 JSON 文件
    pattern = r'^(\d{5})'
    match = re.match(pattern, filename)
    
    if not match:
        return None
    
    code = match.group(1)
    
    return {
        'code': code,
        'filename': filename
    }

def generate_exam_list():
    """扫描目录并生成试卷列表"""
    # 定义路径（基于脚本文件位置）
    script_dir = Path(__file__).parent
    json_dir = script_dir.parent / 'json'
    output_file = json_dir / 'exam-list.json'
    
    if not json_dir.exists():
        print(f"错误: 目录 {json_dir} 不存在")
        return
    
    exams = []
    
    # 遍历所有子目录
    for subdir in sorted(json_dir.iterdir()):
        if not subdir.is_dir():
            continue
        
        print(f"扫描目录: {subdir.name}")
        
        # 遍历子目录中的所有 JSON 文件
        for json_file in sorted(subdir.glob('*.json')):  
            # 构建相对路径（从 exam/ 开始）
            relative_path = f"json/{subdir.name}/{json_file.name}"
            
            exam_entry = {
                'file': relative_path,
                'subject': subdir.name,  # 使用文件夹名称作为科目标识
            }
            
            # 读取 exam_info 和题目数量，避免前端逐个请求
            try:
                with open(json_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                exam_entry['exam_info'] = data.get('exam_info', {})
                exam_entry['question_count'] = len(data.get('questions', []))
            except Exception as e:
                print(f"  ⚠ 读取 {json_file.name} 失败: {e}")
            
            exams.append(exam_entry)
    
    # 写入 JSON 文件
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(exams, f, ensure_ascii=False, indent=2)
    
    print(f"\n✅ 成功生成 {output_file}")
    print(f"📊 共 {len(exams)} 套试卷")
    
    # 统计科目数量
    subjects = {}
    for exam in exams:
        subjects[exam['subject']] = subjects.get(exam['subject'], 0) + 1
    
    print("\n科目统计:")
    for subject, count in subjects.items():
        print(f"  • {subject}: {count} 套")

if __name__ == '__main__':
    generate_exam_list()
