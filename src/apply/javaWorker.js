const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { rootDir, candidateProfile, applicationPreferences, envFlag } = require("../config");
const { recordApplyProgress } = require("../db/applyAttempts");

function runJavaApply(job, resume, options = {}) {
  const root = rootDir();
  const jarPath = path.join(root, "java-apply", "target", "java-apply-1.0.0.jar");
  if (!fs.existsSync(jarPath)) {
    return Promise.resolve({
      status: "failed",
      submitted: false,
      error: "Java apply worker is not built. Run `mvn -f java-apply/pom.xml package` first."
    });
  }

  const source = String(job.source || "").toLowerCase();
  const profileName = ["linkedin", "wellfound", "instahyre"].includes(source) ? source : "default";
  const request = {
    root,
    job,
    resume,
    candidate: candidateProfile(),
    preferences: applicationPreferences(),
    profileName,
    attemptId: options.attemptId || "",
    autoSubmit: Boolean(options.autoSubmit),
    headless: options.headless ?? envFlag("HEADLESS", true)
  };

  return new Promise((resolve) => {
    const child = spawn(process.env.JAVA_BIN || "java", ["-jar", jarPath], { cwd: root, windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let stderrBuffer = "";
    let progressQueue = Promise.resolve();
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish({ status: "failed", submitted: false, error: "Java application worker timed out." });
    }, 180_000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      stderrBuffer += chunk;
      const lines = stderrBuffer.split(/\r?\n/);
      stderrBuffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("@@APPLY_EVENT:")) continue;
        try {
          const event = JSON.parse(line.slice("@@APPLY_EVENT:".length));
          progressQueue = progressQueue.then(() => recordApplyProgress(request.attemptId, event));
        } catch { /* retain worker stderr for diagnostics */ }
      }
    });
    child.on("error", (error) => finish({ status: "failed", submitted: false, error: error.message }));
    child.on("close", async (code) => {
      await progressQueue;
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      try {
        const result = JSON.parse(lines[lines.length - 1] || "{}");
        if (code !== 0 && !result.error) result.error = stderr.trim() || `Java worker exited with code ${code}`;
        finish(result);
      } catch {
        finish({ status: "failed", submitted: false, error: stderr.trim() || "Java worker returned invalid output." });
      }
    });
    child.stdin.end(JSON.stringify(request));
  });
}

module.exports = { runJavaApply };
