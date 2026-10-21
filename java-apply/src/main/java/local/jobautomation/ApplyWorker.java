package local.jobautomation;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.microsoft.playwright.BrowserContext;
import com.microsoft.playwright.Locator;
import com.microsoft.playwright.Page;
import com.microsoft.playwright.Playwright;
import com.microsoft.playwright.Response;
import com.microsoft.playwright.options.LoadState;
import com.microsoft.playwright.options.SelectOption;
import com.microsoft.playwright.options.WaitUntilState;

import java.nio.file.Files;
import java.nio.file.Path;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ThreadLocalRandom;

public final class ApplyWorker {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static ArrayNode EVENTS = JSON.createArrayNode();
    private static ObjectNode DIAGNOSTICS = JSON.createObjectNode();
    private static String attemptId = "";

    private ApplyWorker() {}

    public static void main(String[] args) {
        ObjectNode result;
        EVENTS = JSON.createArrayNode();
        DIAGNOSTICS = JSON.createObjectNode();
        try {
            JsonNode request = JSON.readTree(System.in);
            attemptId = value(request, "attemptId");
            emit("worker_started", "Java apply worker started", JSON.createObjectNode());
            result = apply(request);
        } catch (Exception error) {
            ObjectNode details = JSON.createObjectNode().put("error", safeMessage(error));
            emit("worker_error", "Java apply worker failed", details);
            result = JSON.createObjectNode()
                    .put("status", "failed")
                    .put("submitted", false)
                    .put("error", safeMessage(error));
        }
        try {
            result.put("attemptId", attemptId);
            if (!result.has("stage")) result.put("stage", result.path("status").asText("finished"));
            result.set("metadata", DIAGNOSTICS);
            result.set("events", EVENTS);
            System.out.println(JSON.writeValueAsString(result));
        } catch (Exception error) {
            System.out.println("{\"status\":\"failed\",\"submitted\":false,\"error\":\"Could not encode worker result\"}");
            System.exit(1);
        }
    }

