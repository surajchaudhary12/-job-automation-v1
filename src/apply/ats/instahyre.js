const { humanDelay, humanType } = require("../../browser/humanBehavior");

async function handleInstahyre(page, job, resume, options = {}) {
  console.log(`Automating Instahyre application for ${job.company}`);

  // Look for the Apply button
  const applyButton = page.locator('button:has-text("Apply"), .btn-apply').filter({ visible: true }).first();
  
  if (!(await applyButton.isVisible())) {
    console.log("Apply button not found or already applied.");
    return;
  }

  await applyButton.click();
  await humanDelay(2000, 3000);

  // Instahyre sometimes shows a "Note to recruiter" modal
  const noteArea = page.locator('textarea[name="note"], textarea[placeholder*="note"]').first();
  if (await noteArea.isVisible()) {
    const message = job.recruiter_message || `Hi, I'm interested in the ${job.title} role at ${job.company}. I have relevant experience in backend development and I'm excited to learn more.`;
    await humanType(noteArea, message);
    await humanDelay(1000, 2000);
    
    const sendButton = page.locator('button:has-text("Send"), button:has-text("Apply")').filter({ visible: true }).last();
    if (await sendButton.isVisible() && options.autoSubmit) {
       await sendButton.click();
       await page.waitForLoadState("networkidle");
       console.log("Instahyre application submitted.");
    }
  }

  console.log("Instahyre application flow completed.");
}

module.exports = { handleInstahyre };
