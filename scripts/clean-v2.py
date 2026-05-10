"""
导游词 docx 清洗脚本 v2
从中间 JSON 读取原始段落 → 生成带 sections 结构的 data JSON
"""
import json, os, re

INTERMEDIATE = os.path.join(os.path.dirname(__file__), "intermediate")
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

# ── 配置：6 个景点的 ID / 标题 / 是否混合格式 ──
SITES = [
    {"id": "tiantan",   "title_zh": "天坛",       "title_en": "The Temple of Heaven",                 "mixed": False},
    {"id": "gugong",    "title_zh": "故宫博物院",   "title_en": "The Palace Museum (Forbidden City)",    "mixed": False},
    {"id": "yiheyuan",  "title_zh": "颐和园",       "title_en": "The Summer Palace",                     "mixed": False},
    {"id": "shisanling","title_zh": "明十三陵",     "title_en": "The Ming Tombs",                        "mixed": False},
    {"id": "changcheng","title_zh": "长城",         "title_en": "The Great Wall",                        "mixed": False},
    {"id": "damen",     "title_zh": "天安门广场与中轴线", "title_en": "Tian'anmen Square & Central Axis", "mixed": True},
]


# ═══════════════════════════════════════════
#  工具函数
# ═══════════════════════════════════════════

def is_cjk(ch):
    """判断字符是否 CJK"""
    cp = ord(ch)
    return (0x4E00 <= cp <= 0x9FFF or 0x3400 <= cp <= 0x4DBF or
            0x3000 <= cp <= 0x303F or 0xFF00 <= cp <= 0xFFEF or
            0x2F00 <= cp <= 0x2FDF or 0x3100 <= cp <= 0x312F)


def starts_with_cjk(text):
    """首非空白字符是否 CJK"""
    for ch in text:
        if ch.strip():
            return is_cjk(ch)
    return False


def has_cjk(text):
    return any(is_cjk(ch) for ch in text)


def is_heading_standard(para):
    """标准格式：包含 ' / ' 分隔符且不算太长 → 标题"""
    return " / " in para and len(para) < 200


def split_heading(para):
    """按 ' / ' 拆分标题 → (zh, en)"""
    parts = para.split(" / ", 1)
    zh = parts[0].strip() if len(parts) > 0 else ""
    en = parts[1].strip() if len(parts) > 1 else ""
    return zh, en


def detect_lang(text):
    """返回 'zh' 或 'en'——基于 CJK 字符占比而非首字符"""
    cjk_count = sum(1 for ch in text if is_cjk(ch))
    # 至少 3 个 CJK 字符且占比 > 15% → 中文
    return "zh" if (cjk_count >= 3 and cjk_count / max(len(text), 1) > 0.15) else "en"


def pair_alternating(paragraphs):
    """
    中英交替段落配对：CJK 段落 + 下一个非 CJK 段落 → {en, zh}
    如果连续两个同语言，则前一个单独成对。
    """
    pairs = []
    i = 0
    while i < len(paragraphs):
        lang = detect_lang(paragraphs[i])
        if lang == "zh" and i + 1 < len(paragraphs) and detect_lang(paragraphs[i + 1]) == "en":
            pairs.append({"en": paragraphs[i + 1].strip(), "zh": paragraphs[i].strip()})
            i += 2
        elif lang == "en" and i + 1 < len(paragraphs) and detect_lang(paragraphs[i + 1]) == "zh":
            pairs.append({"en": paragraphs[i].strip(), "zh": paragraphs[i + 1].strip()})
            i += 2
        elif lang == "zh":
            pairs.append({"en": "", "zh": paragraphs[i].strip()})
            i += 1
        else:
            pairs.append({"en": paragraphs[i].strip(), "zh": ""})
            i += 1
    return pairs


# ── 句子拆分 ──

def split_en_sentences(text):
    if not text: return []
    raw = re.split(r"(?<=[.!?])\s+", text)
    return [s.strip() for s in raw if s.strip()]