    private static ObjectNode apply(JsonNode request) throws Exception {
        JsonNode job = request.path("job");
        JsonNode resume = request.path("resume");
        JsonNode candidate = request.path("candidate");
        JsonNode preferences = request.path("preferences");
        String source = value(job, "source").toLowerCase(Locale.ROOT);
        String url = first(value(job, "url"), value(job, "URL"));
        String resumePath = first(value(resume, "pdfPath"), value(resume, "texPath"));
        String profileName = value(request, "profileName");
        attemptId = value(request, "attemptId");
        boolean autoSubmit = request.path("autoSubmit").asBoolean(false);
        Path root = Path.of(value(request, "root")).toAbsolutePath().normalize();
        Path profilePath = root.resolve("profiles").resolve(profileName.isBlank() ? "default" : profileName).normalize();
        Path logPath = root.resolve("logs");
        Files.createDirectories(profilePath);
        Files.createDirectories(logPath);

        String host = URI.create(url).getHost();
        String normalizedHost = host == null ? "" : host.toLowerCase(Locale.ROOT);
        DIAGNOSTICS.put("entryUrl", url);
        DIAGNOSTICS.put("entryHost", normalizedHost);
        boolean trustedHost = source.equals("greenhouse") && (normalizedHost.equals("greenhouse.io") || normalizedHost.endsWith(".greenhouse.io"))
                || source.equals("lever") && (normalizedHost.equals("lever.co") || normalizedHost.endsWith(".lever.co"))
                || source.equals("keka") && (normalizedHost.equals("keka.com") || normalizedHost.endsWith(".keka.com"))
                || source.equals("ashby") && (normalizedHost.equals("ashbyhq.com") || normalizedHost.endsWith(".ashbyhq.com"));
        if (!url.startsWith("https://") || !trustedHost) {
            emit("url_rejected", "Destination host is not supported for this ATS", JSON.createObjectNode().put("entryUrl", url).put("entryHost", normalizedHost));
            return result("failed", false, "Java worker supports HTTPS Greenhouse, Lever, Keka, and Ashby job URLs only.");
        }
        if (resumePath.isBlank() || !Files.isRegularFile(Path.of(resumePath))) {
            emit("resume_missing", "Generated PDF resume was not found", JSON.createObjectNode().put("resumePath", resumePath));
            return result("review_required", false, "A generated PDF resume is required before applying.");
        }

        String artifact = safeName(first(value(job, "company"), "job")) + "_" + System.currentTimeMillis();
        boolean headless = source.equals("keka") ? false : request.path("headless").asBoolean(true);
        emit("browser_launching", "Starting persistent browser profile", JSON.createObjectNode().put("profileName", profileName));
        try (Playwright playwright = Playwright.create()) {
            BrowserContext context = playwright.chromium().launchPersistentContext(profilePath,
                    new com.microsoft.playwright.BrowserType.LaunchPersistentContextOptions()
                            .setHeadless(headless)
                            .setTimeout(20_000));
            try {
                emit("browser_ready", "Persistent browser context is ready", JSON.createObjectNode().put("profileName", profileName));
                Page page = context.newPage();
                page.setViewportSize(1366, 850);
                emit("navigation_started", "Opening job destination", JSON.createObjectNode().put("entryUrl", url).put("entryHost", normalizedHost));
                Response navigation = page.navigate(url, new Page.NavigateOptions().setWaitUntil(WaitUntilState.DOMCONTENTLOADED).setTimeout(60_000));
                pause(900, 1600);
                recordPageState(page, url, navigation);
                emit("navigation_reached", "Job page loaded in browser", navigationDetails());
                ArrayNode fieldsAsked;
                if (source.equals("greenhouse")) {
                    fieldsAsked = inspectFields(page);
                    fillGreenhouse(page, candidate, preferences);
                } else if (source.equals("keka")) {
                    enterKekaApplication(page);
                    recordPageState(page, url, null);
                    emit("keka_application_form_reached", "Keka application form opened", navigationDetails());
                    fieldsAsked = inspectFields(page);
                    fillKeka(page, candidate, preferences);
                } else if (source.equals("ashby")) {
                    enterAshbyApplication(page);
                    recordPageState(page, url, null);
                    emit("ashby_application_form_reached", "Ashby application form opened", navigationDetails());
                    fieldsAsked = inspectFields(page);
                    fillAshby(page, candidate, preferences);
                } else {
                    enterLeverForm(page);
                    recordPageState(page, url, null);
                    fieldsAsked = inspectFields(page);
                    fillLever(page, candidate);
                }
                DIAGNOSTICS.set("fieldsAsked", fieldsAsked);
                emit("fields_scanned", "Application form fields identified", JSON.createObjectNode().set("metadata", JSON.createObjectNode().set("fieldsAsked", fieldsAsked)));
                if (!attachResume(page, source, Path.of(resumePath))) {
                    emit("resume_upload_missing", "Resume upload control was not found", navigationDetails());
                    Path screenshot = logPath.resolve(artifact + "_review.png");
                    page.screenshot(new Page.ScreenshotOptions().setPath(screenshot).setFullPage(true));
                    ObjectNode out = result("review_required", false, "Resume upload control was not found; verify the form manually.");
                    out.put("screenshotPath", screenshot.toString());
                    emit("review_screenshot_saved", "Review screenshot saved", JSON.createObjectNode().put("screenshotPath", screenshot.toString()));
                    return out;
                }
                emit("resume_uploaded", "Tailored PDF resume attached", JSON.createObjectNode().put("resumePath", resumePath));
                List<String> missing = missingRequiredFields(page);
                int customQuestionCount = customQuestionCount(page, source);
                DIAGNOSTICS.put("customQuestionCount", customQuestionCount);
                ArrayNode fieldsAfterFill = inspectFields(page);
                DIAGNOSTICS.set("fieldsAfterFill", fieldsAfterFill);
                ObjectNode fieldDetails = navigationDetails();
                ObjectNode fieldMetadata = JSON.createObjectNode();
                fieldMetadata.set("fieldsAsked", fieldsAsked);
                fieldMetadata.set("fieldsAfterFill", fieldsAfterFill);
                fieldDetails.set("metadata", fieldMetadata);
                fieldDetails.set("missingRequiredFields", strings(missing));
                fieldDetails.put("customQuestionCount", customQuestionCount);
                emit("fields_filled", "Known candidate fields were populated", fieldDetails);
                if (source.equals("keka") && autoSubmit) {
                    Path screenshot = logPath.resolve(artifact + "_captcha.png");
                    if (!waitForKekaHumanCheckpoint(page, screenshot)) {
                        ObjectNode out = result("review_required", false, "Waiting for the CAPTCHA and required application details timed out; no application was submitted.");
                        out.put("stage", "captcha_human_intervention_timeout");
                        out.put("screenshotPath", screenshot.toString());
                        emit("captcha_human_intervention_timeout", "Human CAPTCHA checkpoint timed out", navigationDetails().put("screenshotPath", screenshot.toString()));
                        return out;
                    }
                    missing = missingRequiredFields(page);
                    DIAGNOSTICS.set("fieldsAfterHumanCheckpoint", inspectFields(page));
                    emit("captcha_human_intervention_completed", "CAPTCHA and required form fields were completed by the user", navigationDetails());
                }
                if (source.equals("ashby") && autoSubmit && hasCaptcha(page)) {
                    Path screenshot = logPath.resolve(artifact + "_captcha.png");
                    page.screenshot(new Page.ScreenshotOptions().setPath(screenshot).setFullPage(true));
                    ObjectNode out = result("review_required", false, "A CAPTCHA or bot check needs a person; the application was not submitted.");
                    out.put("stage", "captcha_human_intervention_required");
                    out.put("screenshotPath", screenshot.toString());
                    emit("captcha_human_intervention_required", "CAPTCHA or bot check detected; stopping for human review", navigationDetails().put("screenshotPath", screenshot.toString()));
                    return out;
                }
                if (customQuestionCount > 0 && !source.equals("keka")) missing.add("custom application questions need manual review");
                ObjectNode requiredDetails = JSON.createObjectNode();
                requiredDetails.set("missingRequiredFields", strings(missing));
                requiredDetails.put("customQuestionCount", customQuestionCount);
                emit("required_fields_checked", "Required field review completed", requiredDetails);
                if (!missing.isEmpty()) {
                    Path screenshot = logPath.resolve(artifact + "_review.png");
                    page.screenshot(new Page.ScreenshotOptions().setPath(screenshot).setFullPage(true));
                    ObjectNode out = result("review_required", false, "Required fields need review before submission.");
                    out.set("missingRequiredFields", strings(missing));
                    out.put("screenshotPath", screenshot.toString());
                    ObjectNode manualReviewDetails = JSON.createObjectNode();
                    manualReviewDetails.set("missingRequiredFields", strings(missing));
                    manualReviewDetails.put("screenshotPath", screenshot.toString());
                    emit("manual_review_required", "Required or custom questions need manual review", manualReviewDetails);
                    return out;
                }

                if (!autoSubmit) {
                    Path screenshot = logPath.resolve(artifact + "_review.png");
                    page.screenshot(new Page.ScreenshotOptions().setPath(screenshot).setFullPage(true));
                    ObjectNode out = result("prepared", false, "Form prepared; automatic submission is disabled.");
                    out.put("screenshotPath", screenshot.toString());
                    emit("prepared_for_review", "Form filled and saved for human review", JSON.createObjectNode().put("screenshotPath", screenshot.toString()));
                    return out;
                }

                Locator submit = source.equals("greenhouse")
                        ? page.locator("#submit_app")
                        : source.equals("keka") ? page.locator("button:has-text('Apply Now'), button[type='submit']").last()
                        : page.locator("#post-application_button, button:has-text('Submit Application')").first();
                if (submit.count() == 0 || !submit.isVisible() || !submit.isEnabled()) {
                    Path screenshot = logPath.resolve(artifact + "_review.png");
                    page.screenshot(new Page.ScreenshotOptions().setPath(screenshot).setFullPage(true));
                    ObjectNode out = result("review_required", false, "A usable submit button was not found.");
                    out.put("screenshotPath", screenshot.toString());
                    emit("submit_button_missing", "Submit button was unavailable", JSON.createObjectNode().put("screenshotPath", screenshot.toString()));
                    return out;
                }

                emit("submit_clicked", "Submit button clicked", navigationDetails());
                submit.click(new Locator.ClickOptions().setTimeout(10_000));
                pause(1200, 2200);
                try { page.waitForLoadState(LoadState.DOMCONTENTLOADED, new Page.WaitForLoadStateOptions().setTimeout(8_000)); }
                catch (Exception ignored) { }
                boolean confirmed = hasConfirmation(page);
                recordPageState(page, url, null);
                Path screenshot = logPath.resolve(artifact + (confirmed ? "_confirm.png" : "_unconfirmed.png"));
                page.screenshot(new Page.ScreenshotOptions().setPath(screenshot).setFullPage(true));
                ObjectNode out = result(confirmed ? "submitted" : "review_required", confirmed,
                        confirmed ? "Application confirmation detected." : "Submit was clicked, but no confirmation was detected; verify manually.");
                out.put("stage", confirmed ? "submission_confirmed" : "submission_unconfirmed");
                out.put("screenshotPath", screenshot.toString());
                if (confirmed) out.put("submittedAt", java.time.Instant.now().toString());
                emit(confirmed ? "submission_confirmed" : "submission_unconfirmed",
                        confirmed ? "Application confirmation detected" : "Submit click had no detectable confirmation",
                        navigationDetails().put("screenshotPath", screenshot.toString()));
                return out;
            } finally {
                context.close();
            }
        }
    }

