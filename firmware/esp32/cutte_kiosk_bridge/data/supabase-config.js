'use strict';

// The Supabase URL and publishable key are safe to include in a browser app.
// Access is enforced by Row Level Security in supabase/migrations/.
window.UNIVUE_CONFIG = Object.freeze({
  supabaseUrl: 'https://scvwqyoyzosgavegjwhh.supabase.co',
  supabasePublishableKey: 'sb_publishable_9Hr1CuxY5nE5EbM9IYd0_g_ascL-Gur',
  kioskCode: 'UNIVUE-01',
  hardwareBaseUrl: ['localhost', '127.0.0.1'].includes(window.location.hostname) ? 'http://127.0.0.1:8787' : '',
  gcashQrImageUrl: ''
});
