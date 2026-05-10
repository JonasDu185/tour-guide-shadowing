"""
导游词清洗脚本 v3 — 原版 docx（EN→ZH 交替，英文标题）
sentence 携带 section 标题 + 完整中文段落作为上下文
"""
import json, os, re

INTERMEDIATE = os.path.join(os.path.dirname(__file__), "intermediate")
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")

# ── 景点配置 ──
SITES_STANDARD = [
    {"id": "tiantan",    "title_zh": "天坛",     "title_en": "The Temple of Heaven",            "description": "帝王与天对话的圣地，一圆一方尽显东方建筑哲思"},
    {"id": "gugong",     "title_zh": "故宫博物院", "title_en": "The Palace Museum (Forbidden City)", "description": "六百年皇家宫殿，红墙黄瓦间藏尽明清帝王事"},
    {"id": "yiheyuan",   "title_zh": "颐和园",     "title_en": "The Summer Palace",               "description": "山水一色皇家园林，昆明湖畔万寿山前"},
    {"id": "shisanling", "title_zh": "明十三陵",   "title_en": "The Ming Tombs",                  "description": "明代十三帝长眠之地，群山环抱气脉绵延"},
    {"id": "changcheng", "title_zh": "长城",       "title_en": "The Great Wall",                  "description": "万里蜿蜒的古代奇迹，砖石之间刻满千年风霜"},
]

# ── 工具函数 ──

def is_cjk(ch):
    cp = ord(ch)
    return (0x4E00 <= cp <= 0x9FFF or 0x3400 <= cp <= 0x4DBF or
            0x3000 <= cp <= 0x303F or 0xFF00 <= cp <= 0xFFEF)

def has_cjk(text):
    return any(is_cjk(ch) for ch in text)

def cjk_ratio(text):
    if not text: return 0
    return sum(1 for c in text if is_cjk(c)) / len(text)

def is_heading(p):
    """短段落 + 无 CJK（或极少量）→ 英文标题"""
    if len(p) > 200: return False
    return not has_cjk(p) or cjk_ratio(p) < 0.05

def is_zh_heading(p):
    """短段落 + 有 CJK → 中文标题（仅天安门使用）"""
    if len(p) > 200: return False
    return has_cjk(p) and cjk_ratio(p) > 0.2

# ── 英文句子拆分 ──

def split_en_sentences(text):
    """拆分英文句子，避免缩写词（c. e.g. etc.）被误拆"""
    if not text: return []
    # 只在 .!? 后跟空格+大写字母时才拆，避免 "c. 1046" / "e.g. something" 误拆
    raw = re.split(r"(?<=[.!?])\s+(?=[A-Z\"'(])", text)
    return [s.strip() for s in raw if s.strip()]

def word_count(en):
    return len([w for w in en.split() if re.search(r"[A-Za-z]", w)])

def split_long_sentence(sent):
    """超过 40 词的长句在 ; : — 处二次拆分"""
    if word_count(sent) <= 40:
        return [sent]
    parts = re.split(r"(?<=[;:])\s+", sent)
    result = []
    for part in parts:
        sub = re.split(r"(?<=—)\s+", part)
        result.extend(s.strip() for s in sub if s.strip())
    return result if len(result) > 1 else [sent]

def merge_short_en(sents):
    """英文 < 5 词自动与下一句合并"""
    result = []
    i = 0
    while i < len(sents):
        s = sents[i]
        while word_count(s) < 5 and i + 1 < len(sents):
            i += 1
            s += " " + sents[i]
        result.append(s)
        i += 1
    return result


# ═══════════════════════════════════════════
#  格式一：标准原版（5 个文件）
#  EN 标题 → EN 内容 → ZH 内容 → EN 标题 → ...
# ═══════════════════════════════════════════

def clean_standard(paras, title_zh, title_en):
    paras = [p for p in paras if p.strip()]
    if not paras: return []

    # P0 是英文景点标题，跳过
    start = 1 if not has_cjk(paras[0]) and len(paras[0]) < 100 else 0

    sections = []
    current_headings = []
    buffer_en = None  # 缓存的 EN 内容，等待 ZH 配对

    def make_pair(en_text, zh_text):
        heading_text = " — ".join(h for h in current_headings if h) if current_headings else ""
        return {
            "heading_zh": "",
            "heading_en": heading_text,
            "paragraphs": [{"en": en_text or "", "zh": zh_text or ""}],
        }

    for p in paras[start:]:
        # 欢送词标题
        if ("Farewell" in p or "farewell" in p) and len(p) < 80:
            if buffer_en:
                sections.append(make_pair(buffer_en, ""))
                buffer_en = None
            current_headings = [p]
            continue

        # 英文标题（短 + 无 CJK）
        if is_heading(p):
            if buffer_en:
                sections.append(make_pair(buffer_en, ""))
                buffer_en = None
            current_headings = [p]

        # ZH 内容 → 与缓存的 EN 配对
        elif has_cjk(p) and cjk_ratio(p) > 0.15:
            sections.append(make_pair(buffer_en or "", p))
            buffer_en = None
            current_headings = []

        # EN 内容 → 缓存，等待 ZH
        else:
            if buffer_en:
                sections.append(make_pair(buffer_en, ""))
            buffer_en = p

    # 尾部残留
    if buffer_en:
        sections.append(make_pair(buffer_en, ""))

    return sections