    private static void fillGreenhouse(Page page, JsonNode candidate, JsonNode preferences) {
        String name = value(candidate, "name");
        String[] parts = name.trim().split("\\s+", 2);
        fill(page, "#first_name", parts.length > 0 ? parts[0] : "");
        fill(page, "#last_name", parts.length > 1 ? parts[1] : "");
        fill(page, "#email", value(candidate, "email"));
        fill(page, "#phone", value(candidate, "phone"));
        fillFirstVisible(page, "input[name*='github']", value(candidate, "github"));
        fillFirstVisible(page, "input[name*='linkedin']", value(candidate, "linkedin"));
        fillFirstVisible(page, "input[name*='portfolio'], input[name*='website']", value(candidate, "portfolio"));
        fillMatching(page, List.of("country", "country of residence"), value(preferences, "country"));
        fillMatching(page, List.of("city", "current city", "location city"), value(preferences, "location"));
        fillMatching(page, List.of("citizenship", "nationality"), value(preferences, "citizenship"));
        fillMatching(page, List.of("other citizenship", "dual citizenship"), value(preferences, "other_citizenships"));
        fillMatching(page, List.of("authorized to work", "work authorization", "eligible to work"), value(preferences, "work_authorization"));
        fillMatching(page, List.of("visa sponsorship", "require visa", "need sponsorship"), value(preferences, "visa_sponsorship_required"));
        fillMatching(page, List.of("relocate", "relocation"), value(preferences, "willing_to_relocate"));
    }