def split_zh_sentences(text):
    if not text: return []
    raw = re.split(r"(?<=[。！？])", text)
    return [s.strip() for s in raw if s.strip()]


def word_count(en):
    return len([w for w in en.split() if re.search(r"[A-Za-z]", w)])


def merge_short(en_sents, zh_sents):
    """英文 < 5 词自动与下一句合并"""
    en_out, zh_out = [], []
    i = 0
    while i < len(en_sents):
        en = en_sents[i]
        zh = zh_sents[i] if i < len(zh_sents) else ""
        while word_count(en) < 5 and i + 1 < len(en_sents):
            i += 1
            en += " " + en_sents[i]
            zh += (zh_sents[i] if i < len(zh_sents) else "")
        en_out.append(en)
        zh_out.append(zh)
        i += 1
    return en_out, zh_out


def build_sentences(paragraph_pairs):
    """从段落对构建句子数组"""
    result = []
    for pair in paragraph_pairs:
        en_sents = split_en_sentences(pair["en"])
        zh_sents = split_zh_sentences(pair["zh"])
        merged_en, merged_zh = merge_short(en_sents, zh_sents)
        for j in range(max(len(merged_en), len(merged_zh))):
            result.append({
                "en": merged_en[j] if j < len(merged_en) else "",
                "zh": merged_zh[j] if j < len(merged_zh) else "",
            })
    return result


# ═══════════════════════════════════════════
#  格式一：标准交替格式（5 个文件）
# ═══════════════════════════════════════════

def clean_standard(paras):
    """标准格式：标题含 ' / '，内容严格中英交替"""
    # 去掉首尾空段落
    while paras and not paras[0]: paras.pop(0)
    while paras and not paras[-1]: paras.pop()

    # 找到所有标题的位置
    title_para = paras[0]  # 景点标题
    sections = []
    current_heading_zh, current_heading_en = "", ""
    current_content = []

    for i, p in enumerate(paras):
        if i == 0:  # 景点标题，跳过
            continue
        if is_heading_standard(p):
            # 保存上一个 section
            if current_content:
                sections.append({
                    "heading_zh": current_heading_zh,
                    "heading_en": current_heading_en,
                    "paragraphs": pair_alternating(current_content),
                })
            current_heading_zh, current_heading_en = split_heading(p)
            current_content = []
        else:
            if p.strip():
                current_content.append(p)

    # 最后一个 section
    if current_content:
        sections.append({
            "heading_zh": current_heading_zh,
            "heading_en": current_heading_en,
            "paragraphs": pair_alternating(current_content),
        })

    return sections


# ═══════════════════════════════════════════
#  格式二：混合格式（damen）
# ═══════════════════════════════════════════

def find_lang_switch(text):
    """
    找到中英文切换点。返回 (zh_part, en_part)。
    切换点特征：。！？）之后紧跟大写英文字母（允许 0-2 个空格）
    """
    # 找 "。A-Z" / "？A-Z" / "！A-Z" / "）A-Z" 模式
    m = re.search(r"[。！？）]\s{0,2}[A-Z]", text)
    if m:
        split_at = m.start() + 1  # 在 。！？）之后切
        zh = text[:split_at].strip()
        en = text[split_at:].strip()
        if has_cjk(zh) and len(en) > 10:
            return zh, en

    # 备选：扫描字符级切换点（CJK → ASCII 大写）
    prev_cjk = False
    for i, ch in enumerate(text):
        if is_cjk(ch):
            prev_cjk = True
        elif prev_cjk and ch.isascii() and ch.isupper():
            before = text[:i].strip()
            after = text[i:].strip()
            if has_cjk(before) and len(after) > 10:
                return before, after
            break  # 只试第一个切换点

    if has_cjk(text):
        return text, ""
    return "", text


