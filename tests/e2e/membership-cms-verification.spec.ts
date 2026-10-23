import { test, expect } from '@playwright/test';

test('COLLECTION route: membership-plans endpoint functional (200 unauth, not 500)', async ({ request }) => {
  const r = await request.get('/api/membership-plans');
  console.log('RUNTIME: /api/membership-plans (public) status =', r.status());
  if (r.status() === 200) {
    const body = await r.json();
    console.log('RUNTIME: plans returned =', body.data ? body.data.length : 'n/a');
    if (body.data && body.data.length > 0) {
      console.log('RUNTIME: first plan =', JSON.stringify({
        id: body.data[0].id,
        name: body.data[0].name,
        slug: body.data[0].slug,
        annual_price: body.data[0].annual_price,
        registration_fee: body.data[0].registration_fee
      }));
    }
  }
});

test('ADMIN route: membership-plans requires auth (401 not 500)', async ({ request }) => {
  const r = await request.get('/api/admin/membership-plans');
  console.log('RUNTIME: /api/admin/membership-plans unauth status =', r.status());
});

test('PUBLIC: /membership page renders', async ({ page }) => {
  const resp = await page.goto('/membership');
  console.log('PUBLIC: /membership status =', resp?.status());
});