    private static void enterLeverForm(Page page) {
        Locator applyLink = page.locator("a[href*='/apply']").first();
        if (applyLink.count() > 0 && applyLink.isVisible()) {
            applyLink.click();
            pause(800, 1500);
        }
    }

    private static void fillLever(Page page, JsonNode candidate) {
        fill(page, "input[name='name']", value(candidate, "name"));
        fill(page, "input[name='email']", value(candidate, "email"));
        fill(page, "input[name='phone']", value(candidate, "phone"));
        fill(page, "input[name='org']", value(candidate, "current_company"));
        fill(page, "input[name='urls[LinkedIn]']", value(candidate, "linkedin"));
        fill(page, "input[name='urls[GitHub]']", value(candidate, "github"));
        fill(page, "input[name='urls[Portfolio]'], input[name='urls[Other]']", value(candidate, "portfolio"));
    }

    private static void enterKekaApplication(Page page) {
        Locator apply = page.locator("button:has-text('Apply for this job'), a:has-text('Apply for this job')").first();
        if (apply.count() > 0 && apply.isVisible()) {
            apply.click();
            page.waitForURL("**/careers/applyjob/**", new Page.WaitForURLOptions().setTimeout(20_000));
            pause(700, 1200);
        }
    }

    private static void fillKeka(Page page, JsonNode candidate, JsonNode preferences) {
        String[] nameParts = value(candidate, "name").trim().split("\\s+", 3);
        fill(page, "input[name='firstName']", nameParts.length > 0 ? nameParts[0] : "");
        fill(page, "input[name='middleName']", nameParts.length > 2 ? nameParts[1] : "");
        fill(page, "input[name='lastName']", nameParts.length > 1 ? nameParts[nameParts.length - 1] : "");
        fill(page, "input[name='email']", value(candidate, "email"));
        String phone = value(candidate, "phone").replaceAll("[^0-9]", "");
        if (phone.startsWith("91") && phone.length() > 10) phone = phone.substring(phone.length() - 10);
        fill(page, "input[name='mobilePhone.number']", phone);
        fill(page, "select[name='mobilePhone.countryCode']", "+91");
        String currency = first(preferences.path("compensation").path("currency").asText(""), "INR");
        double currentAnnual = preferences.path("compensation").path("currentAnnual").asDouble(0);
        double hikePercent = preferences.path("compensation").path("hikePercent").asDouble(0);
        long expectedAnnual = Math.round(currentAnnual * (1 + hikePercent / 100.0));
        if (currentAnnual > 0) fill(page, "input[name='currentSalary.amount']", Long.toString(Math.round(currentAnnual)));
        if (expectedAnnual > 0) fill(page, "input[name='expectedSalary.amount']", Long.toString(expectedAnnual));
        fill(page, "select[name='currentSalary.currency']", currency);
        fill(page, "input[name='expectedSalary.currency']", currency);
        fill(page, "input[name='standardFields.currentLocation.answer']", first(value(preferences, "location"), value(candidate, "location")));
        DIAGNOSTICS.put("salaryCurrency", currency);
        DIAGNOSTICS.put("currentAnnualSalary", currentAnnual > 0 ? Math.round(currentAnnual) : 0);
        DIAGNOSTICS.put("expectedAnnualSalary", expectedAnnual);
        DIAGNOSTICS.put("expectedHikePercent", hikePercent);
        DIAGNOSTICS.put("captchaRequired", page.locator("input[name='captcha']").count() > 0);
    }

