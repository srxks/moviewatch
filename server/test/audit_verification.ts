import { checkDistrict } from '../src/providers/district.js';
import { checkBookMyShow } from '../src/providers/bookmyshow.js';
import { WatchTarget } from '../src/types.js';

async function audit() {
  console.log('=== PRE-DEPLOYMENT AUDIT: PROVIDER VERIFICATION ===\n');

  // Today's date in IST
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  console.log(`Auditing for date (IST): ${today}\n`);

  // 1. DISTRICT AUDIT
  console.log('--- 1. DISTRICT DIRECT API AUDIT ---');
  const districtTarget: WatchTarget = {
    id: 'district-audit',
    name: 'O.M: Operation Mole — Chennai',
    provider: 'district',
    movieCode: '225928',
    contentId: '225928',
    city: 'chennai',
    lat: '13.0827',
    lng: '80.2707',
    targetDates: [today],
    cinemaFilter: 'Sangam',
    formatFilter: '2D',
    enabled: true,
    pollIntervalSec: 60,
    createdAt: new Date().toISOString(),
  };

  const t0 = performance.now();
  const dRes = await checkDistrict(districtTarget, today);
  const t1 = performance.now();
  const measuredDistrictMs = Math.round(t1 - t0);

  console.log(`District API status: ${dRes.kind}`);
  console.log(`Measured wall-clock latency: ${measuredDistrictMs}ms (reported: ${dRes.latencyMs}ms)`);
  console.log(`Total sessions returned across city: ${dRes.sessions?.length || 0}`);
  console.log(`Sessions matching cinema 'Sangam' and format '2D': ${dRes.matchedSessions?.length || 0}`);

  if (dRes.matchedSessions && dRes.matchedSessions.length > 0) {
    const s = dRes.matchedSessions[0];
    console.log('Sample matched session verification:');
    console.log(`  - Cinema: ${s.cinema}`);
    console.log(`  - Showtime: ${s.time}`);
    console.log(`  - Auditorium: ${s.audi}`);
    console.log(`  - Format: ${s.format}`);
    console.log(`  - Available Seats: ${s.avail}`);
    console.log(`  - Total Seats: ${s.total}`);
    console.log(`  - Price Tiers: ${s.tiers}`);
    console.log(`  - Booking URL: ${s.bookingUrl}`);
  }

  // 2. BOOKMYSHOW AUDIT
  console.log('\n--- 2. BOOKMYSHOW DIRECT API AUDIT ---');
  const bmsTarget: WatchTarget = {
    id: 'bms-audit',
    name: 'Dune: Part Three — Chennai IMAX',
    provider: 'bookmyshow',
    movieCode: 'ET00526290',
    refEventCode: 'ET00526290',
    city: 'chennai',
    regionCode: 'CHEN',
    regionSlug: 'chennai',
    lat: '13.0827',
    lng: '80.2707',
    targetDates: [today],
    cinemaFilter: '',
    formatFilter: 'IMAX',
    enabled: true,
    pollIntervalSec: 60,
    createdAt: new Date().toISOString(),
  };

  const b0 = performance.now();
  const bRes = await checkBookMyShow(bmsTarget, today);
  const b1 = performance.now();
  const measuredBmsMs = Math.round(b1 - b0);

  console.log(`BookMyShow API status: ${bRes.kind}`);
  console.log(`Measured wall-clock latency: ${measuredBmsMs}ms (reported: ${bRes.latencyMs}ms)`);
  console.log(`Total sessions parsed: ${bRes.sessions?.length || 0}`);
  console.log(`Sessions matching IMAX: ${bRes.matchedSessions?.length || 0}`);

  if (bRes.matchedSessions && bRes.matchedSessions.length > 0) {
    const s = bRes.matchedSessions[0];
    console.log('Sample BMS session verification:');
    console.log(`  - Cinema: ${s.cinema}`);
    console.log(`  - Showtime: ${s.time}`);
    console.log(`  - Format: ${s.format}`);
    console.log(`  - Price/Seat Tiers: ${s.tiers || 'N/A'}`);
    console.log(`  - Booking URL: ${s.bookingUrl}`);
  } else if (bRes.kind === 'closed') {
    console.log(`  - Note: ${bRes.note}`);
  } else if (bRes.kind === 'error') {
    console.log(`  - Telemetry error: ${bRes.error}`);
  }

  console.log('\n=== AUDIT VERIFICATION COMPLETE ===');
}

audit().catch(console.error);
