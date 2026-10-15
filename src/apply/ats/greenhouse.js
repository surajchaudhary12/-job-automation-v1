const { humanDelay, humanType } = require("../../browser/humanBehavior");
const path = require("path");
const { candidateProfile, applicationPreferences } = require("../../config");
const llm = require("../../llm");

function keywords(...groups) {
  return groups.flat().map((item) => String(item).toLowerCase());
}

async function findField(page, terms) {
  return page.evaluate((queryTerms) => {
    const normalize = (value) => String(value || "").toLowerCase();
    const fields = [];

    for (const element of Array.from(document.querySelectorAll("input, textarea, select"))) {
      const id = element.id || "";
      const name = element.name || "";
      const placeholder = element.getAttribute("placeholder") || "";
      const ariaLabel = element.getAttribute("aria-label") || "";
      const tagName = element.tagName.toLowerCase();
      const type = (element.getAttribute("type") || tagName).toLowerCase();
      const required = element.hasAttribute("required");
      const label = id ? document.querySelector(`label[for="${id}"]`)?.innerText || "" : "";
      const combined = normalize([id, name, placeholder, ariaLabel, label, tagName, type].join(" "));
      if (queryTerms.some((term) => combined.includes(term))) {
        fields.push({
          selector: id ? `#${id}` : name ? `${tagName}[name="${name}"]` : "",
          tagName,
          type,
          required
        });
      }
    }

    return fields.filter((field) => field.selector);
  }, terms);
}

async function fillMatchingField(page, terms, value) {
  if (!value) return false;
  const matches = await findField(page, terms);
  const match = matches[0];
  if (!match) return false;

  const field = page.locator(match.selector).first();
  if (!(await field.count())) return false;

  if (match.tagName === "select") {
    try {
      await field.selectOption({ label: String(value) });
    } catch {
      try {
        await field.selectOption({ value: String(value) });
      } catch {
        return false;
      }
    }
    return true;
  }

  if (match.type === "checkbox") {
    const shouldCheck = ["yes", "true", "1"].includes(String(value).toLowerCase());
    await field.setChecked(shouldCheck);
    return true;
  }

  await humanType(field, String(value));
  return true;
}

async function missingRequiredFields(page) {
  return page.evaluate(() => {
    const labelFor = (element) => {
      const id = element.id || "";
      const label = id ? document.querySelector(`label[for="${id}"]`)?.innerText || "" : "";
      return (label || element.getAttribute("aria-label") || element.name || id || element.placeholder || "required field").trim();
    };

    return Array.from(document.querySelectorAll('input[required], textarea[required], select[required]'))
      .filter((element) => {
        const tagName = element.tagName.toLowerCase();
        const type = (element.getAttribute("type") || "").toLowerCase();
        if (type === "checkbox" || type === "radio") return !element.checked;
        if (tagName === "select") return !String(element.value || "").trim();
        return !String(element.value || "").trim();
      })
      .slice(0, 20)
      .map(labelFor);
  });
}

