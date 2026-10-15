const fs = require("fs");
const path = require("path");
const { rootDir } = require("../config");
const { readLogs } = require("../tracker");
const { log } = require("../logging/logger");

const PLATFORMS = {
  linkedin: {
    loginUrl: "https://www.linkedin.com/login",
    homeUrl: "https://www.linkedin.com/feed/",
    profileDir: "linkedin"
  },
  wellfound: {
    loginUrl: "https://wellfound.com/login",
    homeUrl: "https://wellfound.com/jobs",
    profileDir: "wellfound"
  },
  instahyre: {
    loginUrl: "https://www.instahyre.com/login/",
    homeUrl: "https://www.instahyre.com/candidate/opportunities/",
    profileDir: "instahyre"
  },
  hirist: {
    loginUrl: "https://www.hirist.tech/login",
    homeUrl: "https://www.hirist.tech/",
    profileDir: "hirist"
  }
};

function metadataPath(platform) {
  return path.join(rootDir(), "profiles", platform, "session-meta.json");
}

function readSessionMeta(platform) {
  const file = metadataPath(platform);
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function writeSessionMeta(platform, patch) {
  const file = metadataPath(platform);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const next = {
    ...readSessionMeta(platform),
    ...patch,
    updated_at: new Date().toISOString()
  };
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

function profileStats(platform) {
  const dir = path.join(rootDir(), "profiles", platform);
  if (!fs.existsSync(dir)) return { exists: false, lastActive: null };
  const files = fs.readdirSync(dir, { recursive: true });
  let latest = fs.statSync(dir).mtime;
  for (const file of files.slice(0, 500)) {
    const fullPath = path.join(dir, String(file));
    try {
      const stat = fs.statSync(fullPath);
      if (stat.mtime > latest) latest = stat.mtime;
    } catch {
      continue;
    }
  }
  return { exists: true, lastActive: latest.toISOString() };
}

function platformHealth(platform) {
  const stats = profileStats(platform);
  const meta = readSessionMeta(platform);
  const logs = readLogs(rootDir(), 500).filter((item) => item.platform === platform);
  const captcha = [...logs].reverse().find((item) => /captcha/i.test(`${item.event} ${item.message || ""} ${item.error || ""}`));
  const failure = [...logs].reverse().find((item) => /login.*failed|session.*expired|captcha/i.test(`${item.event} ${item.message || ""}`));
  const loggedIn = Boolean(stats.exists && meta.login_confirmed_at);
  return {
    platform,
    login_url: PLATFORMS[platform].loginUrl,
    logged_in: loggedIn,
    status: loggedIn ? "logged in" : stats.exists ? "profile present" : "not logged in",
    profile_path: path.join(rootDir(), "profiles", platform),
    last_active: meta.last_active || stats.lastActive,
    login_confirmed_at: meta.login_confirmed_at || null,
    captcha_warning: Boolean(captcha),
    last_warning: captcha?.message || captcha?.error || failure?.message || failure?.error || "",
    relogin_command: `npm run login:${platform}`
  };
}

function allSessionHealth() {
  return Object.keys(PLATFORMS).map(platformHealth);
}

function recordLoginStart(platform) {
  writeSessionMeta(platform, { login_started_at: new Date().toISOString() });
  log("browser.login.started", { platform });
}

function recordLoginConfirmed(platform) {
  writeSessionMeta(platform, {
    login_confirmed_at: new Date().toISOString(),
    last_active: new Date().toISOString(),
    captcha_warning: false
  });
  log("browser.login.confirmed", { platform });
}

function recordLoginFailure(platform, error) {
  writeSessionMeta(platform, { last_failure: String(error?.message || error) });
  log("browser.login.failed", { platform, error: String(error?.message || error) });
}

module.exports = { PLATFORMS, allSessionHealth, platformHealth, recordLoginStart, recordLoginConfirmed, recordLoginFailure };
