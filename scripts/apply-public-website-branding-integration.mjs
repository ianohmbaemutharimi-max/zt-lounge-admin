#!/usr/bin/env node

/**
 * ZT LOUNGE PUBLIC WEBSITE — CMS BRANDING INTEGRATION
 * 
 * Applies minimal changes to integrate CMS branding with public website
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const websitePath = join(__dirname, '../../zt-lounge');

console.log('═══════════════════════════════════════════════════════════');
console.log('  ZT LOUNGE PUBLIC WEBSITE — CMS BRANDING INTEGRATION');
console.log('═══════════════════════════════════════════════════════════\n');

const changes = [];

// ============================================================
// STEP 1: EXTEND BUSINESSREPOSITORY WITH MEDIA RESOLUTION
// ============================================================

console.log('📝 STEP 1: Extending BusinessRepository with media resolution...\n');

const businessRepoPath = join(websitePath, 'assets/js/repositories/BusinessRepository.js');
const businessRepo = readFileSync(businessRepoPath, 'utf-8');

// Add media resolution function after line 55 (after mapToUI function)
const enhancedBusinessRepo = businessRepo.replace(
  `        return {
            id: item.id,
            business_name: item.business_name || item.businessName || '',
            tagline: item.tagline || '',
            description: item.description || '',
            email: item.email || '',
            phone: item.phone || '',
            phoneRaw: (item.phone || '').replace(/\\D/g, ''),
            address: item.address || '',
            city: item.city || '',
            country: item.country || '',
            latitude: item.latitude || 0,
            longitude: item.longitude || 0,
            opening_hours: item.opening_hours || item.hours || {},
            logo_url: item.logo_url || item.logo || '',
            whatsapp: item.whatsapp || '',
            facebook: item.facebook || '',
            instagram: item.instagram || '',
            twitter: item.twitter || '',
            youtube: item.youtube || '',
            google_maps_url: item.google_maps_url || ''
        };`,
  `        return {
            id: item.id,
            business_name: item.business_name || item.businessName || '',
            tagline: item.tagline || '',
            description: item.description || '',
            email: item.email || '',
            phone: item.phone || '',
            phoneRaw: (item.phone || '').replace(/\\D/g, ''),
            address: item.address || '',
            city: item.city || '',
            country: item.country || '',
            latitude: item.latitude || 0,
            longitude: item.longitude || 0,
            opening_hours: item.opening_hours || item.hours || {},
            logo_url: item.logo_url || item.logo || '',
            logo_media_id: item.logo_media_id || null,
            favicon_url: item.favicon_url || '',
            favicon_media_id: item.favicon_media_id || null,
            whatsapp: item.whatsapp || '',
            facebook: item.facebook || '',
            instagram: item.instagram || '',
            twitter: item.twitter || '',
            youtube: item.youtube || '',
            google_maps_url: item.google_maps_url || ''
        };`
);

// Add resolveMediaId function before getRepo()
const repoWithMediaResolver = enhancedBusinessRepo.replace(
  `    function getRepo() {`,
  `    /**
     * Resolve media_id to public_url from media_assets table
     * @param {string} mediaId - UUID of media asset
     * @returns {Promise<string|null>} Public URL or null
     */
    function resolveMediaId(mediaId) {
        if (!mediaId) return Promise.resolve(null);
        
        try {
            var supabase = window.supabaseClient;
            if (!supabase) {
                console.warn('[BusinessRepository] Supabase client not initialized');
                return Promise.resolve(null);
            }
            
            return supabase
                .from('media_assets')
                .select('public_url')
                .eq('id', mediaId)
                .single()
                .then(function(result) {
                    if (result.error) {
                        console.warn('[BusinessRepository] Media resolution failed:', result.error.message);
                        return null;
                    }
                    return result.data ? result.data.public_url : null;
                })
                .catch(function(error) {
                    console.warn('[BusinessRepository] Media resolution error:', error.message);
                    return null;
                });
        } catch (error) {
            console.warn('[BusinessRepository] Media resolution exception:', error.message);
            return Promise.resolve(null);
        }
    }

    function getRepo() {`
);

// Update getAll() to resolve media IDs
const finalBusinessRepo = repoWithMediaResolver.replace(
  `        return getRepo().getAll({
            limit: 1
        }).then(function(data) {
            if (data && data.length > 0) {
                cachedData = mapToUI(data[0]);
                // Add backwards compatible camelCase aliases
                cachedData.businessName = cachedData.business_name;
                cachedData.hours = cachedData.opening_hours;
                cachedData.logo = cachedData.logo_url;
                return cachedData;
            }`,
  `        return getRepo().getAll({
            limit: 1
        }).then(function(data) {
            if (data && data.length > 0) {
                var settings = mapToUI(data[0]);
                
                // Resolve media IDs to public URLs
                return Promise.all([
                    resolveMediaId(settings.logo_media_id),
                    resolveMediaId(settings.favicon_media_id)
                ]).then(function(results) {
                    var resolvedLogoUrl = results[0];
                    var resolvedFaviconUrl = results[1];
                    
                    // Build final settings with resolved media URLs
                    cachedData = settings;
                    cachedData.businessName = cachedData.business_name;
                    cachedData.hours = cachedData.opening_hours;
                    // Use resolved media URL, fallback to logo_url, then static
                    cachedData.logo = resolvedLogoUrl || cachedData.logo_url;
                    cachedData.favicon = resolvedFaviconUrl || cachedData.favicon_url;
                    
                    return cachedData;
                });
            }`
);

writeFileSync(businessRepoPath, finalBusinessRepo, 'utf-8');
console.log('   ✓ BusinessRepository enhanced with media resolution');
console.log('   ✓ Added resolveMediaId() function');
console.log('   ✓ Added logo_media_id and favicon_media_id mapping');
console.log('   ✓ Integrated resolution into getAll()');

changes.push({
  file: 'assets/js/repositories/BusinessRepository.js',
  changes: [
    'Added resolveMediaId() function',
    'Added logo_media_id, favicon_media_id to mapToUI()',
    'Integrated media resolution into getAll()',
    'Fallback chain: media_id → legacy_url → static'
  ]
});

// ============================================================
// STEP 2: TRANSFORM BUSINESS-CONFIG.JS TO DYNAMIC
// ============================================================

console.log('\n📝 STEP 2: Transforming business-config.js to dynamic loader...\n');

const businessConfigPath = join(websitePath, 'assets/js/business-config.js');

const dynamicBusinessConfig = `/**
 * ============================================================
 * ZT Lounge Meru - Business Configuration Loader
 * Dynamic integration with CMS via BusinessRepository
 * Version: 2.0.0 - CMS Integration
 * ============================================================
 *
 * This configuration is now dynamically loaded from the CMS.
 * Logo and favicon changes in the admin dashboard automatically
 * reflect on the public website.
 * ============================================================
 */

(function() {
    'use strict';

    // Static fallback configuration (used if Supabase is unreachable)
    var FALLBACK_CONFIG = {
        name: 'ZT Lounge Meru',
        tagline: 'Premium Hospitality Destination',
        phone: '+254 143 542 601',
        phoneRaw: '254143542601',
        email: 'ztloungemeru@gmail.com',
        address: {
            street: 'Milimani Road',
            area: 'Opposite Ezri Hotel, Milimani',
            city: 'Meru',
            region: 'Meru County',
            postalCode: '60200',
            country: 'Kenya',
            full: 'Milimani Road, Meru, Kenya',
            short: 'Milimani, Meru'
        },
        hours: {
            restaurant: 'Mon - Sun: 10:00 AM - 2:00 AM',
            autospa: 'Mon - Sun: 8:00 AM - 6:00 PM',
            default: 'Mon - Sun: 10:00 AM - 2:00 AM'
        },
        social: {
            whatsapp: 'https://wa.me/254143542601',
            facebook: 'https://facebook.com/ztlounge',
            instagram: 'https://instagram.com/ztlounge',
            twitter: 'https://x.com/ztlounge_meru',
            youtube: 'https://youtube.com/@ztlounge'
        },
        googleMaps: 'https://maps.app.goo.gl/HqTbiiU4q2jRFoPg6',
        logo: {
            dark: 'https://jczwilrysvnhcjzjztbi.supabase.co/storage/v1/object/public/public-assets/images/branding/logo.webp',
            light: 'https://jczwilrysvnhcjzjztbi.supabase.co/storage/v1/object/public/public-assets/images/branding/logo-white.webp',
            alt: 'ZT Lounge Meru - Premium Hospitality Logo'
        },
        favicon: 'https://jczwilrysvnhcjzjztbi.supabase.co/storage/v1/object/public/public-assets/images/branding/favicon.ico',
        seo: {
            siteName: 'ZT Lounge Meru',
            locale: 'en_KE',
            url: 'https://ztlounge.co.ke'
        },
        trust: {
            happyGuests: '200+',
            eventsHosted: '500+',
            responseTime: 'Fast Response Within 30 Minutes'
        }
    };

    /**
     * Load business configuration dynamically from CMS
     * @returns {Promise<Object>} Business configuration
     */
    function loadBusinessConfig() {
        // Check if BusinessRepository is available
        if (typeof window.BusinessRepository === 'undefined') {
            console.warn('[BusinessConfig] BusinessRepository not loaded, using fallback');
            return Promise.resolve(FALLBACK_CONFIG);
        }

        return window.BusinessRepository.getAll()
            .then(function(settings) {
                if (!settings) {
                    console.warn('[BusinessConfig] No settings returned, using fallback');
                    return FALLBACK_CONFIG;
                }

                // Build dynamic config from CMS data
                var config = {
                    name: settings.business_name || FALLBACK_CONFIG.name,
                    tagline: settings.tagline || FALLBACK_CONFIG.tagline,
                    phone: settings.phone || FALLBACK_CONFIG.phone,
                    phoneRaw: settings.phoneRaw || FALLBACK_CONFIG.phoneRaw,
                    email: settings.email || FALLBACK_CONFIG.email,
                    address: {
                        street: settings.address || FALLBACK_CONFIG.address.street,
                        area: settings.address || FALLBACK_CONFIG.address.area,
                        city: settings.city || FALLBACK_CONFIG.address.city,
                        region: FALLBACK_CONFIG.address.region,
                        postalCode: FALLBACK_CONFIG.address.postalCode,
                        country: settings.country || FALLBACK_CONFIG.address.country,
                        full: settings.address || FALLBACK_CONFIG.address.full,
                        short: (settings.city || 'Meru') + ', ' + (settings.country || 'Kenya')
                    },
                    hours: settings.opening_hours || settings.hours || FALLBACK_CONFIG.hours,
                    social: {
                        whatsapp: settings.whatsapp || FALLBACK_CONFIG.social.whatsapp,
                        facebook: settings.facebook || FALLBACK_CONFIG.social.facebook,
                        instagram: settings.instagram || FALLBACK_CONFIG.social.instagram,
                        twitter: settings.twitter || FALLBACK_CONFIG.social.twitter,
                        youtube: settings.youtube || FALLBACK_CONFIG.social.youtube
                    },
                    googleMaps: settings.google_maps_url || FALLBACK_CONFIG.googleMaps,
                    // CMS-resolved logo (media_id already resolved by BusinessRepository)
                    logo: {
                        dark: settings.logo || FALLBACK_CONFIG.logo.dark,
                        light: settings.logo || FALLBACK_CONFIG.logo.light,
                        alt: (settings.business_name || 'ZT Lounge Meru') + ' Logo'
                    },
                    // CMS-resolved favicon
                    favicon: settings.favicon || FALLBACK_CONFIG.favicon,
                    seo: {
                        siteName: settings.business_name || FALLBACK_CONFIG.seo.siteName,
                        locale: FALLBACK_CONFIG.seo.locale,
                        url: FALLBACK_CONFIG.seo.url
                    },
                    trust: FALLBACK_CONFIG.trust
                };

                return config;
            })
            .catch(function(error) {
                console.warn('[BusinessConfig] Failed to load from CMS:', error.message);
                return FALLBACK_CONFIG;
            });
    }

    /**
     * Initialize business configuration
     * Called automatically on page load
     */
    function initBusinessConfig() {
        loadBusinessConfig()
            .then(function(config) {
                // Freeze and expose globally
                window.BusinessConfig = Object.freeze(config);
                
                // Update favicon dynamically
                if (config.favicon) {
                    var faviconLink = document.querySelector('link[rel="icon"]');
                    if (faviconLink) {
                        faviconLink.href = config.favicon;
                    }
                }
                
                // Emit event for components waiting on config
                var event = document.createEvent('Event');
                event.initEvent('business-config-loaded', true, true);
                document.dispatchEvent(event);
                
                console.log('[BusinessConfig] CMS configuration loaded successfully');
            })
            .catch(function(error) {
                console.error('[BusinessConfig] Initialization failed:', error);
                // Still expose fallback config
                window.BusinessConfig = Object.freeze(FALLBACK_CONFIG);
            });
    }

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBusinessConfig);
    } else {
        // DOM already loaded
        initBusinessConfig();
    }

    // Export for module systems
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { loadBusinessConfig: loadBusinessConfig };
    }
})();
`;

writeFileSync(businessConfigPath, dynamicBusinessConfig, 'utf-8');
console.log('   ✓ business-config.js transformed to dynamic loader');
console.log('   ✓ Integrates with BusinessRepository');
console.log('   ✓ Auto-initializes on page load');
console.log('   ✓ Updates favicon dynamically');
console.log('   ✓ Emits "business-config-loaded" event');
console.log('   ✓ Maintains fallback configuration');

changes.push({
  file: 'assets/js/business-config.js',
  changes: [
    'Converted from static object to dynamic loader',
    'Fetches from BusinessRepository (CMS-backed)',
    'Auto-initializes on DOMContentLoaded',
    'Updates favicon dynamically',
    'Triple fallback: CMS → legacy → static',
    'Emits "business-config-loaded" event'
  ]
});

// ============================================================
// FINAL SUMMARY
// ============================================================

console.log('\n\n═══════════════════════════════════════════════════════════');
console.log('  INTEGRATION COMPLETE');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('FILES MODIFIED:\n');
changes.forEach(change => {
  console.log(`📄 ${change.file}`);
  change.changes.forEach(c => console.log(`   • ${c}`));
  console.log('');
});

console.log('LOGO RESOLUTION FLOW:');
console.log('   1. business_settings.logo_media_id');
console.log('   2. media_assets.public_url (via resolveMediaId)');
console.log('   3. business_settings.logo_url (legacy)');
console.log('   4. Static fallback URL\n');

console.log('FAVICON RESOLUTION FLOW:');
console.log('   1. business_settings.favicon_media_id');
console.log('   2. media_assets.public_url (via resolveMediaId)');
console.log('   3. business_settings.favicon_url (legacy)');
console.log('   4. Static fallback /favicon.ico\n');

console.log('INITIALIZATION SEQUENCE:');
console.log('   1. Supabase client initializes');
console.log('   2. BusinessRepository loads');
console.log('   3. business-config.js auto-initializes');
console.log('   4. Fetches business_settings from Supabase');
console.log('   5. Resolves media_ids to public_urls');
console.log('   6. Populates window.BusinessConfig');
console.log('   7. Updates favicon in DOM');
console.log('   8. Emits "business-config-loaded" event');
console.log('   9. UI components render with CMS data\n');

console.log('═══════════════════════════════════════════════════════════');
console.log('  NEXT STEPS');
console.log('═══════════════════════════════════════════════════════════\n');

console.log('1. VERIFICATION:');
console.log('   • Open public website');
console.log('   • Check browser console for "[BusinessConfig] CMS configuration loaded"');
console.log('   • Inspect logo src in navbar');
console.log('   • Inspect favicon href in browser tab\n');

console.log('2. CMS TEST:');
console.log('   • Open admin dashboard');
console.log('   • Upload new logo to Media Library');
console.log('   • Navigate to Business Settings');
console.log('   • Select new logo');
console.log('   • Save changes');
console.log('   • Reload public website');
console.log('   • Verify new logo appears\n');

console.log('3. FALLBACK TEST:');
console.log('   • Disconnect from internet');
console.log('   • Clear browser cache');
console.log('   • Reload website');
console.log('   • Verify static fallback logo displays\n');

console.log('═══════════════════════════════════════════════════════════\n');

const report = {
  timestamp: new Date().toISOString(),
  filesModified: changes.map(c => c.file),
  changes: changes,
  logoFlow: [
    'business_settings.logo_media_id',
    'media_assets.public_url',
    'business_settings.logo_url',
    'Static fallback'
  ],
  faviconFlow: [
    'business_settings.favicon_media_id',
    'media_assets.public_url',
    'business_settings.favicon_url',
    'Static fallback'
  ],
  status: 'COMPLETE'
};

writeFileSync(
  join(__dirname, '../PUBLIC_WEBSITE_CMS_BRANDING_INTEGRATION_REPORT.json'),
  JSON.stringify(report, null, 2)
);

console.log('✅ Integration complete\n');
console.log('Report saved: PUBLIC_WEBSITE_CMS_BRANDING_INTEGRATION_REPORT.json\n');
