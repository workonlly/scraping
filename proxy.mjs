import { chromium, devices } from 'playwright';
import os from 'os';
import { exec } from 'child_process';

// ─── PROXY POOL (5 working proxies) ───────────────────────────────────────────
const PROXY_POOL = [
  { server: 'http://107.151.249.106:3996', username: 'Huzaifach07',   password: 'echocore27'   },
  { server: 'http://107.151.249.106:3570', username: 'Huzaifach07',   password: 'echocore27'   },
  { server: 'http://107.151.249.106:3371', username: 'Huzaifach07',   password: 'echocore27'   },
  { server: 'http://107.151.249.39:3724',  username: 'abdullahUSA12', password: 'abdullahUSA12' },
  { server: 'http://107.151.249.39:4822',  username: 'abdullahUK12',  password: 'abdullahUK12'  }
];

// ─── CAMPAIGN SETTINGS ────────────────────────────────────────────────────────
const TARGET_URL         = 'https://daleelerah.info/pop-go/62492';
const TOTAL_CLICKS_GOAL  = 10_000_000;
const BATCH_SIZE         = 150;   // Max concurrent contexts open at once
const STAGGER_DELAY      = 300;   // ms between spawning each instance
const CYCLE_SIZE         = 500;   // Instances per cycle before browser restart
const SESSION_DURATION   = 30_000; // 30 seconds on page
const NAV_TIMEOUT        = 45_000; // Max time to load page
const CONTEXT_HARD_LIMIT = 90_000; // Unconditional context kill (nav + session + buffer)

// ─── CHROMIUM LAUNCH OPTIONS ──────────────────────────────────────────────────
// Only use Chromium: it is the most stable engine under high concurrency on Windows
const LAUNCH_OPTIONS = {
  headless: true,
  args: [
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--disable-webgl',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-default-apps',
    '--mute-audio',
    '--no-first-run',
    '--disable-sync',
    '--disable-translate',
    '--hide-scrollbars',
    '--metrics-recording-only',
    '--safebrowsing-disable-auto-update'
  ]
};

// ─── DEVICE PROFILES (desktop only — mobile causes extra render overhead) ─────
const DESKTOP_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
];

const LOCALES   = ['en-US', 'en-GB', 'en-CA'];
const TIMEZONES = ['America/New_York', 'Europe/London', 'America/Los_Angeles', 'America/Chicago'];

// ─── UTILITIES ────────────────────────────────────────────────────────────────
const sleep      = (ms) => new Promise(r => setTimeout(r, ms));
const rand       = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randItem   = (arr) => arr[rand(0, arr.length - 1)];
const randWidth  = () => rand(1024, 1440);
const randHeight = () => rand(768, 900);

// ─── SYSTEM RESET ─────────────────────────────────────────────────────────────
async function hardReset() {
  console.log('\n[System] Executing hard reset — killing stale processes...');
  return new Promise((resolve) => {
    exec('taskkill /F /IM chrome-headless-shell.exe /T 2>nul & taskkill /F /IM chrome.exe /T 2>nul', () => {
      const tempDir = os.tmpdir();
      exec(
        `powershell.exe -Command "Get-ChildItem -Path '${tempDir}' -Filter 'playwright_*' -Directory -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue"`,
        () => {
          console.log('[System] Hard reset complete. Waiting for OS to release handles...');
          setTimeout(resolve, 5000); // 5s for OS to release handles
        }
      );
    });
  });
}

// ─── BROWSER POOL ─────────────────────────────────────────────────────────────
let sharedBrowser = null;

async function launchBrowser() {
  try {
    sharedBrowser = await chromium.launch(LAUNCH_OPTIONS);
    console.log(`[Browser] Chromium launched successfully`);
    return true;
  } catch (err) {
    console.error(`[Browser] ❌ Failed to launch Chromium: ${err.message}`);
    sharedBrowser = null;
    return false;
  }
}

async function closeBrowser() {
  if (sharedBrowser) {
    try {
      await Promise.race([
        sharedBrowser.close(),
        sleep(10000)
      ]);
    } catch (e) {}
    sharedBrowser = null;
  }
}

