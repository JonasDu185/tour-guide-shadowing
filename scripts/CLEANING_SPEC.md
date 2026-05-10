# 导游词清洗规则 Spec

## 输入
`scripts/intermediate/{id}.json` — 从 docx 提取的原始段落数组，含空段落。

## 输出格式
```json
{
  "id": "tiantan",
  "title_zh": "天坛",
  "title_en": "The Temple of Heaven",
  "sections": [
    {
      "heading_zh": "开场白：天坛",
      "heading_en": "Intro: The Temple of Heaven",
      "paragraphs": [
        { "en": "...", "zh": "..." }
      ]
    }
  ],
  "sentences": [
    { "en": "...", "zh": "..." }
  ]
}
```

## 通用规则（tiantan, gugong, yiheyuan, shisanling, changcheng）

### 1. 预处理
- 去掉首尾空段落（leading/trailing empty strings）
- 保留中间的空段落（标记 section 边界）

### 2. 标题识别
- 第 0 段 = 景点标题（如 "天坛 / The Temple of Heaven"）
- 第 1 段 = 开场白标题（如 "开场白：天坛 / Intro: The Temple of Heaven"）
- 后续段落中，包含 " / " 分隔符且相对较短的 = section heading
- 欢送词标题也算 section heading（如 "欢送词 / Farewell Speech"）

### 3. 标题拆分
- 按 " / " 分割 → 左侧为 heading_zh，右侧为 heading_en
- 去掉两端空白

### 4. 段落配对
- 非标题段落严格中英交替：🇨🇳 → 🇬🇧 → 🇨🇳 → 🇬🇧 → ...
- 判断语言：首字符是否 CJK（Unicode 一-鿿 或 㐀-䶿）
- 配对规则：CJK 段落 + 下一个非 CJK 段落 → { en: 非CJK段, zh: CJK段 }
- 如果段落数奇数，警告但继续（最后一段单独成对，en 或 zh 为空）

### 5. Section 分组
- 每个 heading 开启一个新 section
- heading 之后、下一个 heading 之前的所有内容属于该 section
- 欢送词是最后一个 section

### 6. 句子拆分（sentences）
- 英文：按 `(?<=[.!?])\s+` 拆分
- 中文：按 `(?<=[。！？])` 拆分
- 英文 < 5 词的与下一句合并
- 中英句一一对应（按索引对齐），多余的截断

### 7. ID 与标题映射
| id | title_zh | title_en |
|----|----------|----------|
| tiantan | 天坛 | The Temple of Heaven |
| gugong | 故宫博物院 | The Palace Museum (Forbidden City) |
| yiheyuan | 颐和园 | The Summer Palace |
| shisanling | 明十三陵 | The Ming Tombs |
| changcheng | 长城 | The Great Wall |
| damen | 天安门广场与中轴线 | Tian'anmen Square & Central Axis |

## 特殊规则：damen（大门广场）

### 格式特点
- 中英文混在同一段落中，没有 " / " 分隔符
- 标题行格式：中文标题直接接英文标题（无分隔符）
- 内容行格式：中文内容 + 英文内容在同一段

### 额外处理步骤
1. **拆分标题**：在中文末尾（最后一个 CJK 字符后）和英文开头（第一个 ASCII 字母）之间切割
   - 例如 "开场白：大门与大门广场Intro: Damen and Damen Square"
   - → heading_zh: "开场白：大门与大门广场", heading_en: "Intro: Damen and Damen Square"
2. **拆分内容**：找到中英文切换点（通常是 。！？后紧跟 A-Z）
   - 切换点之前 = zh，之后 = en
   - 如果段落内有子标题（如 "1. 历史沿革 / Historical Evolution"），先提取子标题再拆分内容
3. 其余规则（section 分组、句子拆分）同通用规则

## 目标文件路径
- 输出到 `data/{id}.json`
- 同时删除 `data/beihai.json`
