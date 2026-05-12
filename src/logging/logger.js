const fs = require("fs");
const path = require("path");
const { rootDir } = require("../config");

function log(event, data = {}) {
  const dir = path.join(rootDir(), "logs");
  fs.mkdirSync(dir, { recursive: true });
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    event,
    ...data
  });
  fs.appendFileSync(path.join(dir, "app.log"), `${line}\n`);
  console.log(line);
}

module.exports = { log };
