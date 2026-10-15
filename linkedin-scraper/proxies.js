import net from 'net';

/**
 * Module-level counter to track the number of scrape runs.
 */
let runCounter = 0;

/**
 * Logs the initial proxy status at startup.
 */
export function logProxyStatus() {
  const proxy = getTorProxy();
  if (proxy && proxy.server) {
    console.log(`🌐 Proxy Mode: Tor (${proxy.server})`);
  } else {
    console.log('🌐 Proxy Mode: Direct (no proxy)');
  }
}

/**
 * Returns the Tor SOCKS5 proxy configuration for Playwright/Puppeteer.
 * @returns {{server: string}} The proxy configuration object.
 */
export function getTorProxy() {
  console.log(`🔄 Using Tor proxy — socks5://127.0.0.1:9050 (Run #${runCounter + 1})`);
  return { server: 'socks5://127.0.0.1:9050' };
}

/**
 * Asynchronously renews the Tor circuit by sending a NEWNYM signal to the Tor Control Port.
 * This triggers Tor to use a new exit node IP for subsequent requests.
 * @returns {Promise<void>}
 */
export async function renewTorCircuit() {
  console.log('🔁 Renewing Tor circuit — requesting new exit IP...');
  
  return new Promise((resolve) => {
    const client = new net.Socket();
    let failed = false;

    client.on('error', (err) => {
      failed = true;
      console.warn(`⚠️ Tor circuit renewal failed — continuing with current IP (${err.message})`);
      resolve();
    });

    client.connect(9051, '127.0.0.1', () => {
      // Authenticate with an empty password and send NEWNYM signal
      client.write('AUTHENTICATE ""\nSIGNAL NEWNYM\nQUIT\n');
    });

    client.on('data', () => {
      // Data received (usually 250 OK responses), circuit renewal initiated
    });

    client.on('close', async () => {
      if (!failed) {
        // Tor needs time to build the new circuit
        await new Promise(r => setTimeout(r, 3000));
        console.log('✅ Tor circuit renewed successfully — new IP active');
      }
      resolve();
    });
  });
}

/**
 * Checks if the Tor circuit should be renewed based on the number of scrape runs.
 * Renews the circuit after every 3 runs and resets the counter.
 * @returns {Promise<boolean>} True if renewal was performed, false otherwise.
 */
export async function shouldRenewCircuit() {
  runCounter++;
  if (runCounter >= 3) {
    console.log('🔄 3 runs completed — triggering circuit renewal');
    await renewTorCircuit();
    runCounter = 0;
    return true;
  }
  return false;
}
