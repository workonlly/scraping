import { chromium, firefox, webkit, devices } from 'playwright';

const PROXY_CONFIG = {
  server: 'http://global.rotgb.711proxy.com:10000',
  username: 'USER255727-zone-custom-region-US',
  password: '9005f6'
};

const TARGET_URL = 'https://daleelerah.info/pop-go/62492';
const TOTAL_CLICKS_GOAL = 10000000;   // 10 million clicks
const BATCH_SIZE = 50;                // Number of browsers to run perfectly in parallel (Requires high RAM, change as needed)
const MAX_RETRIES = 2;                // retry up to 2 times
const SESSION_DURATION = 60000;       // Exactly 60 seconds per session
const DELAY_BETWEEN_BATCHES = 2000;   // 2s cooldown between batches
const STAGGER_DELAY = 100;            // 0.1s stagger to not hammer CPU simultaneously

// Device profiles for randomization
const deviceNames = Object.keys(devices);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomDevice() {
  const randomDeviceName = deviceNames[getRandomInt(0, deviceNames.length - 1)];
  return { name: randomDeviceName, config: devices[randomDeviceName] };
}

async function runInstance(browsers, instanceIndex) {
  // Randomly pick a browser engine (chromium, firefox, webkit)
  const engines = Object.keys(browsers);
  const randomEngine = engines[getRandomInt(0, engines.length - 1)];
  const browser = browsers[randomEngine];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // Randomize device profile (User-Agent, viewport size, mobile/desktop, etc.)
    const randomDevice = getRandomDevice();

    // Create new context with proxy and random device profile
    let context;
    let page;
    try {
      context = await browser.newContext({
        ...randomDevice.config,
        proxy: PROXY_CONFIG,
        ignoreHTTPSErrors: true
      });

      context.setDefaultTimeout(SESSION_DURATION + 30000); // allow extra time for load
      page = await context.newPage();

      console.log(`[Instance ${instanceIndex}] Starting as ${randomDevice.name} on ${randomEngine} (Attempt ${attempt}/${MAX_RETRIES})`);

      // 1. Navigate to target url
      await page.goto(TARGET_URL, {
        timeout: SESSION_DURATION + 30000,
        waitUntil: 'domcontentloaded',
      });

      // 2. Random human-like behavior
      await page.mouse.move(getRandomInt(100, 500), getRandomInt(100, 500), { steps: getRandomInt(5, 15) });
      await sleep(getRandomInt(1000, 3000));

      console.log(`[Instance ${instanceIndex}] Page loaded. Keeping session open for exactly 60 seconds...`);

      // 3. Keep session open for EXACTLY 60 seconds
      await sleep(SESSION_DURATION);

      console.log(`[Instance ${instanceIndex}] ✅ Completed 60s session successfully.`);
      return true; // success — exit retry loop
    } catch (error) {
      console.error(`[Instance ${instanceIndex}] ❌ Attempt ${attempt} failed: ${error.message}`);
      if (attempt < MAX_RETRIES) {
        await sleep(2000 + Math.random() * 3000); // Backoff before retry
      }
    } finally {
      if (context) await context.close();
    }
  }
  return false; // all attempts failed
}

async function runMassiveTraffic() {
  console.log("Launching Headless Browsers (Chromium, Firefox, WebKit)...");
  // Launch all 3 browsers to share the load. headless is true by default.
  const launchOptions = { headless: true };
  const browsers = {
    chromium: await chromium.launch(launchOptions),
    firefox: await firefox.launch(launchOptions),
    webkit: await webkit.launch(launchOptions)
  };

  console.log(`Browsers launched. Starting campaign to hit ${TOTAL_CLICKS_GOAL} clicks...`);
  console.log(`Running max concurrency: ${BATCH_SIZE} parallel sessions per batch.\n`);

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < TOTAL_CLICKS_GOAL; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batchEnd = Math.min(i + BATCH_SIZE, TOTAL_CLICKS_GOAL);
    console.log(`\n======================================================`);
    console.log(`--- Starting Batch ${batchNum} (instances ${i}–${batchEnd - 1}) ---`);
    console.log(`======================================================\n`);

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

    // Cooldown between batches to let network/RAM catch its breath
    if (batchEnd < TOTAL_CLICKS_GOAL) {
      console.log(`Waiting ${DELAY_BETWEEN_BATCHES}ms before next batch...`);
      await sleep(DELAY_BETWEEN_BATCHES);
    }
  }

  // Cleanup
  console.log("\nClosing all browsers...");
  await browsers.chromium.close();
  await browsers.firefox.close();
  await browsers.webkit.close();

  console.log(`\nTraffic Campaign Finished. Total Succeeded: ${succeeded}, Total Failed: ${failed}.`);
}

runMassiveTraffic();