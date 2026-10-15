const { humanDelay, humanType } = require("../../browser/humanBehavior");

async function handleWellfound(page, job, resume, options = {}) {
  console.log(`Automating Wellfound application for ${job.company}`);

  // Look for the Apply button
  const applyButton = page.locator('button:has-text("Apply"), .styles_applyButton__').filter({ visible: true }).first();
  
  if (!(await applyButton.isVisible())) {
    console.log("Apply button not found or already applied.");
    return;
  }

  await applyButton.click();
  await humanDelay(2000, 4000);

  // Wellfound usually shows a text area for a note
  const noteArea = page.locator('textarea[name="note"], textarea[placeholder*="note"], textarea[placeholder*="cover letter"]').first();
  if (await noteArea.isVisible()) {
    const message = job.recruiter_message || `Hi, I'm interested in the ${job.title} role at ${job.company}. My background in backend engineering aligns well with your requirements.`;
    await humanType(noteArea, message);
    await humanDelay(1500, 2500);
    
    const submitButton = page.locator('button:has-text("Send Application"), button:has-text("Apply")').filter({ visible: true }).last();
    if (await submitButton.isVisible() && options.autoSubmit) {
       await submitButton.click();
       await page.waitForLoadState("networkidle");
       console.log("Wellfound application submitted.");
    }
  }

  console.log("Wellfound application flow completed.");
}

module.exports = { handleWellfound };