    private static void enterAshbyApplication(Page page) {
        if (page.url().toLowerCase(Locale.ROOT).contains("/application")) return;
        Locator apply = page.locator("a[href*='/application'], button:has-text('Apply'), a:has-text('Apply')").first();
        if (apply.count() > 0 && apply.isVisible()) {
            apply.click();
            try { page.waitForURL("**/application**", new Page.WaitForURLOptions().setTimeout(20_000)); }
            catch (Exception ignored) { }
            pause(700, 1200);
        }
    }

    private static void fillAshby(Page page, JsonNode candidate, JsonNode preferences) {
        String[] nameParts = value(candidate, "name").trim().split("\\s+", 2);
        String currency = first(value(preferences.path("compensation"), "currency"), "INR");
        double currentAnnual = preferences.path("compensation").path("currentAnnual").asDouble(0);
        double hikePercent = preferences.path("compensation").path("hikePercent").asDouble(0);
        long expectedAnnual = Math.round(currentAnnual * (1 + hikePercent / 100.0));
        Locator fields = page.locator("input, textarea, select");
        for (int i = 0; i < fields.count(); i++) {
            Locator field = fields.nth(i);
            String type = attr(field, "type").toLowerCase(Locale.ROOT);
            if (type.equals("hidden") || type.equals("file") || type.equals("submit") || type.equals("button") || type.equals("radio") || type.equals("checkbox")) continue;
            String label = field.evaluate("el => { const own = el.labels ? [...el.labels].map(x => x.innerText).join(' ') : ''; return [own, el.closest('label')?.innerText, el.getAttribute('aria-label'), el.getAttribute('placeholder'), el.name, el.id].filter(Boolean).join(' ').toLowerCase(); }").toString();
            String answer = "";
            if (label.contains("email")) answer = value(candidate, "email");
            else if (label.contains("first name")) answer = nameParts.length > 0 ? nameParts[0] : "";
            else if (label.contains("last name")) answer = nameParts.length > 1 ? nameParts[1] : "";
            else if (label.contains("full name") || label.matches(".*\\bname\\b.*")) answer = value(candidate, "name");
            else if (label.contains("phone") || label.contains("mobile")) answer = value(candidate, "phone");
            else if (label.contains("current company") || label.equals("company")) answer = value(candidate, "current_company");
            else if (label.contains("linkedin")) answer = value(candidate, "linkedin");
            else if (label.contains("github")) answer = value(candidate, "github");
            else if (label.contains("portfolio") || label.contains("website")) answer = value(candidate, "portfolio");
            else if (label.contains("twitter")) answer = value(candidate, "twitter");
            else if (label.contains("current location") || label.equals("location")) answer = first(value(preferences, "location"), value(candidate, "location"));
            else if (label.contains("current salary") || label.contains("current compensation")) answer = currentAnnual > 0 ? Long.toString(Math.round(currentAnnual)) : "";
            else if (label.contains("expected salary") || label.contains("desired salary") || label.contains("salary expectation")) answer = expectedAnnual > 0 ? Long.toString(expectedAnnual) : "";
            else if (label.contains("currency") && currentAnnual > 0) answer = currency;
            if (!answer.isBlank()) fillLocator(field, answer);
        }
        fillAshbyRadios(page, preferences);
        DIAGNOSTICS.put("salaryCurrency", currency);
        DIAGNOSTICS.put("currentAnnualSalary", currentAnnual > 0 ? Math.round(currentAnnual) : 0);
        DIAGNOSTICS.put("expectedAnnualSalary", expectedAnnual);
        DIAGNOSTICS.put("expectedHikePercent", hikePercent);
        DIAGNOSTICS.put("captchaRequired", hasCaptcha(page));
    }

