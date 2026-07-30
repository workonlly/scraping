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

const BATCH_SIZE = 100;
const STAGGER_DELAY = 500;
const MAX_RETRIES = 2;
const SESSION_DURATION = 30000;
const PROXY_TIMEOUT = 120000;

const chromiumOptions = {
  headless: true,
  args: ['--disable-gpu', '--disable-software-rasterizer', '--disable-dev-shm-usage', '--no-sandbox', '--disable-webgl']
};

const standardOptions = { headless: true };

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
  exec('taskkill /F /IM chrome-headless-shell.exe /T', () => { });
  exec('taskkill /F /IM firefox.exe /T /FI "STATUS eq RUNNING"', () => { });
  exec('taskkill /F /IM webkit.exe /T /FI "STATUS eq RUNNING"', () => { });
  const tempDir = os.tmpdir();
  exec(`powershell.exe -Command "Remove-Item -Path '${tempDir}\\playwright_*' -Recurse -Force -ErrorAction SilentlyContinue"`, () => { });
}

async function runInstance(instanceIndex) {
  const engines = ['chromium', 'firefox', 'webkit'];
  const randomEngine = engines[getRandomInt(0, engines.length - 1)];
  const launcher = randomEngine === 'chromium' ? chromium : (randomEngine === 'firefox' ? firefox : webkit);
  const launchOptions = randomEngine === 'chromium' ? chromiumOptions : standardOptions;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const randomDevice = getRandomDevice();
    const proxyConfig = PROXY_POOL[instanceIndex % PROXY_POOL.length];

    let browser = null;
    try {
      browser = await withTimeout(
        launcher.launch({
          ...launchOptions,
          proxy: proxyConfig
        }),
        45000
      );
      if (browser === null) {
        throw new Error("Browser launch timeout triggered");
      }
    } catch (launchErr) {
      console.error(`[Instance ${instanceIndex}] ❌ Browser launch failed on ${randomEngine}: ${launchErr.message}`);
      await sleep(2000);
      continue;
    }

    const randomUserAgent = randomDevice.config.userAgent + " " + getRandomInt(10, 99) + ".0.0." + getRandomInt(0, 9);
    const randomLocale = locales[getRandomInt(0, locales.length - 1)];
    const randomTimezone = timezones[getRandomInt(0, timezones.length - 1)];

    const result = await withTimeout(
      browser.newContext({
        ...randomDevice.config,
        viewport: {
          width: getRandomInt(375, 1440),
          height: getRandomInt(600, 900)
        },
        userAgent: randomUserAgent,
        locale: randomLocale,
        timezoneId: randomTimezone,
        ignoreHTTPSErrors: true
      }),
      25000
    ).then(async (context) => {
      if (context === null) {
        throw new Error("newContext timeout triggered");
      }
      context.setDefaultTimeout(PROXY_TIMEOUT);
      context.setDefaultNavigationTimeout(PROXY_TIMEOUT);
      const page = await context.newPage();

      console.log(`[Instance ${instanceIndex}] Launched separate ${randomEngine} process using proxy port ${proxyConfig.server.split(':').pop()} (Attempt ${attempt}/${MAX_RETRIES})`);

      const success = await withTimeout(
        page.goto(TARGET_URL, {
          timeout: PROXY_TIMEOUT,
          waitUntil: 'domcontentloaded'
        }),
        PROXY_TIMEOUT + 5000
      ).then(async (gotoResult) => {
        if (gotoResult === null) {
          throw new Error("Navigation timeout wrapper triggered");
        }
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

      await withTimeout(context.close().catch(() => { }), 15000);
      return success;
    }).catch(async (error) => {
      console.error(`[Instance ${instanceIndex}] ❌ Setup failed: ${error.message}`);
      return false;
    });

    try {
      await withTimeout(browser.close(), 15000);
    } catch (e) { }

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

  for (let i = 0; i < TOTAL_CLICKS_GOAL; i += 100) {
    const segmentEnd = Math.min(i + 100, TOTAL_CLICKS_GOAL);
    console.log(`\n======================================================`);
    console.log(`--- Starting Cycle (instances ${i}–${segmentEnd - 1}) ---`);
    console.log(`======================================================\n`);

    hardReset();
    await sleep(4000);

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
  }

  console.log(`\nTraffic Campaign Finished. Total Succeeded: ${succeeded}, Total Failed: ${failed}.`);
}

runMassiveTraffic();