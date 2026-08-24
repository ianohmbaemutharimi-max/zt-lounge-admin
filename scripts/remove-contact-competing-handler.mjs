/**
 * ZT LOUNGE — contact.html competing handler removal
 * 
 * Removes the inline DOMContentLoaded + submit handler (lines 1522-1635)
 * that always opens WhatsApp, eliminating the race condition with forms.js.
 * 
 * The centralized forms.js handler (loaded via defer at line 1669) will
 * become the sole authority for #contactForm submission logic.
 * 
 * This is a PRECISE LINE-RANGE REMOVAL — backup is created automatically.
 */

import fs from 'fs';
import path from 'path';

const FILE_PATH = 'D:\\zt lounge\\zt-lounge-demo\\zt-lounge\\pages\\contact\\contact.html';

// Read the file
const content = fs.readFileSync(FILE_PATH, 'utf-8');
const lines = content.split('\n');

// Backup
const backupPath = FILE_PATH + '.backup-competing-handler';
fs.writeFileSync(backupPath, content);
console.log(`✅ Backup saved: ${path.basename(backupPath)}`);

// Lines to remove (1-indexed in editor, 0-indexed in array)
// Line 1522 is the empty line before the comment (editor line 1522 = array index 1521)
// Line 1635 is the closing }); of the DOMContentLoaded handler (editor line 1635 = array index 1634)
// We remove lines 1522 through 1635 (inclusive), keeping line 1636 (</script>)

console.log(`📝 Total lines: ${lines.length}`);
console.log(`📝 Line 1521 (keep): ${JSON.stringify(lines[1520])}`);
console.log(`📝 Line 1522 (remove start): ${JSON.stringify(lines[1521])}`);
console.log(`📝 Line 1635 (remove end): ${JSON.stringify(lines[1634])}`);
console.log(`📝 Line 1636 (keep): ${JSON.stringify(lines[1635])}`);

// Verify we're removing the right content
const expectedStart = lines[1520].trim(); // Should be "});"
const expectedRemoveStart = lines[1521].trim(); // Should be empty or the comment
const expectedRemoveEnd = lines[1634].trim(); // Should be "});"
const expectedKeep = lines[1635].trim(); // Should be "</script>"

console.log(`\n🔍 Verification:`);
console.log(`  Last line kept (1521): ${expectedStart.includes('});') ? '✅ OK' : '⚠️ UNEXPECTED'} — "${expectedStart}"`);
console.log(`  First removed (1522): "${expectedRemoveStart}"`);
console.log(`  Last removed (1635): ${expectedRemoveEnd.includes('});') ? '✅ OK' : '⚠️ UNEXPECTED'} — "${expectedRemoveEnd}"`);
console.log(`  First kept after (1636): ${expectedKeep === '</script>' ? '✅ OK' : '⚠️ UNEXPECTED'} — "${expectedKeep}"`);

// Verify the competing handler content is between these lines
const betweenContent = lines.slice(1521, 1635).join('\n');
const hasCompetingHandler = betweenContent.includes('addEventListener') && 
                            betweenContent.includes('contactForm') && 
                            betweenContent.includes('whatsappUrl') &&
                            betweenContent.includes('wa.me');

if (!hasCompetingHandler) {
  console.log('\n❌ SAFETY CHECK FAILED: Content between lines 1522-1635 does not contain the expected competing handler.');
  console.log('   Aborting to prevent accidental modification.');
  process.exit(1);
}

console.log(`\n✅ Safety check passed: Competing handler content confirmed.`);

// Remove lines 1522-1635 (array indices 1521-1634)
const newLines = [
  ...lines.slice(0, 1521),   // Keep lines 1-1521
  ...lines.slice(1635),      // Keep lines 1636 onwards
];

const newContent = newLines.join('\n');
fs.writeFileSync(FILE_PATH, newContent);

console.log(`\n🎉 FIXED: Removed ${1635 - 1522 + 1} lines (the competing contact form handler)`);
console.log(`   File reduced from ${lines.length} to ${newLines.length} lines`);
console.log(`   forms.js deferred handler is now the SOLE authority for #contactForm`);
console.log(`\n✅ DONE`);