    private static void fillAshbyRadios(Page page, JsonNode preferences) {
        Locator radios = page.locator("input[type='radio']");
        for (int i = 0; i < radios.count(); i++) {
            Locator radio = radios.nth(i);
            String question = radio.evaluate("el => { const group = el.closest('fieldset') || el.closest('[role=group]') || el.parentElement?.parentElement; return (group?.innerText || '').toLowerCase(); }").toString();
            boolean visaQuestion = question.contains("visa") || question.contains("sponsor");
            boolean authorizationQuestion = question.contains("authorized to work") || question.contains("eligible to work") || question.contains("work authorization");
            if (!visaQuestion && !authorizationQuestion) continue;
            String option = radio.evaluate("el => { const labels = el.labels ? [...el.labels].map(x => x.innerText).join(' ') : ''; return (labels || el.value || '').trim().toLowerCase(); }").toString();
            String desired = visaQuestion ? value(preferences, "visa_sponsorship_required") : value(preferences, "work_authorization");
            boolean wantYes = desired.equalsIgnoreCase("yes") || desired.equalsIgnoreCase("true");
            if ((wantYes && option.equals("yes")) || (!wantYes && option.equals("no"))) {
                radio.check();
                break;
            }
        }
    }

    private static boolean hasCaptcha(Page page) {
        return page.locator("iframe[src*='captcha'], iframe[title*='captcha' i], iframe[src*='recaptcha'], iframe[src*='hcaptcha'], .cf-turnstile, [data-sitekey]").count() > 0;
    }

    private static boolean waitForKekaHumanCheckpoint(Page page, Path screenshot) {
        Locator captcha = page.locator("input[name='captcha']");
        if (captcha.count() == 0) return true;
        try {
            page.evaluate("""
            () -> {
              const id = 'codex-captcha-instructions';
              if (document.getElementById(id)) return;
              const banner = document.createElement('div');
              banner.id = id;
              banner.textContent = 'Human action needed: complete the CAPTCHA and any required fields. Keep this tab open; the application will be submitted automatically once the form is complete.';
              Object.assign(banner.style, { position: 'fixed', top: '0', left: '0', right: '0', zIndex: '2147483647', padding: '12px 18px', background: '#111827', color: 'white', font: '600 15px sans-serif', textAlign: 'center', boxShadow: '0 2px 12px #0008' });
              document.body.appendChild(banner);
            }""");
            emit("captcha_human_intervention_required", "Solve the CAPTCHA and complete any required fields in the visible browser", navigationDetails());
            page.waitForFunction("""
            () -> {
              const captcha = document.querySelector('input[name="captcha"]');
              if (!captcha || !String(captcha.value || '').trim()) return false;
              const required = [...document.querySelectorAll('input[required], textarea[required], select[required]')];
              return required.every(el => el.type === 'checkbox' || el.type === 'radio' ? el.checked : String(el.value || '').trim().length > 0);
            }""", null, new Page.WaitForFunctionOptions().setTimeout(600_000));
            return true;
        } catch (Exception error) {
            try { page.screenshot(new Page.ScreenshotOptions().setPath(screenshot).setFullPage(true)); }
            catch (Exception ignored) { }
            return false;
        }
    }

