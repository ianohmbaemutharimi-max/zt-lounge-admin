/**
 * BOOKING E2E — login, create booking, status update, notes
 */
import { test, expect } from '@playwright/test';
import { testUsers } from './fixtures/auth';

const API = '/api/admin';

async function signIn(page: import('@playwright/test').Page) {
  const user = testUsers.super_admin;
  await page.goto('/login');
  await page.fill('#email', user.email);
  await page.fill('#password', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 45_000 });
}

async function apiReq(page: import('@playwright/test').Page, method: 'get' | 'post' | 'patch' | 'delete', path: string, data?: unknown) {
  const res = await page.request[method](`${API}${path}`, data === undefined ? {} : { data });
  let body: any = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status(), body };
}

test.describe('Booking flow', () => {
  test('create booking, update status, add note', async ({ page }) => {
    await signIn(page);

    const services = await apiReq(page, 'get', '/services?limit=10');
    expect(services.status).toBe(200);
    const service = (services.body?.data ?? [])[0];
    expect(service, 'need a service').toBeTruthy();

    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const create = await apiReq(page, 'post', '/bookings', {
      guest_name: 'E2E Booking User',
      guest_phone: '+254700000001',
      guest_email: 'e2e@example.com',
      serviceId: service.id,
      bookingDate: tomorrow,
      startTime: '14:00',
      endTime: '15:00',
      guests: 2,
      status: 'pending',
    });
    console.log('[booking] create status =', create.status, create.body);
    expect(create.status).toBe(201);
    const booking = create.body;
    const bookingId = booking?.id ?? booking?.booking_id;
    expect(bookingId, 'booking id').toBeTruthy();

    const statusUpdate = await apiReq(page, 'patch', `/bookings/${bookingId}/status`, { status: 'confirmed' });
    console.log('[booking] status update =', statusUpdate.status, statusUpdate.body);
    expect(statusUpdate.status).toBe(200);

    const note = await apiReq(page, 'post', '/booking-notes', { booking_id: bookingId, note: 'E2E note' });
    console.log('[booking] note create =', note.status, note.body);
    expect(note.status).toBe(201);

    const notes = await apiReq(page, 'get', `/booking-notes?limit=50`);
    expect(notes.status).toBe(200);

    await apiReq(page, 'delete', `/bookings/${bookingId}`);

    await page.goto('/dashboard/bookings');
    await expect(page.getByRole('heading', { name: /booking/i }).first()).toBeVisible({ timeout: 30_000 });
  });
});
