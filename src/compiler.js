const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const { chromium } = require('playwright');

/**
 * Compiles a LaTeX string to a PDF buffer in an isolated temporary directory.
 * Ensures the temporary directory and all artifacts are cleaned up afterward.
 */
async function compileLatexToPdf(texContent, rootDir) {
  const tmpDir = path.join(rootDir, 'generated', 'tmp_' + crypto.randomBytes(8).toString('hex'));
  fs.mkdirSync(tmpDir, { recursive: true });
  
  const texPath = path.join(tmpDir, 'resume.tex');
  const pdfPath = path.join(tmpDir, 'resume.pdf');
  
  try {
    fs.writeFileSync(texPath, texContent);
    // Use timeout for safety against infinite loops in LaTeX compilation
    execFileSync('pdflatex', ['-interaction=nonstopmode', '-halt-on-error', 'resume.tex'], {
      cwd: tmpDir,
      stdio: 'pipe',
      timeout: 15000 // 15 seconds timeout
    });
    
    if (fs.existsSync(pdfPath)) {
      return validatePdfBuffer(fs.readFileSync(pdfPath), "pdflatex");
    }
    throw new Error('Compilation finished but PDF was not generated.');
  } catch (error) {
    let errorMsg = `LaTeX compilation failed: ${error.message}\n`;
    if (error.stdout) errorMsg += `Stdout: ${error.stdout.toString()}\n`;
    if (error.stderr) errorMsg += `Stderr: ${error.stderr.toString()}\n`;
    try {
      return validatePdfBuffer(await fallbackPdfFromTex(texContent), "Chromium fallback");
    } catch (fallbackError) {
      throw new Error(`${errorMsg}Fallback compilation failed: ${fallbackError.message}`);
    }
  } finally {
    // Cleanup temporary directory safely
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch (cleanupError) {
      console.error('Failed to cleanup temporary LaTeX directory:', cleanupError);
    }
  }
}

function validatePdfBuffer(buffer, source) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8 || !buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error(`${source} did not produce a valid PDF file.`);
  }
  return buffer;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function latexToReadableHtml(texContent) {
  const body = String(texContent || "")
    .replace(/\\documentclass\[[^\]]*\]\{article\}/g, "")
    .replace(/\\usepackage\{[^}]*\}/g, "")
    .replace(/\\usepackage\[[^\]]*\]\{[^}]*\}/g, "")
    .replace(/\\setlist\[itemize\]\{[^}]*\}/g, "")
    .replace(/^\\titleformat\{.*$/gm, "")
    .replace(/^\\titlespacing\*?\{.*$/gm, "")
    .replace(/\\vspace\*?\{[^}]*\}/g, "")
    .replace(/\\pagestyle\{empty\}/g, "")
    .replace(/\\begin\{document\}/g, "")
    .replace(/\\end\{document\}/g, "")
    .trim()
    .split(/\r?\n/);

  const html = [];
  let inList = false;
  const inline = (value) => escapeHtml(value)
    .replace(/\\textbf\{([^}]*)\}/g, "<strong>$1</strong>")
    .replace(/\\textit\{([^}]*)\}/g, "<em>$1</em>")
    .replace(/\\underline\{([^}]*)\}/g, "$1")
    .replace(/\\href\{(https?:\/\/[^}]*)\}\{([^}]*)\}/g, '<a href="$1">$2</a>')
    .replace(/\\href\{mailto:([^}]*)\}\{([^}]*)\}/g, '<a href="mailto:$1">$2</a>')
    .replace(/\\([#$%&_{}])/g, "$1")
    .replace(/\\\\/g, "<br/>")
    .replace(/\\quad/g, "&nbsp;&nbsp;");

  for (let line of body) {
    line = line.trim();
    if (!line) continue;
    if (line === "\\begin{center}" || line === "\\end{center}") continue;
    if (line === "\\begin{itemize}") {
      if (!inList) html.push("<ul>");
      inList = true;
      continue;
    }
    if (line === "\\end{itemize}") {
      if (inList) html.push("</ul>");
      inList = false;
      continue;
    }
    const section = line.match(/^\\section\*\{([^}]*)\}$/);
    if (section) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      html.push(`<h2>${escapeHtml(section[1])}</h2>`);
      continue;
    }
    const largeHeading = line.match(/^\{\\Large\s*(.*?)\}(?:\\\\)?$/);
    if (largeHeading) {
      html.push(`<h1>${escapeHtml(largeHeading[1])}</h1>`);
      continue;
    }
    if (line.startsWith("\\item")) {
      const item = line.replace(/^\\item\s*/, "");
      html.push(`<li>${inline(item)}</li>`);
      continue;
    }
    const hfill = line.indexOf("\\hfill");
    if (hfill >= 0) {
      const left = line.slice(0, hfill);
      const right = line.slice(hfill + "\\hfill".length);
      html.push(`<p class="split"><span>${inline(left)}</span><span>${inline(right)}</span></p>`);
      continue;
    }
    html.push(`<p>${inline(line)}</p>`);
  }

  if (inList) html.push("</ul>");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 0.42in; }
  body { font-family: Arial, sans-serif; font-size: 10px; line-height: 1.2; color: #111; }
  h1 { margin: 0 0 3px; padding-top: 5px; font-size: 15px; font-weight: 700; text-align: center; }
  h2 { margin: 6px 0 2px; font-size: 10px; border-bottom: 1px solid #777; padding-bottom: 1px; text-transform: uppercase; }
  p { margin: 0 0 1px; }
  p.split { display: flex; justify-content: space-between; gap: 8px; }
  ul { margin: 2px 0 3px 14px; padding: 0; }
  li { margin: 0 0 1px; }
  strong { font-weight: 700; }
  a { color: inherit; text-decoration: none; }
</style>
</head>
<body>${html.join("\n")}</body>
</html>`;
}

async function fallbackPdfFromTex(texContent) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ format: "A4" });
    await page.setContent(latexToReadableHtml(texContent), { waitUntil: "load" });
    return await page.pdf({ format: "A4", printBackground: true });
  } finally {
    await browser.close();
  }
}

module.exports = { compileLatexToPdf };
