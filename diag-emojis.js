const fs = require('fs');
const file = 'c:\\Users\\AYUBU\\Desktop\\Class\\client\\src\\pages\\Landing.tsx';
const content = fs.readFileSync(file, 'utf8');

// Search for the garbled pattern using its raw bytes
const idx = content.indexOf('\u00f0\u0178\u017d\u00a5'); // CP1252 mis-read of 🎥
const idx2 = content.indexOf('\u00f0\u009f\u008e\u00a5'); // Latin-1 mis-read of 🎥
const idx3 = content.indexOf('\uD83C\uDFA5');             // correct 🎥 emoji

console.log('CP1252 garbled 🎥 at index:', idx);
console.log('Latin-1 garbled 🎥 at index:', idx2);
console.log('Correct 🎥 emoji at index:', idx3);

// Also print feature-chip area raw char codes
const area = content.indexOf('feature-chip');
console.log('\nChar codes around feature-chip:');
for (let i = area + 20; i < area + 50; i++) {
  const code = content.charCodeAt(i);
  console.log(`  [${i}] U+${code.toString(16).padStart(4,'0')} char="${content[i]}"`);
}
