import { chromium, firefox, webkit, devices } from 'playwright';

const PROXY_CONFIG = {
  server: 'http://global.rotgb.711proxy.com:10000',
  username: 'USER255727-zone-custom-region-US',
  password: '9005f6'
};

const TARGET_URL = 'https://daleelerah.info/pop-go/62492';
const TOTAL_CLICKS_GOAL = 10000000;
const BATCH_SIZE = 240;
const MAX_RETRIES = 2;
const SESSION_DURATION = 5000;
const DELAY_BETWEEN_BATCHES = 1000;
const STAGGER_DELAY = 60;
const PROXY_TIMEOUT = 120000;

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

async function runInstance(browsers, instanceIndex) {
  const engines = Object.keys(browsers);
  const randomEngine = engines[getRandomInt(0, engines.length - 1)];
  const browser = browsers[randomEngine];

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

      console.log(`[Instance ${instanceIndex}] Starting as ${randomDevice.name} on ${randomEngine} (Attempt ${attempt}/${MAX_RETRIES})`);

      const success = await page.goto(TARGET_URL, {
        timeout: PROXY_TIMEOUT,
        waitUntil: 'domcontentloaded'
      }).then(async () => {
        console.log(`[Instance ${instanceIndex}] Page loaded. Starting ${SESSION_DURATION / 1000}s session with move and click...`);

        const timeBeforeClick = getRandomInt(Math.floor(SESSION_DURATION * 0.2), Math.floor(SESSION_DURATION * 0.8));
        const timeAfterClick = SESSION_DURATION - timeBeforeClick;

        await sleep(timeBeforeClick);

        const targetX = getRandomInt(100, 800);
        const targetY = getRandomInt(100, 800);
        await page.mouse.move(targetX, targetY, { steps: 5 });
        await page.mouse.click(targetX, targetY);
        console.log(`[Instance ${instanceIndex}] Clicked at (${targetX}, ${targetY}). Waiting remaining ${timeAfterClick / 1000}s...`);

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
  const chromiumOptions = { 
    headless: true,
    args: ['--disable-dev-shm-usage', '--no-sandbox']
  };
  const standardOptions = { headless: true };

  console.log("Starting campaign...");
  console.log(`Running max concurrency: ${BATCH_SIZE} parallel sessions per batch.\n`);

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < TOTAL_CLICKS_GOAL; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batchEnd = Math.min(i + BATCH_SIZE, TOTAL_CLICKS_GOAL);
    console.log(`\n======================================================`);
    console.log(`--- Starting Batch ${batchNum} (instances ${i}–${batchEnd - 1}) ---`);
    console.log(`======================================================\n`);

    const browsers = await Promise.all([
      chromium.launch(chromiumOptions),
      firefox.launch(standardOptions),
      webkit.launch(standardOptions)
    ]).then(([chromiumBrowser, firefoxBrowser, webkitBrowser]) => ({
      chromium: chromiumBrowser,
      firefox: firefoxBrowser,
      webkit: webkitBrowser
    })).catch(error => {
      console.error("❌ Failed to launch browser engines:", error.message);
      return null;
    });

    if (!browsers) {
      await sleep(5000);
      continue;
    }

    const tasks = [];
    for (let j = i; j < batchEnd; j++) {
      tasks.push(
        sleep(STAGGER_DELAY * (j - i)).then(() => runInstance(browsers, j))
      );
    }

    const results = await Promise.allSettled(tasks);
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value === true) succeeded++;
      else failed++;
    }

    console.log(`\nBatch ${batchNum} done. Total Success: ${succeeded}, Total Failed: ${failed}.`);

    await Promise.all([
      withTimeout(browsers.chromium.close(), 15000),
      withTimeout(browsers.firefox.close(), 15000),
      withTimeout(browsers.webkit.close(), 15000)
    ]).catch(() => {});

    if (batchEnd < TOTAL_CLICKS_GOAL) {
      console.log(`Waiting ${DELAY_BETWEEN_BATCHES}ms before next batch...`);
      await sleep(DELAY_BETWEEN_BATCHES);
    }
  }

  console.log(`\nTraffic Campaign Finished. Total Succeeded: ${succeeded}, Total Failed: ${failed}.`);
}

runMassiveTraffic();