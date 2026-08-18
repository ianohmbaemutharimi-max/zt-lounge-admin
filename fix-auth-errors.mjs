// Fix error handling in auth server — log server-side, sanitize client response
import fs from 'fs';

const file = 'src/lib/auth/server.ts';
let content = fs.readFileSync(file, 'utf8');

// Normalize to LF for matching
const wasCRLF = content.includes('\r\n');
content = content.replace(/\r\n/g, '\n');

const oldPattern = `    try {
      return await handler(req, context, result.session);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Internal server error" },
        { status: 500 }
      );
    }`;

const newPattern = `    try {
      return await handler(req, context, result.session);
    } catch (e) {
      // Log full error server-side for diagnostics; return sanitized message to client
      if (e instanceof Error) {
        console.error("[auth-handler] Handler error:", e.message);
      }
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }`;

const count = content.split(oldPattern).length - 1;
console.log('Occurrences found:', count);

content = content.split(oldPattern).join(newPattern);

// Restore original line endings
if (wasCRLF) {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync(file, content, 'utf8');
console.log('File written successfully');
