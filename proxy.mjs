import { chromium, firefox, webkit, devices } from 'playwright';
import os from 'os';

const PROXY_CONFIG = {
  server: 'http://107.151.249.39:4822',
  username: 'abdullahUK',
  password: 'abdullahUK'
};

const TARGET_URL = process.env.TARGET_URL || 'https://example.com/target';
const TOTAL_CLICKS_GOAL = 10000000;

const BATCH_SIZE = 100;
const STAGGER_DELAY = 250;
const MAX_RETRIES = 2;
const SESSION_DURATION = 30000;
const PROXY_TIMEOUT = 150000;

const chromiumOptions = { 
  headless: true,
  args: ['--disable-gpu', '--disable-software-rasterizer', '--disable-dev-shm-usage', '--no-sandbox']
};

const standardOptions = { headless: true };

const browserWrapper = { chromium: null, firefox: null, webkit: null };

const deviceNames = Object.keys(devices);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(null), ms))
  ]);
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomDevice() {
  const randomDeviceName = deviceNames[getRandomInt(0, deviceNames.length - 1)];
  return { name: randomDeviceName, config: devices[randomDeviceName] };
}

async function getBrowser(engine, forceRecreate = false) {
  if (forceRecreate || !browserWrapper[engine] || !browserWrapper[engine].isConnected()) {
    if (browserWrapper[engine]) {
      try {
        await withTimeout(browserWrapper[engine].close(), 5000);
      } catch (e) {}
    }
    const launchOptions = engine === 'chromium' ? chromiumOptions : standardOptions;
    const launcher = engine === 'chromium' ? chromium : (engine === 'firefox' ? firefox : webkit);
    
    browserWrapper[engine] = await launcher.launch(launchOptions).catch(error => {
      console.error(`❌ Failed to launch ${engine} browser:`, error.message);
      return null;
    });
  }
  return browserWrapper[engine];
}

async function runInstance(instanceIndex) {
  const availableEngines = Object.keys(browserWrapper).filter(
    key => browserWrapper[key] && browserWrapper[key].isConnected()
  );
  
  if (availableEngines.length === 0) {
    return false;
  }

  const randomEngine = availableEngines[getRandomInt(0, availableEngines.length - 1)];
  const browser = browserWrapper[randomEngine];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const randomDevice = getRandomDevice();

    const result = await browser.newContext({
      ...randomDevice.config,
      proxy: PROXY_CONFIG,
      ignoreHTTPSErrors: true
    }).then(async (context) => {
      context.setDefaultTimeout(PROXY_TIMEOUT);
      context.setDefaultNavigationTimeout(PROXY_TIMEOUT);
      const page = await context.newPage();

      console.log(`[Instance ${instanceIndex}] Starting on ${randomEngine} as ${randomDevice.name} (Attempt ${attempt}/${MAX_RETRIES})`);

      const success = await page.goto(TARGET_URL, {
        timeout: PROXY_TIMEOUT,
        waitUntil: 'load'
      }).then(async () => {
        console.log(`[Instance ${instanceIndex}] Page loaded. Starting ${SESSION_DURATION / 1000}s session...`);

        const timeBeforeClick = getRandomInt(Math.floor(SESSION_DURATION * 0.2), Math.floor(SESSION_DURATION * 0.8));
        const timeAfterClick = SESSION_DURATION - timeBeforeClick;

        await sleep(timeBeforeClick);

        const targetX = getRandomInt(100, 800);
        const targetY = getRandomInt(100, 800);
        const steps = 10;
        
        await page.mouse.move(targetX, targetY, { steps });
        await page.mouse.click(targetX, targetY);
        console.log(`[Instance ${instanceIndex}] Clicked at (${targetX}, ${targetY}) after ${steps} steps. Waiting remaining ${timeAfterClick / 1000}s...`);

        await sleep(timeAfterClick);
        console.log(`[Instance ${instanceIndex}] ✅ Completed ${SESSION_DURATION / 1000}s session successfully.`);
        return true;
      }).catch(async (error) => {
        console.error(`[Instance ${instanceIndex}] ❌ Attempt ${attempt} failed: ${error.message}`);
        return false;
      });

      await withTimeout(context.close(), 10000);
      return success;
    }).catch(async (error) => {
      console.error(`[Instance ${instanceIndex}] ❌ Setup failed: ${error.message}`);
      return false;
    });

    if (result) return true;
    if (attempt < MAX_RETRIES) {
      await sleep(2000 + Math.random() * 3000);
    }
  }
  return false;
}

async function runMassiveTraffic() {
  console.log("Starting campaign...");
  console.log(`Running max concurrency: ${BATCH_SIZE} parallel sessions.\n`);

  let succeeded = 0;
  let failed = 0;
  let completedCount = 0;

  for (let i = 0; i < TOTAL_CLICKS_GOAL; i += 1000) {
    const segmentEnd = Math.min(i + 1000, TOTAL_CLICKS_GOAL);
    console.log(`\n======================================================`);
    console.log(`--- Starting Cycle (instances ${i}–${segmentEnd - 1}) ---`);
    console.log(`======================================================\n`);

    const launches = await Promise.all([
      getBrowser('chromium', true),
      getBrowser('firefox', true),
      getBrowser('webkit', true)
    ]).catch(() => null);

    if (!launches || (!browserWrapper.chromium && !browserWrapper.firefox && !browserWrapper.webkit)) {
      console.error("❌ Failed to launch any browser engines.");
      await sleep(5000);
      continue;
    }

    let activeCount = 0;
    let startedInSegment = 0;
    const segmentSize = segmentEnd - i;

    const runQueue = async () => {
      while (startedInSegment < segmentSize) {
        if (activeCount < BATCH_SIZE) {
          const instanceIndex = i + startedInSegment;
          startedInSegment++;
          activeCount++;

          runInstance(instanceIndex).then((success) => {
            activeCount--;
            completedCount++;
            if (success) succeeded++; else failed++;
            console.log(`[Progress] Completed: ${completedCount}/${TOTAL_CLICKS_GOAL} | Active: ${activeCount} | Success: ${succeeded} | Failed: ${failed}`);
          });

          await sleep(STAGGER_DELAY);
        } else {
          await sleep(50);
        }
      }

      while (activeCount > 0) {
        await sleep(100);
      }
    };

    await runQueue();

    await Promise.all([
      browserWrapper.chromium ? withTimeout(browserWrapper.chromium.close(), 15000) : Promise.resolve(),
      browserWrapper.firefox ? withTimeout(browserWrapper.firefox.close(), 15000) : Promise.resolve(),
      browserWrapper.webkit ? withTimeout(browserWrapper.webkit.close(), 15000) : Promise.resolve()
    ]).catch(() => {});

    browserWrapper.chromium = null;
    browserWrapper.firefox = null;
    browserWrapper.webkit = null;
  }

  console.log(`\nTraffic Campaign Finished. Total Succeeded: ${succeeded}, Total Failed: ${failed}.`);
}

runMassiveTraffic();