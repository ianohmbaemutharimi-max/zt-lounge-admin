import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const sb = createClient(url, key);

async function audit() {
  console.log('=== CMS IMAGE URL AUDIT ===\n');
  
  console.log('=== HERO SLIDES ===');
  const {data: heroSlides, error: e1} = await sb.from('hero_slides').select('id,title,image_url').order('display_order');
  if (e1) console.error(e1);
  else heroSlides?.forEach(r => console.log(`  ${r.title}: ${r.image_url || 'NULL'}`));
  
  console.log('\n=== GALLERY ===');
  const {data: gallery, error: e2} = await sb.from('gallery').select('id,title,image_url').limit(10);
  if (e2) console.error(e2);
  else gallery?.forEach(r => console.log(`  ${r.title}: ${r.image_url || 'NULL'}`));
  
  console.log('\n=== SERVICES ===');
  const {data: services, error: e3} = await sb.from('services').select('id,name,image_url').limit(10);
  if (e3) console.error(e3);
  else services?.forEach(r => console.log(`  ${r.name}: ${r.image_url || 'NULL'}`));
  
  console.log('\n=== MENU ITEMS ===');
  const {data: menuItems, error: e4} = await sb.from('menu_items').select('id,name,image_url').limit(10);
  if (e4) console.error(e4);
  else menuItems?.forEach(r => console.log(`  ${r.name}: ${r.image_url || 'NULL'}`));
  
  console.log('\n=== BUSINESS SETTINGS ===');
  const {data: bizSettings, error: e5} = await sb.from('business_settings').select('logo_url,favicon_url').limit(1);
  if (e5) console.error(e5);
  else bizSettings?.forEach(r => {
    console.log(`  logo_url: ${r.logo_url || 'NULL'}`);
    console.log(`  favicon_url: ${r.favicon_url || 'NULL'}`);
  });
  
  console.log('\n=== WEBSITE PAGES ===');
  const {data: pages, error: e6} = await sb.from('website_pages').select('id,title,page_key').limit(5);
  if (e6) console.error(e6);
  else pages?.forEach(r => console.log(`  ${r.page_key}: ${r.title}`));
}

audit().catch(console.error);