async function handleGreenhouse(page, job, resume, options = {}) {
  console.log(`Automating Greenhouse application for ${job.company}`);
  const profile = candidateProfile();
  const preferences = applicationPreferences();
  const preferredLocation = (profile.preferred_locations || [])[0] || "Bangalore";
  const prefill = {
    country: preferences.country || "India",
    location: preferences.location || preferredLocation,
    citizenship: preferences.citizenship || "India",
    other_citizenships: preferences.other_citizenships || "None",
    work_authorization: preferences.work_authorization || "Yes",
    visa_sponsorship_required: preferences.visa_sponsorship_required || "No",
    willing_to_relocate: preferences.willing_to_relocate || "Yes"
  };

  const nameParts = (resume.candidate?.name || "Suraj Singh").split(" ");
  await humanType(page.locator("#first_name"), nameParts[0]);
  await humanType(page.locator("#last_name"), nameParts.slice(1).join(" ") || "Singh");

  await humanType(page.locator("#email"), resume.candidate?.email || "surajsingh3454@gmail.com");
  await humanType(page.locator("#phone"), resume.candidate?.phone || "+91-7568910627");

  const github = await page.locator('input[name*="github"], input[label*="GitHub"]').first();
  if (await github.isVisible()) {
    await humanType(github, resume.candidate?.github || "https://github.com/suraj");
  }

  const linkedin = await page.locator('input[name*="linkedin"], input[label*="LinkedIn"]').first();
  if (await linkedin.isVisible()) {
    await humanType(linkedin, resume.candidate?.linkedin || "https://linkedin.com/in/suraj");
  }

  const portfolio = await page.locator('input[name*="portfolio"], input[name*="website"], input[label*="Portfolio"]').first();
  if (await portfolio.isVisible()) {
    await humanType(portfolio, resume.candidate?.portfolio || "https://github.com/suraj");
  }

  await fillMatchingField(page, keywords("country", "country of residence"), prefill.country);
  await fillMatchingField(page, keywords("city", "location city", "current city", "preferred location"), prefill.location);
  await fillMatchingField(page, keywords("citizenship", "nationality", "country of citizenship"), prefill.citizenship);
  await fillMatchingField(page, keywords("other citizenship", "dual citizenship"), prefill.other_citizenships);
  await fillMatchingField(page, keywords("authorized to work", "work authorization", "eligible to work"), prefill.work_authorization);
  await fillMatchingField(page, keywords("visa sponsorship", "require visa", "need sponsorship"), prefill.visa_sponsorship_required);
  await fillMatchingField(page, keywords("relocate", "relocation"), prefill.willing_to_relocate);

  const questionContainers = await page.locator(".custom_question").all();
  if (questionContainers.length > 0) {
    console.log(`Found ${questionContainers.length} custom question containers, attempting to fill...`);
    const questions = [];
    for (const container of questionContainers) {
      const label = await container.locator("label").first().innerText();
      const input = container.locator('input[type="text"], textarea, select');
      if (await input.count() > 0) {
        questions.push({ label: label.trim(), id: await input.first().getAttribute("id") });
      }
    }

    if (questions.length > 0) {
      try {
        const answers = await llm.answerApplicationQuestions(job, questions.map((q) => q.label));
        if (answers?.json) {
          for (const q of questions) {
            const answer = answers.json[q.label] || answers.json[Object.keys(answers.json).find((key) => q.label.includes(key))];
            if (answer) {
              const input = page.locator(`#${q.id}`);
              const tagName = await input.evaluate((el) => el.tagName.toLowerCase());
              if (tagName === "select") {
                await input.selectOption({ label: answer });
              } else {
                await humanType(input, answer);
              }
            }
          }
        }
      } catch (error) {
        console.error("Failed to answer custom questions:", error.message);
      }
    }
  }

  const stillMissingRequired = await missingRequiredFields(page);
  if (stillMissingRequired.length) {
    const reviewPath = path.join(process.cwd(), "logs", `greenhouse_review_${Date.now()}.png`);
    await page.screenshot({ path: reviewPath, fullPage: true });
    console.log(`Greenhouse application needs review. Missing required fields: ${stillMissingRequired.join(", ")}`);
    return { status: "review_required", screenshotPath: reviewPath, missingRequiredFields: stillMissingRequired };
  }

  const resumePath = resume.pdfPath || resume.texPath;
  if (resumePath) {
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count()) {
      await fileInput.setInputFiles(path.resolve(resumePath));
    } else {
      const attachButton = page.locator('[data-source="attach"]').filter({ hasText: /resume/i }).first();
      if (await attachButton.count()) {
        await attachButton.click();
        const fallbackInput = page.locator('input[type="file"]').first();
        if (await fallbackInput.count()) {
          await fallbackInput.setInputFiles(path.resolve(resumePath));
        }
      }
    }
    await humanDelay(1500, 2500);
  }

  if (options.autoSubmit) {
    console.log("Auto-submitting Greenhouse application...");
    const submitButton = page.locator("#submit_app");
    if (await submitButton.count()) {
      await submitButton.click();
      await page.waitForLoadState("networkidle");
    }

    const confirmationPath = path.join(process.cwd(), "logs", `greenhouse_confirm_${Date.now()}.png`);
    await page.screenshot({ path: confirmationPath, fullPage: true });
    console.log(`Greenhouse application submitted. Screenshot: ${confirmationPath}`);
    return { status: "submitted", screenshotPath: confirmationPath };
  }

  console.log("Greenhouse form filled. Review and submit manually.");
  const reviewPath = path.join(process.cwd(), "logs", `greenhouse_review_${Date.now()}.png`);
  await page.screenshot({ path: reviewPath, fullPage: true });
  return { status: "prepared", screenshotPath: reviewPath };
}

module.exports = { handleGreenhouse };