# ═══════════════════════════════════════════
#  格式二：天安门（冗余中英标题 + EN→ZH 内容）
# ═══════════════════════════════════════════

def clean_tiananmen(paras, title_zh, title_en):
    paras = [p for p in paras if p.strip()]
    if not paras: return []

    sections = []
    en_headings = []
    zh_headings = []
    buffer_en = None

    def make_pair(en_text, zh_text):
        heading_en = " — ".join(h for h in en_headings if h) if en_headings else ""
        heading_zh = " — ".join(h for h in zh_headings if h) if zh_headings else heading_en
        return {
            "heading_zh": heading_zh,
            "heading_en": heading_en or heading_zh,
            "paragraphs": [{"en": en_text or "", "zh": zh_text or ""}],
        }

    # 跳过景点标题
    start = 1 if not has_cjk(paras[0]) and len(paras[0]) < 60 else 0

    for p in paras[start:]:
        # 短英文 → 标题（必须是标题模式：罗马数字/数字开头，或 < 60 字符）
        looks_like_heading = bool(re.match(r'^[IVX]+\.|^\d+\.|^Farewell', p))
        if not has_cjk(p) and (looks_like_heading or (len(p) < 60 and not has_cjk(p))):
            if buffer_en:
                sections.append(make_pair(buffer_en, ""))
                buffer_en = None
            en_headings = [p]  # 替换，不累积
            continue

        # 短中文 → 中文标题
        if len(p) < 80 and has_cjk(p) and cjk_ratio(p) > 0.3:
            zh_headings = [p]  # 替换，不累积
            continue

        # 英文内容 → 累积缓冲（支持多段英文对应一段中文）
        if not has_cjk(p):
            if buffer_en:
                buffer_en += " " + p  # 合并多段英文
            else:
                buffer_en = p
            continue

        # 中文内容 → 与缓冲的 EN 配对
        if has_cjk(p):
            sections.append(make_pair(buffer_en or "", p))
            buffer_en = None
            en_headings = []
            zh_headings = []
            continue

    # 残留
    if buffer_en:
        sections.append(make_pair(buffer_en, ""))

    return sections


# ═══════════════════════════════════════════
#  构建 sentences（携带上下文）
# ═══════════════════════════════════════════

def build_sentences(sections):
    """每句英文携带：完整中文段落 + section 标题"""
    result = []
    for sec in sections:
        for pair in sec["paragraphs"]:
            en_text = pair.get("en", "")
            zh_context = pair.get("zh", "")
            if not en_text.strip():
                continue
            en_sents = split_en_sentences(en_text)
            # 先拆流水句，再合并短句
            expanded = []
            for s in en_sents:
                expanded.extend(split_long_sentence(s))
            en_sents = merge_short_en(expanded)
            for s in en_sents:
                if s.strip():
                    result.append({
                        "en": s.strip(),
                        "zh": zh_context,  # 完整中文段落作为上下文
                        "heading_zh": sec.get("heading_zh", ""),
                        "heading_en": sec.get("heading_en", ""),
                    })
    return result


# ═══════════════════════════════════════════
#  主流程
# ═══════════════════════════════════════════

def process_standard(site):
    sid = site["id"]
    fpath = os.path.join(INTERMEDIATE, f"{sid}_orig.json")
    with open(fpath, "r", encoding="utf-8") as f:
        raw = json.load(f)

    sections = clean_standard(raw["paragraphs"], site["title_zh"], site["title_en"])
    sentences = build_sentences(sections)
    write_output(sid, site["title_zh"], site["title_en"], sections, sentences, site.get("description", ""))
    return sid, len(sections), sum(len(s["paragraphs"]) for s in sections), len(sentences)


def process_tiananmen():
    fpath = os.path.join(INTERMEDIATE, "tiananmen_orig.json")
    with open(fpath, "r", encoding="utf-8") as f:
        raw = json.load(f)

    sections = clean_tiananmen(raw["paragraphs"], "天安门广场与中轴线", "Tian'anmen Square & Central Axis")
    sentences = build_sentences(sections)
    write_output("damen", "天安门广场与中轴线", "Tian'anmen Square & Central Axis", sections, sentences, "古都中轴线的起点，百年风云尽在城楼之下")
    return "damen", len(sections), sum(len(s["paragraphs"]) for s in sections), len(sentences)


def write_output(sid, title_zh, title_en, sections, sentences, description=""):
    result = {
        "id": sid,
        "title_zh": title_zh,
        "title_en": title_en,
        "description": description,
        "sections": sections,
        "sentences": sentences,
    }
    out_path = os.path.join(DATA_DIR, f"{sid}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    for site in SITES_STANDARD:
        sid, n_sec, n_para, n_sent = process_standard(site)
        print(f"✅ {sid}: {n_sec} sections, {n_para} pairs, {n_sent} sentences")

    sid, n_sec, n_para, n_sent = process_tiananmen()
    print(f"✅ {sid}: {n_sec} sections, {n_para} pairs, {n_sent} sentences")

    print("\n🎉 全部清洗完成！")
