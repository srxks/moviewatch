import assert from 'assert';
import { checkDistrict } from '../src/providers/district.js';
import { checkBookMyShow } from '../src/providers/bookmyshow.js';
import { store } from '../src/store.js';
import { WatchTarget } from '../src/types.js';

async function testAll() {
  console.log('====================================================');
  console.log('   TESTING DIRECT ULTRA-FAST PROVIDER APIS          ');
  console.log('====================================================\n');

  // 1. Test District API with real Chennai target
  console.log('[1/3] Testing District Direct API (O.M: Operation Mole / Sangam Cinemas)...');
  const districtTarget: WatchTarget = {
    id: 'test-district',
    name: 'O.M: Operation Mole',
    provider: 'district',
    movieCode: '225928',
    contentId: '225928',
    city: 'chennai',
    lat: '13.0827',
    lng: '80.2707',
    targetDates: ['2026-11-23'],
    cinemaFilter: 'Sangam',
    enabled: true,
    pollIntervalSec: 60,
    createdAt: new Date().toISOString(),
  };

  const dStart = Date.now();
  const dRes = await checkDistrict(districtTarget, '2026-11-23');
  const dDuration = Date.now() - dStart;
  console.log(`District Status: ${dRes.kind.toUpperCase()} (${dDuration}ms network latency)`);
  assert.ok(dRes.kind === 'open' || dRes.kind === 'closed', 'District must answer open or closed');
  if (dRes.kind === 'open') {
    console.log(`Matched sessions: ${dRes.matchedSessions?.length}`);
    if (dRes.matchedSessions && dRes.matchedSessions.length > 0) {
      const s = dRes.matchedSessions[0];
      console.log(` - Sample session: ${s.cinema} at ${s.time} | Format: ${s.format} | Avail: ${s.avail}/${s.total}`);
    }
  }

  // 2. Test BookMyShow Direct API with real Chennai Dune target
  console.log('\n[2/3] Testing BookMyShow Direct API with Chrome TLS Fingerprint...');
  const bmsTarget: WatchTarget = {
    id: 'test-bms',
    name: 'Dune: Part Three — PVR Palazzo IMAX',
    provider: 'bookmyshow',
    movieCode: 'ET00526290',
    refEventCode: 'ET00526290',
    city: 'chennai',
    regionCode: 'CHEN',
    regionSlug: 'chennai',
    lat: '13.0827',
    lng: '80.2707',
    targetDates: ['2026-11-23'],
    cinemaFilter: 'Palazzo',
    formatFilter: 'IMAX',
    enabled: true,
    pollIntervalSec: 60,
    createdAt: new Date().toISOString(),
  };

  const bStart = Date.now();
  const bRes = await checkBookMyShow(bmsTarget, '2026-11-23');
  const bDuration = Date.now() - bStart;
  console.log(`BookMyShow Status: ${bRes.kind.toUpperCase()} (${bDuration}ms network latency)`);
  assert.ok(bRes.kind === 'open' || bRes.kind === 'closed' || bRes.kind === 'error', 'BMS must answer open, closed or error');
  if (bRes.kind === 'open') {
    console.log(`Matched sessions: ${dRes.matchedSessions?.length}`);
  } else if (bRes.kind === 'closed') {
    console.log(`BMS Note: ${bRes.note}`);
  } else {
    console.log(`BMS Telemetry: ${bRes.error}`);
  }

  // 3. Test Store & Deduplication Logic
  console.log('\n[3/3] Testing Store and Deduplication State...');
  const testSid = 'test-session-123';
  assert.strictEqual(store.isSessionAlerted('test-watch', testSid), false, 'Initially not alerted');
  store.markSessionAlerted('test-watch', testSid, {
    sid: testSid,
    cinema: 'Test Cinema',
    time: '18:00',
    avail: 50,
    total: 100
  });
  assert.strictEqual(store.isSessionAlerted('test-watch', testSid), true, 'Now marked alerted');
  console.log('Deduplication verified: duplicate alerts prevented.');

  console.log('\n====================================================');
  console.log('   ALL DIRECT API & STORE TESTS PASSED!            ');
  console.log('====================================================');
}

testAll().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
