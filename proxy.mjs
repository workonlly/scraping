import { chromium, firefox, webkit, devices } from 'playwright';
import os from 'os';
import { exec } from 'child_process';

const PROXY_POOL = [
  { server: 'http://107.151.249.106:3996', username: 'Huzaifach07', password: 'echocore27' },
  { server: 'http://107.151.249.106:3570', username: 'Huzaifach07', password: 'echocore27' },
  { server: 'http://107.151.249.106:3371', username: 'Huzaifach07', password: 'echocore27' }
];

const TARGET_URL = 'https://daleelerah.info/pop-go/62492';
const TOTAL_CLICKS_GOAL = 10000000;

const BATCH_SIZE = 300;
const STAGGER_DELAY = 1000;
const MAX_RETRIES = 2;
const SESSION_DURATION = 30000;
const PROXY_TIMEOUT = 120000;

const chromiumOptions = {
  headless: true,
  args: ['--disable-gpu', '--disable-software-rasterizer', '--disable-dev-shm-usage', '--no-sandbox', '--disable-webgl']
};

const standardOptions = { headless: true };

const browserWrapper = { chromium: null, firefox: null, webkit: null };

const deviceNames = Object.keys(devices);

const locales = ['en-US', 'en-GB', 'en-CA', 'fr-FR', 'de-DE'];
const timezones = ['America/New_York', 'Europe/London', 'America/Los_Angeles', 'Europe/Paris'];

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

function hardReset() {
  console.log("Executing system hard reset...");
  exec('taskkill /F /IM chrome-headless-shell.exe /T', () => {});
  exec('taskkill /F /IM firefox.exe /T', () => {});
  exec('taskkill /F /IM webkit.exe /T', () => {});
  const tempDir = os.tmpdir();
  exec(`powershell.exe -Command "Remove-Item -Path '${tempDir}\\playwright_*' -Recurse -Force -ErrorAction SilentlyContinue"`, () => {});
}

async function getBrowser(engine, forceRecreate = false) {
  if (forceRecreate || !browserWrapper[engine] || !browserWrapper[engine].isConnected()) {
    if (browserWrapper[engine]) {
      await withTimeout(browserWrapper[engine].close(), 5000);
    }
    const launcher = engine === 'chromium' ? chromium : (engine === 'firefox' ? firefox : webkit);
    const launchOptions = engine === 'chromium' ? chromiumOptions : standardOptions;
    
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

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const randomDevice = getRandomDevice();
    const browser = await getBrowser(randomEngine);
    if (!browser) {
      await sleep(2000);
      continue;
    }

    const randomUserAgent = randomDevice.config.userAgent + " " + getRandomInt(10, 99) + ".0.0." + getRandomInt(0, 9);
    const randomLocale = locales[getRandomInt(0, locales.length - 1)];
    const randomTimezone = timezones[getRandomInt(0, timezones.length - 1)];
    const proxyConfig = PROXY_POOL[instanceIndex % PROXY_POOL.length];

    const result = await browser.newContext({
      ...randomDevice.config,
      viewport: {
        width: getRandomInt(375, 1440),
        height: getRandomInt(600, 900)
      },
      userAgent: randomUserAgent,
      locale: randomLocale,
      timezoneId: randomTimezone,
      proxy: proxyConfig,
      ignoreHTTPSErrors: true
    }).then(async (context) => {
      context.setDefaultTimeout(PROXY_TIMEOUT);
      context.setDefaultNavigationTimeout(PROXY_TIMEOUT);
      const page = await context.newPage();

      console.log(`[Instance ${instanceIndex}] Starting on ${randomEngine} using proxy port ${proxyConfig.server.split(':').pop()} (Attempt ${attempt}/${MAX_RETRIES})`);

      const success = await page.goto(TARGET_URL, {
        timeout: PROXY_TIMEOUT,
        waitUntil: 'domcontentloaded'
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

  for (let i = 0; i < TOTAL_CLICKS_GOAL; i += 300) {
    const segmentEnd = Math.min(i + 300, TOTAL_CLICKS_GOAL);
    console.log(`\n======================================================`);
    console.log(`--- Starting Cycle (instances ${i}–${segmentEnd - 1}) ---`);
    console.log(`======================================================\n`);

    hardReset();
    await sleep(3000);

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