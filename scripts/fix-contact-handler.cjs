/**
 * ZT LOUNGE — contact.html competing handler removal
 * Precise line-range removal with safety checks
 */
const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '..', '..', 'zt-lounge', 'pages', 'contact', 'contact.html');

console.log('Reading file:', FILE_PATH);
const content = fs.readFileSync(FILE_PATH, 'utf-8');
const lines = content.split('\n');

console.log('Total lines before:', lines.length);

// Create backup
const backupPath = FILE_PATH + '.bak';
fs.copyFileSync(FILE_PATH, backupPath);
console.log('Backup saved:', backupPath);

// Find the competing handler block
// It starts with the comment "CONTACT BOOKING FORM" and ends with "});" before </script>
let startIdx = -1;
let endIdx = -1;

for (let i = 0; i < lines.length; i++) {
  // Find the start: the comment block before the DOMContentLoaded handler
  if (lines[i].includes('CONTACT BOOKING FORM') && startIdx === -1 && i > 1000) {
    // Walk backwards to find the blank line before the comment
    startIdx = i;
    // Find the start of the comment (the /** line)
    while (startIdx > 0 && lines[startIdx].trim() !== '/**') {
      startIdx--;
    }
    // Walk back past blank lines
    while (startIdx > 0 && lines[startIdx - 1].trim() === '') {
      startIdx--;
    }
    console.log('Found competing handler start at line', startIdx + 1);
    break;
  }
}

// Find the end: the </script> tag after the competing handler
for (let i = 0; i < lines.length; i++) {
  if (lines[i].trim() === '</script>' && i > 1600) {
    endIdx = i;
    console.log('Found closing </script> at line', endIdx + 1);
    break;
  }
}

if (startIdx === -1 || endIdx === -1) {
  console.error('ERROR: Could not find boundaries. startIdx=' + startIdx + ' endIdx=' + endIdx);
  process.exit(1);
}

// Safety check: verify the block contains the competing handler
const block = lines.slice(startIdx, endIdx).join('\n');
if (!block.includes('addEventListener') || !block.includes('bookingForm') || !block.includes('whatsappUrl')) {
  console.error('ERROR: Safety check failed. Block does not contain expected competing handler content.');
  console.error('Content preview:', block.substring(0, 200));
  process.exit(1);
}

console.log('Safety check passed: competing handler content confirmed');

// Remove the block (keep the </script> line)
const newLines = [...lines.slice(0, startIdx), ...lines.slice(endIdx)];
const newContent = newLines.join('\n');

fs.writeFileSync(FILE_PATH, newContent);
console.log('Total lines after:', newLines.length);
console.log('Lines removed:', endIdx - startIdx);
console.log('Competing handler removed successfully');

// Verify
const verifyContent = fs.readFileSync(FILE_PATH, 'utf-8');
const hasInlineSubmit = verifyContent.includes("addEventListener('submit'") || verifyContent.includes('addEventListener("submit"');
const hasWhatsappUrl = verifyContent.includes('whatsappUrl');
const hasWaMe = verifyContent.includes('wa.me');
const hasFormsJs = verifyContent.includes('forms.js');
const hasContactForm = verifyContent.includes('contactForm');

console.log('\n=== VERIFICATION ===');
console.log('Inline addEventListener submit:', hasInlineSubmit ? 'STILL PRESENT ❌' : 'REMOVED ✅');
console.log('whatsappUrl reference:', hasWhatsappUrl ? 'STILL PRESENT ❌' : 'REMOVED ✅');
console.log('wa.me reference:', hasWaMe ? 'STILL PRESENT ❌' : 'REMOVED ✅');
console.log('forms.js loaded:', hasFormsJs ? 'YES ✅' : 'NO ❌');
console.log('contactForm element present:', hasContactForm ? 'YES ✅' : 'NO ❌');
