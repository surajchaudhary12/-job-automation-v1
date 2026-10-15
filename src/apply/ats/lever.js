const { humanDelay, humanType } = require("../../browser/humanBehavior");
const path = require("path");
const llm = require("../../llm");

async function handleLever(page, job, resume, options = {}) {
  console.log(`Automating Lever application for ${job.company}`);

  // Wait for the apply button if on the job description page
  const applyButton = page.locator('a[href*="/apply"]').first();
  if (await applyButton.isVisible()) {
    await applyButton.click();
    await page.waitForLoadState("domcontentloaded");
    await humanDelay(1000, 2000);
  }

  // Upload resume
  const resumePath = resume.pdfPath || resume.texPath;
  if (resumePath) {
    const fileInput = page.locator('input[type="file"][name="resume"]');
    if (await fileInput.isVisible()) {
      await fileInput.setInputFiles(path.resolve(resumePath));
      await humanDelay(2000, 3000);
    }
  }

  // Personal Info
  await humanType(page.locator('input[name="name"]'), resume.candidate?.name || "Suraj Singh");
  await humanType(page.locator('input[name="email"]'), resume.candidate?.email || "surajsingh3454@gmail.com");
  await humanType(page.locator('input[name="phone"]'), resume.candidate?.phone || "+91-7568910627");
  await humanType(page.locator('input[name="org"]'), resume.candidate?.current_company || "Meesho");

  // Links
  const linkedin = page.locator('input[name="urls[LinkedIn]"]');
  if (await linkedin.isVisible()) {
    await humanType(linkedin, resume.candidate?.linkedin || "https://linkedin.com/in/suraj");
  }

  const github = page.locator('input[name="urls[GitHub]"]');
  if (await github.isVisible()) {
    await humanType(github, resume.candidate?.github || "https://github.com/suraj");
  }

  const portfolio = page.locator('input[name="urls[Portfolio]"], input[name="urls[Other]"]');
  if (await portfolio.isVisible()) {
    await humanType(portfolio, resume.candidate?.portfolio || "https://github.com/suraj");
  }

  // Handle custom questions
  const applicationQuestions = await page.locator('.application-question').all();
  if (applicationQuestions.length > 0) {
      console.log(`Found ${applicationQuestions.length} custom Lever questions, attempting to fill...`);
      const questions = [];
      for (const container of applicationQuestions) {
          const label = await container.locator('.text').first().innerText();
          const input = container.locator('input[type="text"], textarea, select');
          if (await input.count() > 0) {
              questions.push({ label: label.trim(), id: await input.first().getAttribute('name') });
          }
      }

      if (questions.length > 0) {
          try {
              const answers = await llm.answerApplicationQuestions(job, questions.map(q => q.label));
              if (answers?.json) {
                  for (const q of questions) {
                      const answer = answers.json[q.label] || answers.json[Object.keys(answers.json).find(k => q.label.includes(k))];
                      if (answer) {
                          const input = page.locator(`[name="${q.id}"]`);
                          const tagName = await input.evaluate(el => el.tagName.toLowerCase());
                          if (tagName === 'select') {
                             // Handle dropdowns
                             await input.selectOption({ label: answer });
                          } else {
                             await humanType(input, answer);
                          }
                      }
                  }
              }
          } catch (error) {
              console.error("Failed to answer Lever questions:", error.message);
          }
      }
  }

  if (options.autoSubmit) {
     console.log("Auto-submitting Lever application...");
     const submitButton = page.locator('button[id="post-application_button"], button:has-text("Submit Application")').filter({ visible: true }).first();
     if (await submitButton.isVisible()) {
        await submitButton.click();
        await page.waitForLoadState("networkidle");
        console.log("Lever application submitted.");
     } else {
        console.log("Could not find submit button for Lever.");
     }
  } else {
    console.log("Lever form filled. Review and submit manually.");
  }
}

module.exports = { handleLever };