    private static boolean attachResume(Page page, String source, Path resume) {
        Locator input = source.equals("lever") ? page.locator("input[type='file'][name='resume']") : page.locator("input[type='file']").first();
        if (input.count() == 0 && source.equals("greenhouse")) {
            Locator attach = page.locator("[data-source='attach']").filter(new Locator.FilterOptions().setHasText("resume")).first();
            if (attach.count() > 0 && attach.isVisible()) attach.click();
            input = page.locator("input[type='file']").first();
        }
        if (input.count() > 0) {
            input.setInputFiles(resume);
            pause(900, 1600);
            return true;
        }
        return false;
    }

    private static void fillMatching(Page page, List<String> terms, String value) {
        if (value.isBlank()) return;
        Locator fields = page.locator("input, textarea, select");
        for (int i = 0; i < fields.count(); i++) {
            Locator field = fields.nth(i);
            String meta = (attr(field, "id") + " " + attr(field, "name") + " " + attr(field, "placeholder") + " " + attr(field, "aria-label")).toLowerCase(Locale.ROOT);
            for (String term : terms) {
                if (meta.contains(term)) {
                    fillLocator(field, value);
                    return;
                }
            }
        }
    }

    private static List<String> missingRequiredFields(Page page) {
        List<String> missing = new ArrayList<>();
        java.util.Set<String> selectedRadioGroups = new java.util.HashSet<>();
        Locator selectedRadios = page.locator("input[type='radio']:checked");
        for (int i = 0; i < selectedRadios.count(); i++) {
            String group = attr(selectedRadios.nth(i), "name");
            if (!group.isBlank()) selectedRadioGroups.add(group);
        }
        Locator fields = page.locator("input[required], textarea[required], select[required]");
        for (int i = 0; i < fields.count(); i++) {
            Locator field = fields.nth(i);
            String type = attr(field, "type").toLowerCase(Locale.ROOT);
            String group = attr(field, "name");
            if (type.equals("radio") && !group.isBlank() && selectedRadioGroups.contains(group)) continue;
            String tag = field.evaluate("el => el.tagName.toLowerCase()").toString();
            boolean empty = type.equals("checkbox") || type.equals("radio")
                    ? !field.isChecked()
                    : field.inputValue().isBlank();
            String label = first(attr(field, "aria-label"), attr(field, "name"), attr(field, "id"), "required field");
            if (empty && !missing.contains(label)) missing.add(label);
        }
        return missing;
    }

    private static boolean hasConfirmation(Page page) {
        String text = page.locator("body").innerText().toLowerCase(Locale.ROOT);
        String url = page.url().toLowerCase(Locale.ROOT);
        return text.contains("thank you for applying") || text.contains("thanks for applying")
                || text.contains("application submitted") || text.contains("application received")
                || text.contains("your application has been submitted") || text.contains("we have received your application")
                || text.contains("application submitted successfully") || text.contains("application received successfully")
                || text.contains("thank you for your interest")
                || text.contains("successfully applied")
                || url.contains("confirmation") || url.contains("thank-you");
    }

    private static int customQuestionCount(Page page, String source) {
        String selector = source.equals("greenhouse") ? ".custom_question" : ".application-question";
        Locator questions = page.locator(selector);
        int count = 0;
        for (int i = 0; i < questions.count(); i++) {
            if (questions.nth(i).isVisible()) count++;
        }
        return count;
    }

    private static ArrayNode inspectFields(Page page) {
        Object report = page.evaluate("""
        () -> {
          const controls = Array.from(document.querySelectorAll('input, textarea, select'));
          const fields = controls.filter(el => {
            const type = (el.getAttribute('type') || el.tagName).toLowerCase();
            return type !== 'hidden' && el.getClientRects().length > 0;
          }).map(el => {
            const labels = el.labels ? Array.from(el.labels).map(label => label.innerText.trim()).filter(Boolean).join(' ') : '';
            const parentLabel = el.closest('label')?.innerText?.trim() || '';
            const label = labels || parentLabel || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || el.id || 'unlabeled field';
            const type = (el.getAttribute('type') || el.tagName).toLowerCase();
            const hasValue = type === 'checkbox' || type === 'radio' ? el.checked : Boolean(String(el.value || '').trim());
            return { label, name: el.name || '', id: el.id || '', type, required: el.required || false, visible: true, hasValue };
          });
          return fields;
        }""");
        return JSON.valueToTree(report);
    }