// ─── SINGLE INSTANCE ──────────────────────────────────────────────────────────
async function runInstance(instanceIndex) {
  if (!sharedBrowser || !sharedBrowser.isConnected()) {
    return false;
  }

  const proxy       = PROXY_POOL[instanceIndex % PROXY_POOL.length];
  const userAgent   = randItem(DESKTOP_USER_AGENTS);
  const locale      = randItem(LOCALES);
  const timezone    = randItem(TIMEZONES);

  let context = null;
  let contextClosed = false;

  // ── Unconditional hard kill timer ─────────────────────────────────────────
  // No matter what — context is destroyed after CONTEXT_HARD_LIMIT ms
  let forceKillTimer = null;

  const forceKillContext = async () => {
    if (!contextClosed && context) {
      contextClosed = true;
      try { await context.close(); } catch (_) {}
    }
  };

  try {
    // Create context
    context = await Promise.race([
      sharedBrowser.newContext({
        viewport:         { width: randWidth(), height: randHeight() },
        userAgent:        userAgent,
        locale:           locale,
        timezoneId:       timezone,
        proxy:            proxy,
        ignoreHTTPSErrors: true,
        javaScriptEnabled: true
      }),
      sleep(20000).then(() => null)  // 20s context creation limit
    ]);

    if (!context) {
      return false;
    }

    // Arm the unconditional kill timer immediately after context creation
    forceKillTimer = setTimeout(forceKillContext, CONTEXT_HARD_LIMIT);

    context.setDefaultTimeout(NAV_TIMEOUT);
    context.setDefaultNavigationTimeout(NAV_TIMEOUT);

    const page = await context.newPage();

    console.log(`[${instanceIndex}] → proxy:${proxy.server.split(':').pop()} | ua:${userAgent.substring(25, 60)}...`);

    // Navigate to target
    await page.goto(TARGET_URL, {
      timeout:   NAV_TIMEOUT,
      waitUntil: 'domcontentloaded'
    });

    console.log(`[${instanceIndex}] ✔ Page loaded — starting ${SESSION_DURATION / 1000}s session`);

    // Random pre-click wait (20–80% of session)
    const preClick = rand(
      Math.floor(SESSION_DURATION * 0.2),
      Math.floor(SESSION_DURATION * 0.5)
    );
    await sleep(preClick);

    // Click
    const x = rand(150, 900);
    const y = rand(150, 600);
    await page.mouse.move(x, y, { steps: 5 });
    await page.mouse.click(x, y);

    // Remaining session time
    const remaining = SESSION_DURATION - preClick;
    await sleep(remaining);

    console.log(`[${instanceIndex}] ✅ Done`);
    return true;

  } catch (err) {
    // Navigation timeout or proxy reject — just log and move on
    const msg = err.message.split('\n')[0].substring(0, 80);
    console.error(`[${instanceIndex}] ❌ ${msg}`);
    return false;

  } finally {
    // Always clean up
    if (forceKillTimer) clearTimeout(forceKillTimer);
    if (!contextClosed && context) {
      contextClosed = true;
      try { await Promise.race([context.close(), sleep(5000)]); } catch (_) {}
    }
  }
}

// ─── MAIN CAMPAIGN RUNNER ─────────────────────────────────────────────────────
async function runMassiveTraffic() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║       TRAFFIC CAMPAIGN — STARTING                ║');
  console.log(`║  Goal: ${TOTAL_CLICKS_GOAL.toLocaleString()} clicks                  ║`);
  console.log(`║  Batch: ${BATCH_SIZE} concurrent | Cycle: ${CYCLE_SIZE}             ║`);
  console.log('╚══════════════════════════════════════════════════╝\n');

  let succeeded    = 0;
  let failed       = 0;
  let completed    = 0;
  let cycleStart   = 0;

  while (cycleStart < TOTAL_CLICKS_GOAL) {
    const cycleEnd  = Math.min(cycleStart + CYCLE_SIZE, TOTAL_CLICKS_GOAL);
    const cycleSize = cycleEnd - cycleStart;

    console.log(`\n══════════════════════════════════════════════════`);
    console.log(`  CYCLE: instances ${cycleStart}–${cycleEnd - 1} (${cycleSize} total)`);
    console.log(`══════════════════════════════════════════════════\n`);

    // Kill leftover processes and clear temp dir
    await hardReset();

    // Launch fresh browser for this cycle
    const launched = await launchBrowser();
    if (!launched) {
      console.error('[Campaign] Cannot launch browser — retrying in 10s...');
      await sleep(10000);
      continue;  // Retry the same cycle
    }

    // ── Queue runner ─────────────────────────────────────────────────────────
    let activeCount      = 0;
    let startedThisCycle = 0;

    await new Promise((resolveCycle) => {
      const tick = async () => {
        // Launch new instances until batch is full or cycle is done
        while (startedThisCycle < cycleSize && activeCount < BATCH_SIZE) {
          const instanceIndex = cycleStart + startedThisCycle;
          startedThisCycle++;
          activeCount++;

          runInstance(instanceIndex).then((ok) => {
            activeCount--;
            completed++;
            if (ok) succeeded++; else failed++;
            const pct = ((completed / TOTAL_CLICKS_GOAL) * 100).toFixed(2);
            console.log(`[Progress] ${completed}/${TOTAL_CLICKS_GOAL} (${pct}%) | active:${activeCount} | ✅${succeeded} ❌${failed}`);
            // If cycle is done and no more active, resolve
            if (startedThisCycle >= cycleSize && activeCount === 0) {
              resolveCycle();
            }
          });

          await sleep(STAGGER_DELAY);
        }

        // Keep ticking while there are still instances to launch or running
        if (startedThisCycle < cycleSize || activeCount > 0) {
          setTimeout(tick, 100);
        }
      };

      tick();
    });

    // ── Cycle complete — close browser cleanly ────────────────────────────
    console.log(`\n[Cycle] Complete. Closing browser...`);
    await closeBrowser();
    await sleep(2000);

    cycleStart = cycleEnd;
  }

  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║  CAMPAIGN FINISHED                               ║`);
  console.log(`║  ✅ Succeeded: ${succeeded.toLocaleString().padEnd(33)}║`);
  console.log(`║  ❌ Failed:    ${failed.toLocaleString().padEnd(33)}║`);
  console.log(`╚══════════════════════════════════════════════════╝`);
}

runMassiveTraffic();