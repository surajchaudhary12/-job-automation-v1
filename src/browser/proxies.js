const net = require('net');

let runCounter = 0;

function getTorProxy() {
  console.log(`🔄 Using Tor proxy — socks5://127.0.0.1:9050 (Run #${runCounter + 1})`);
  return { server: 'socks5://127.0.0.1:9050' };
}

async function renewTorCircuit() {
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
      client.write('AUTHENTICATE ""\nSIGNAL NEWNYM\nQUIT\n');
    });
    client.on('data', () => {});
    client.on('close', async () => {
      if (!failed) {
        await new Promise(r => setTimeout(r, 3000));
        console.log('✅ Tor circuit renewed successfully — new IP active');
      }
      resolve();
    });
  });
}

async function shouldRenewCircuit() {
  runCounter++;
  // Renew every run
  if (runCounter >= 1) { 
    await renewTorCircuit();
    runCounter = 0;
    return true;
  }
  return false;
}

module.exports = { getTorProxy, renewTorCircuit, shouldRenewCircuit };
