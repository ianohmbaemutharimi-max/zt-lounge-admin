#!/usr/bin/env node
/**
 * AUTOMATED BOOKINGS SCHEMA FIX
 * Applies all necessary changes to align frontend with database schema
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  AUTOMATED BOOKINGS SCHEMA FIX                               ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

let filesModified = 0;
let fixesApplied = 0;

// ─── Fix 1: Update Drizzle Schema ───────────────────────────────────

console.log('📝 FIX 1: Removing totalAmount from Drizzle schema...');

const schemaPath = join(__dirname, '..', 'src', 'db', 'schema.ts');
let schemaContent = readFileSync(schemaPath, 'utf-8');

const schemaOriginal = schemaContent;

// Remove totalAmount line
schemaContent = schemaContent.replace(
  /\s+totalAmount: numeric\("total_amount"\)\.default\("0"\),?\n/,
  '\n'
);

if (schemaContent !== schemaOriginal) {
  writeFileSync(schemaPath, schemaContent, 'utf-8');
  console.log('✅ Removed totalAmount field from bookings schema');
  filesModified++;
  fixesApplied++;
} else {
  console.log('⚠️  totalAmount field not found (may already be removed)');
}

// ─── Fix 2: Update Frontend Component ───────────────────────────────

console.log('\n📝 FIX 2: Updating frontend component...');

const viewPath = join(__dirname, '..', 'src', 'features', 'bookings', 'bookings-view.tsx');
let viewContent = readFileSync(viewPath, 'utf-8');

const viewOriginal = viewContent;

// Fix 2a: Update validation schema
console.log('   2a. Updating validation schema...');
viewContent = viewContent.replace(
  /const bookingSchema = z\.object\(\{[\s\S]*?\}\);/,
  `const bookingSchema = z.object({
  customerId: z.string().uuid("Select a customer"),
  serviceId: z.string().uuid("Select a service"),
  staffId: z.string().uuid("Select a staff member"),
  bookingDate: z.string().min(1, "Date is required"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  guests: z.coerce.number().min(1, "At least 1 guest").max(50, "Max 50 guests"),
  status: z.enum(["pending", "confirmed", "completed", "cancelled", "no_show"]),
});`
);

// Fix 2b: Remove totalAmount from save mutation
console.log('   2b. Removing payment logic from save mutation...');
viewContent = viewContent.replace(
  /const save = useMutation\(\{[\s\S]*?mutationFn: \(values: BookingForm\) => \{[\s\S]*?const service = byId\(services\.data, values\.serviceId\);[\s\S]*?const payload = \{ \.\.\.values, totalAmount: service\?\.price \?\? "0" \};[\s\S]*?return editing[\s\S]*?\? api\.update\("bookings", editing\.id, payload\)[\s\S]*?: api\.create\("bookings", \{ \.\.\.payload, bookingNumber: `ZT-\$\{1000 \+ Date\.now\(\) % 100000\}` \}\);[\s\S]*?\},/,
  `const save = useMutation({
    mutationFn: (values: BookingForm) => {
      return editing
        ? api.update("bookings", editing.id, values)
        : api.create("bookings", { ...values, bookingNumber: \`ZT-\${1000 + Date.now() % 100000}\` });
    },`
);

// Fix 2c: Update form field mappings in openForm
console.log('   2c. Updating form field mappings...');
viewContent = viewContent.replace(
  /function openForm\(booking\?: any\) \{[\s\S]*?form\.reset\([\s\S]*?\);[\s\S]*?setFormOpen\(true\);[\s\S]*?\}/,
  `function openForm(booking?: any) {
    setEditing(booking ?? null);
    form.reset(
      booking
        ? {
            customerId: booking.customerId,
            serviceId: booking.serviceId,
            staffId: booking.staffId,
            bookingDate: booking.bookingDate,
            startTime: booking.startTime?.slice(0, 5) || "",
            endTime: booking.endTime?.slice(0, 5) || "",
            guests: booking.guests,
            status: booking.status,
          }
        : { 
            customerId: "", 
            serviceId: "", 
            staffId: "", 
            bookingDate: "", 
            startTime: "", 
            endTime: "", 
            guests: 2, 
            status: "pending" 
          }
    );
    setFormOpen(true);
  }`
);

// Fix 2d: Update table time display
console.log('   2d. Updating table time display...');
viewContent = viewContent.replace(
  /\{ header: "Time", cell: \(b\) => formatTime\(b\.bookingTime\) \},/,
  `{ header: "Time", cell: (b) => \`\${formatTime(b.startTime)} - \${formatTime(b.endTime)}\` },`
);

// Fix 2e: Update calendar display
console.log('   2e. Updating calendar display...');
viewContent = viewContent.replace(
  /\{formatTime\(b\.bookingTime\)\} · \{b\.customerName\}/g,
  `{formatTime(b.startTime)} · {b.customerName}`
);

// Fix 2f: Update default values
console.log('   2f. Updating form default values...');
viewContent = viewContent.replace(
  /defaultValues: \{ status: "pending", partySize: 2 \} as any,/,
  `defaultValues: { status: "pending", guests: 2, customerId: "", serviceId: "", staffId: "", bookingDate: "", startTime: "", endTime: "" } as any,`
);

if (viewContent !== viewOriginal) {
  writeFileSync(viewPath, viewContent, 'utf-8');
  console.log('✅ Updated frontend component with correct field names');
  filesModified++;
  fixesApplied += 6;
} else {
  console.log('⚠️  No changes made to frontend component');
}

// ─── Summary ─────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`📊 SUMMARY: ${fixesApplied} fixes applied, ${filesModified} files modified\n`);

if (fixesApplied > 0) {
  console.log('✅ Automated fixes completed successfully!\n');
  console.log('NEXT STEPS:');
  console.log('1. Review the changes in:');
  console.log('   - src/db/schema.ts');
  console.log('   - src/features/bookings/bookings-view.tsx');
  console.log('2. Run: npm run typecheck');
  console.log('3. Run: npm run build');
  console.log('4. Test bookings CRUD in browser\n');
} else {
  console.log('⚠️  No fixes were applied. Files may already be correct.\n');
}

process.exit(0);
