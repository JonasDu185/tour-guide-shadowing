/* Data cleaning: split paragraphs into aligned sentences for shadowing */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

function splitEnSentences(text) {
  // Split on .!? followed by space or end of string
  const raw = text.split(/(?<=[.!?])\s+/);
  return raw.filter(s => s.trim().length > 0);
}

function splitZhSentences(text) {
  // Split after Chinese punctuation
  const raw = text.split(/(?<=[。！？])/);
  return raw.filter(s => s.trim().length > 0);
}

function wordCount(en) {
  return en.trim().split(/\s+/).filter(w => /[A-Za-z]/.test(w)).length;
}

function mergeShort(enSentences, zhSentences) {
  const enResult = [];
  const zhResult = [];
  let i = 0;

  while (i < enSentences.length) {
    let en = enSentences[i].trim();
    let zh = (zhSentences[i] || '').trim();

    // Merge with next if < 5 words and there is a next
    while (wordCount(en) < 5 && i + 1 < enSentences.length) {
      i++;
      en += ' ' + enSentences[i].trim();
      zh += (zhSentences[i] || '').trim();
    }

    enResult.push(en);
    zhResult.push(zh);
    i++;
  }

  return { en: enResult, zh: zhResult };
}

function processFile(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const sentences = [];

  for (const para of data.paragraphs) {
    const enSentences = splitEnSentences(para.en);
    const zhSentences = splitZhSentences(para.zh);

    const { en, zh } = mergeShort(enSentences, zhSentences);

    for (let i = 0; i < en.length; i++) {
      sentences.push({
        en: en[i],
        zh: zh[i] || '',
      });
    }
  }

  data.sentences = sentences;
  return data;
}

// Process all JSON files
const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
for (const file of files) {
  const filePath = path.join(DATA_DIR, file);
  console.log(`Processing ${file}...`);
  const cleaned = processFile(filePath);
  fs.writeFileSync(filePath, JSON.stringify(cleaned, null, 2));
  console.log(`  → ${cleaned.sentences.length} sentences`);
}

console.log('Done! All data files updated with sentences array.');
