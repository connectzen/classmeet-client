const fs = require('fs');
const file = 'c:\\Users\\AYUBU\\Desktop\\Class\\client\\src\\pages\\Landing.tsx';
let content = fs.readFileSync(file, 'utf8');

const replacements = [
  ['\u00f0\u009f\u008e\u00a5', '\uD83C\uDFA5'],          // 🎥
  ['\u00f0\u009f\u0092\u00ac', '\uD83D\uDCAC'],          // 💬
  ['\u00f0\u009f\u008e\u0099\u00ef\u00b8\u008f', '\uD83C\uDF99\uFE0F'], // 🎙️
  ['\u00f0\u009f\u0092\u00a5', '\uD83D\uDC65'],          // 👥
  ['\u00f0\u009f\u0094\u0084', '\uD83D\uDD04'],          // 🔄
  ['\u00f0\u009f\u008e\u0093', '\uD83C\uDF93'],          // 🎓
  ['\u00f0\u009f\u0093\u008b', '\uD83D\uDCCB'],          // 📋
  ['\u00f0\u009f\u0094\u0091', '\uD83D\uDD11'],          // 🔑
  ['\u00f0\u009f\u0094\u00b4', '\uD83D\uDD34'],          // 🔴
  ['\u00e2\u009a\u00aa', '\u26AA'],                      // ⚪
  ['\u00f0\u009f\u0093\u009a', '\uD83D\uDCDA'],          // 📚
  ['\u00e2\u009c\u0085', '\u2705'],                      // ✅
  ['\u00e2\u0086\u00bb', '\u21BB'],                      // ↻
  ['\u00e2\u009a\u00a0\u00ef\u00b8\u008f', '\u26A0\uFE0F'], // ⚠️
  ['\u00e2\u0086\u0097', '\u2197'],                      // ↗
  ['\u00e2\u0086\u0092', '\u2192'],                      // →
  ['\u00e2\u0080\u00a6', '\u2026'],                      // …
  ['\u00e2\u0096\u00b6', '\u25B6'],                      // ▶
  ['\u00e2\u0094\u0080\u00e2\u0094\u0080', '\u2500\u2500'], // ──
  ['\u00e2\u0095\u0090\u00e2\u0095\u0090\u00e2\u0095\u0090\u00e2\u0095\u0090', '\u2550\u2550\u2550\u2550'], // ════
  ['\u00e2\u0086\u0094', '\u2194'],                      // ↔
];

for (const [from, to] of replacements) {
  content = content.split(from).join(to);
}

fs.writeFileSync(file, content, 'utf8');
console.log('Done. Fixed emojis in Landing.tsx');
