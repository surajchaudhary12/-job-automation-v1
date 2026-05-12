const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

function htmlReport(results) {
  const rows = results
    .map((item) => {
      return `<tr>
        <td>${item.company}</td>
        <td>${item.role}</td>
        <td>${item.fit_score}/10</td>
        <td>${item.priority}</td>
        <td>${item.status}</td>
        <td>${item.resume_used || ""}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Suraj Job Agent Demo</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 32px; color: #1f2937; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    p { color: #4b5563; }
    table { border-collapse: collapse; width: 100%; margin-top: 24px; }
    th, td { border: 1px solid #d1d5db; padding: 10px; text-align: left; font-size: 14px; }
    th { background: #f3f4f6; }
    .note { margin-top: 18px; font-size: 13px; color: #6b7280; }
  </style>
</head>
<body>
  <h1>Suraj Job Application Agent Demo</h1>
  <p>Discovery, scoring, resume tailoring, outreach drafting, and tracker update preview.</p>
  <table>
    <thead>
      <tr><th>Company</th><th>Role</th><th>Fit</th><th>Priority</th><th>Status</th><th>Resume</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="note">Demo mode does not submit applications. Live mode should use logged-in persistent browser sessions and per-platform rate limits.</div>
</body>
</html>`;
}

async function saveReport(rootDir, results) {
  const reportDir = path.join(rootDir, "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const htmlPath = path.join(reportDir, `demo_report_${stamp}.html`);
  const screenshotPath = path.join(reportDir, `demo_report_${stamp}.png`);
  fs.writeFileSync(htmlPath, htmlReport(results));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`file://${htmlPath.replace(/\\/g, "/")}`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await browser.close();

  return { htmlPath, screenshotPath };
}

module.exports = { saveReport };
