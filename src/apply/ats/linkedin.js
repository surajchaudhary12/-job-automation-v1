const { humanDelay, humanType } = require("../../browser/humanBehavior");
const path = require("path");
const llm = require("../../llm/index");

async function handleLinkedInEasyApply(page, job, resume, options = {}) {
  console.log(`Automating LinkedIn Easy Apply for ${job.company}`);

  const easyApplyButton = page.locator('.jobs-apply-button').first();
  if (!(await easyApplyButton.isVisible())) {
    console.log("Easy Apply button not found.");
    return;
  }

  await easyApplyButton.click();
  await humanDelay(2000, 3000);

  // Handle multi-step dialog
  let iterations = 0;
  const maxIterations = 10;

  while (iterations < maxIterations) {
    iterations++;
    
    // Check for "Next" button
    const nextButton = page.locator('button[aria-label*="next"], button[aria-label*="Next"]').filter({ visible: true }).first();
    const reviewButton = page.locator('button[aria-label*="review"], button[aria-label*="Review"]').filter({ visible: true }).first();
    const submitButton = page.locator('button[aria-label*="submit"], button[aria-label*="Submit"]').filter({ visible: true }).first();

    // Fill common fields if visible
    await fillLinkedInFields(page, resume, job);

    if (await submitButton.isVisible()) {
      console.log("Submit button found.");
      if (options.autoSubmit) {
          await submitButton.click();
          await page.waitForLoadState("networkidle");
          console.log("LinkedIn Easy Apply submitted.");
          return { status: "submitted" };
      }
      return { status: "review_required" };
    }

    if (await reviewButton.isVisible()) {
      await reviewButton.click();
    } else if (await nextButton.isVisible()) {
      await nextButton.click();
    } else {
      console.log("No further buttons found or stuck.");
      return { status: "stuck" };
    }

    await humanDelay(1000, 2000);
  }

  return { status: "completed" };
}

async function fillLinkedInFields(page, resume, job) {
    // Phone number if empty
    const phoneInput = page.locator('input[id*="phoneNumber"]').first();
    if (await phoneInput.isVisible() && (await phoneInput.inputValue()) === "") {
        await humanType(phoneInput, resume.candidate?.phone || "+917568910627");
    }

    // Resume upload if needed
    const uploadButton = page.locator('input[type="file"][id*="resume"]').first();
    if (await uploadButton.isVisible() && resume.pdfPath) {
        await uploadButton.setInputFiles(path.resolve(resume.pdfPath));
        await humanDelay(1500, 2500);
    }

    // Handle common radio buttons (e.g., "Yes" for "Do you have experience...?")
    const radioGroups = await page.locator('fieldset').all();
    for (const group of radioGroups) {
        const legend = await group.locator('legend').first();
        if (await legend.isVisible()) {
            const legendText = await legend.innerText();
            if (legendText.toLowerCase().includes('experience') || legendText.toLowerCase().includes('work in')) {
                 const yesRadio = group.locator('label:has-text("Yes")').first();
                 if (await yesRadio.isVisible()) await yesRadio.click();
            }
        }
    }

    // Handle additional questions using LLM
    const questions = await page.locator('.jobs-easy-apply-form-section').all();
    const unansweredQuestions = [];

    for (const q of questions) {
        const label = q.locator('label').first();
        const input = q.locator('input[type="text"], textarea').first();
        if (await label.isVisible() && await input.isVisible() && (await input.inputValue()) === "") {
            unansweredQuestions.push({
                id: await label.getAttribute('for'),
                text: await label.innerText()
            });
        }
    }

    if (unansweredQuestions.length > 0 && llm.enabled()) {
        try {
            const answers = await llm.answerApplicationQuestions(job, unansweredQuestions.map(q => q.text));
            if (answers?.json) {
                for (const q of unansweredQuestions) {
                    const answer = answers.json[q.text] || Object.values(answers.json)[0]; // Fallback to first answer if key mismatch
                    if (answer) {
                        const input = page.locator(`#${q.id.replace(/:/g, '\\:')}`);
                        await humanType(input, String(answer));
                    }
                }
            }
        } catch (error) {
            console.error("Failed to answer LinkedIn questions with LLM:", error.message);
        }
    }
}

module.exports = { handleLinkedInEasyApply };