def extract_subheading(text):
    """
    检查段落是否以子标题开头（如 "1. 历史沿革 / Historical Evolution"）
    返回 (sub_heading_zh, sub_heading_en, remaining_text) 或 None
    """
    # 匹配 "N. 中文... / English..." 后紧跟 CJK 内容
    m = re.match(r"^(\d+\.\s*.+?)\s*/\s*([A-Z][A-Za-z0-9\s&',()\-—]+?)(?=[一-鿿（])", text)
    if m:
        remaining = text[m.end():].strip()
        return m.group(1).strip(), m.group(2).strip(), remaining
    return None


def clean_mixed(paras):
    """混合格式（damen）：中英文在同一段落内，标题无 / 分隔符"""
    while paras and not paras[0]: paras.pop(0)
    while paras and not paras[-1]: paras.pop()

    sections = []

    for p in paras:
        if not p.strip():
            continue

        # 跳过纯主标题行（短 + 双语），它们的信息包含在子标题中
        if len(p) < 150:
            zh, en = find_lang_switch(p)
            if zh and en and len(zh) < 120 and len(en) < 150:
                # 是主标题（一、二、... 开场白等），跳过
                # 但记录下如果是开场白，下一个内容段归入开场白
                continue

        # 欢送词特殊处理
        if p.startswith("欢送词") and " / " in p[:80]:
            parts = p.split(" / ", 1)
            heading_zh = parts[0].strip()
            # 英文标题后紧跟中文内容，需切割
            rest = parts[1]
            m = re.match(r"([A-Z][A-Za-z\s]+?)(?=[A-Z一-鿿])", rest)
            if m:
                heading_en = m.group(1).strip()
                content_text = rest[m.end():].strip()
            else:
                heading_en = rest[:50].strip()
                content_text = rest[50:].strip()
            zh, en = find_lang_switch(content_text)
            sections.append({
                "heading_zh": heading_zh,
                "heading_en": heading_en,
                "paragraphs": [{"en": en, "zh": zh}],
            })
            continue

        # 内容段落：提取子标题 + 拆分中英内容
        sub = extract_subheading(p)
        if sub:
            sub_zh, sub_en, remaining = sub
            zh, en = find_lang_switch(remaining)
            sections.append({
                "heading_zh": sub_zh,
                "heading_en": sub_en,
                "paragraphs": [{"en": en, "zh": zh}],
            })
        else:
            # 无子标题（如 P1 开场白内容）：直接拆分
            zh, en = find_lang_switch(p)
            if zh or en:
                # 归入上一个 section 或创建新 section
                sections.append({
                    "heading_zh": "开场白",
                    "heading_en": "Intro",
                    "paragraphs": [{"en": en, "zh": zh}],
                })

    return sections


# ═══════════════════════════════════════════
#  主流程
# ═══════════════════════════════════════════

def process_one(site):
    sid = site["id"]
    fpath = os.path.join(INTERMEDIATE, f"{sid}.json")
    with open(fpath, "r", encoding="utf-8") as f:
        raw = json.load(f)

    paras = raw["paragraphs"]

    if site["mixed"]:
        sections = clean_mixed(paras)
    else:
        sections = clean_standard(paras)

    # 汇总所有段落对用于句子拆分
    all_pairs = []
    for sec in sections:
        all_pairs.extend(sec["paragraphs"])
    sentences = build_sentences(all_pairs)

    result = {
        "id": sid,
        "title_zh": site["title_zh"],
        "title_en": site["title_en"],
        "sections": sections,
        "sentences": sentences,
    }

    out_path = os.path.join(DATA_DIR, f"{sid}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    total_paras = sum(len(sec["paragraphs"]) for sec in sections)
    return sid, len(sections), total_paras, len(sentences)


if __name__ == "__main__":
    for site in SITES:
        sid, n_sec, n_para, n_sent = process_one(site)
        print(f"✅ {sid}: {n_sec} sections, {n_para} paragraph-pairs, {n_sent} sentences")

    # 删除 beihai.json
    beihai_path = os.path.join(DATA_DIR, "beihai.json")
    if os.path.exists(beihai_path):
        os.remove(beihai_path)
        print("🗑️  已删除 beihai.json")

    print("\n🎉 全部清洗完成！")