    private static void recordPageState(Page page, String entryUrl, Response response) {
        String finalUrl = page.url();
        String entryHost = hostOf(entryUrl);
        String finalHost = hostOf(finalUrl);
        boolean reached = !finalUrl.isBlank() && page.locator("body").count() > 0;
        int httpStatus = response == null ? DIAGNOSTICS.path("navigationHttpStatus").asInt(-1) : response.status();
        String title = "";
        try { title = page.title(); } catch (Exception ignored) { }
        DIAGNOSTICS.put("entryUrl", entryUrl);
        DIAGNOSTICS.put("finalUrl", finalUrl);
        DIAGNOSTICS.put("entryHost", entryHost);
        DIAGNOSTICS.put("finalHost", finalHost);
        DIAGNOSTICS.put("navigationHttpStatus", httpStatus < 0 ? null : httpStatus);
        DIAGNOSTICS.put("pageReached", reached);
        DIAGNOSTICS.put("redirected", !entryUrl.equals(finalUrl));
        DIAGNOSTICS.put("externalRedirect", !entryHost.isBlank() && !entryHost.equalsIgnoreCase(finalHost));
        DIAGNOSTICS.put("pageTitle", title);
    }

    private static ObjectNode navigationDetails() {
        ObjectNode details = JSON.createObjectNode();
        details.setAll(DIAGNOSTICS);
        return details;
    }

    private static String hostOf(String url) {
        try { return URI.create(url).getHost() == null ? "" : URI.create(url).getHost().toLowerCase(Locale.ROOT); }
        catch (Exception ignored) { return ""; }
    }

    private static void emit(String stage, String message, JsonNode details) {
        ObjectNode event = JSON.createObjectNode()
                .put("at", java.time.Instant.now().toString())
                .put("stage", stage)
                .put("message", message);
        if (details != null && !details.isNull()) event.set("details", details);
        EVENTS.add(event);
        try { System.err.println("@@APPLY_EVENT:" + JSON.writeValueAsString(event)); }
        catch (Exception ignored) { System.err.println("@@APPLY_EVENT:{\"stage\":\"" + stage + "\"}"); }
    }

    private static void fillFirstVisible(Page page, String selector, String value) {
        if (value.isBlank()) return;
        Locator loc = page.locator(selector).first();
        if (loc.count() > 0 && loc.isVisible()) fillLocator(loc, value);
    }

    private static void fill(Page page, String selector, String value) {
        if (value.isBlank()) return;
        Locator loc = page.locator(selector).first();
        if (loc.count() > 0 && loc.isVisible()) fillLocator(loc, value);
    }

    private static void fillLocator(Locator loc, String value) {
        if (loc.evaluate("el => el.tagName.toLowerCase()").toString().equals("select")) {
            try { loc.selectOption(new SelectOption().setLabel(value)); }
            catch (Exception ignored) { }
        } else {
            loc.fill(value);
        }
    }

    private static String attr(Locator locator, String name) {
        String value = locator.getAttribute(name);
        return value == null ? "" : value;
    }

    private static ObjectNode result(String status, boolean submitted, String message) {
        return JSON.createObjectNode().put("status", status).put("submitted", submitted).put("message", message);
    }

    private static ArrayNode strings(List<String> values) {
        ArrayNode out = JSON.createArrayNode();
        values.forEach(out::add);
        return out;
    }

    private static String value(JsonNode node, String key) {
        JsonNode value = node.path(key);
        return value.isMissingNode() || value.isNull() ? "" : value.asText("");
    }

    private static String first(String... values) {
        for (String value : values) if (value != null && !value.isBlank()) return value;
        return "";
    }

    private static String safeName(String value) {
        return value.replaceAll("[^A-Za-z0-9]+", "_").replaceAll("^_+|_+$", "");
    }

    private static String safeMessage(Exception error) {
        String message = error.getMessage();
        return message == null ? error.getClass().getSimpleName() : message.replaceAll("[\\r\\n]+", " ");
    }

    private static void pause(int minMs, int maxMs) {
        try { Thread.sleep(ThreadLocalRandom.current().nextInt(minMs, maxMs + 1)); }
        catch (InterruptedException error) { Thread.currentThread().interrupt(); }
    }
}
