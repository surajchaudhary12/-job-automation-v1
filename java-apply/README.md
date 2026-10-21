# Java application worker

The Java worker handles Greenhouse, Lever, Keka, and Ashby forms through Playwright for Java. Node.js still discovers, scores, and selects jobs, generates the tailored PDF, enforces the auto-submit gate, and records the application result.

## Build and install the browser

Use Java 17. The included Maven wrapper downloads Maven on its first run:

```powershell
npm run java:build
npm run java:install-browser
```

The first command creates `java-apply/target/java-apply-1.0.0.jar`. The second installs Playwright's Chromium build.

## Run through the existing pipeline

Set `LIVE_APPLY=true` to prepare applications. Set `AUTO_SUBMIT=true` to allow submission after the gate passes. Automatic submission requires a fit score of at least 8.5 by default, a supported ATS, compensation evidence at or above the 20 LPA target, and a role that does not match the project's auto-reject rules. Override the score threshold with `AUTO_APPLY_THRESHOLD`.

The Java worker uses `profiles/default` for persistent ATS sessions, writes review and confirmation screenshots under `logs/`, and never fills custom screening questions. Jobs with custom questions, missing required fields, or no detected post-submit confirmation are sent to manual review. Previously applied jobs in `tracker/applications.json` are skipped.

Greenhouse, Lever, Keka, and Ashby use the Java worker. Ashby public job listings can be added under `ashby_boards` in `config/job_sources.json`. The worker fills known profile and compensation fields, attaches the tailored resume, and leaves unknown required questions for review. It never attempts to bypass CAPTCHA or bot checks; these stop the application for a person. Keka opens a visible browser for its human CAPTCHA checkpoint. Set `JAVA_APPLY_ENABLED=false` to temporarily route supported ATSs through the existing Node.js handlers.

The scheduler checks every 15 minutes. It only prepares applications when `LIVE_APPLY=true`, and it submits eligible applications only when both `LIVE_APPLY=true` and `AUTO_SUBMIT=true`. Keep those switches false to run discovery and review only. Previous submissions recorded in `tracker/applications.json` are skipped.

## Apply-attempt instrumentation

Set current salary and desired hike in the dashboard under Application preferences. For example, INR 1,800,000 with a 40% hike calculates INR 2,520,000 as expected annual salary. Point `DATABASE_URL` at a reachable PostgreSQL database with valid credentials, then run `npm run prisma:push`. Apply-attempt instrumentation uses its own database connection, so it works even when `DB_ENABLED=false`. Each apply run writes a row to `apply_attempts`. `metadata` lists visible field labels, names, types, and required flags without storing entered values; `events` records timestamped stages. URL, host, redirect, page reach, title, and HTTP status columns show whether the browser reached the job page or an external application site.

Example query:

```sql
SELECT company, designation, source, status, stage, job_url,
       entry_url, final_url, external_redirect, page_reached,
       navigation_http_status, metadata->'fieldsAsked' AS fields_asked,
       metadata->'fieldsAfterFill' AS fields_after_fill,
       missing_required_fields, events, error
FROM apply_attempts
ORDER BY started_at DESC;
```
