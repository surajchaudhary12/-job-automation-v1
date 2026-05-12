# Job Application Agent

## Candidate Positioning

Load candidate details from `config/candidate_profile.json`.

Position the candidate using the `positioning` field from the profile.

Use current title: **Analyst**

Never position as:
- Business Analyst
- Frontend engineer
- AI researcher
- DevOps engineer

## Targeting

Auto-reject when:
- Fit score is below 7/10 for applications, below 6/10 for tracking
- Role is pure frontend
- Role requires mandatory 6+ YOE
- Compensation is an obvious downgrade
- Role is heavy DevOps/SRE-only
- Role requires mandatory deep domain expertise Suraj does not have
- Role is from a low-paying service company with weak engineering culture

Prioritize:
- Backend engineering
- Java/C++
- Product companies
- Distributed systems
- Scalability
- Strong engineering culture
- Likely compensation above 20 LPA

Daily target:
- Apply to 30-35 high-quality jobs/day, not mass spam.
- Run discovery batches about every 6 hours when automation is active.
- Preferred sources: LinkedIn Jobs, Wellfound, Instahyre, Greenhouse, Lever, YC Jobs, company career pages.
- Prefer Greenhouse, Lever, YC Jobs, Wellfound, and LinkedIn Easy Apply.
- Avoid complex ATS flows unless fit is at least 8.5/10.

## Fit Scoring

Score each job on:
- Skill match
- Experience realism
- Compensation upside
- Career growth
- Interview probability

Output:
- Fit Score (/10)
- Compensation Probability
- Career Upside
- Interview Probability
- Priority: High, Medium, Low
- Risks

Apply only when:
- Fit score is at least 7/10
- Compensation likely meets or exceeds 20 LPA
- Role aligns with backend, systems, platform, or product engineering direction

## Resume Policy

Maintain only these master templates:
- `templates/backend_java.tex`
- `templates/cpp_systems.tex`
- `templates/fullstack.tex`
- `templates/ai_backend.tex`
- `templates/distributed_systems.tex`
- `templates/generic_product_engineer.tex`

Only modify:
- Summary
- Skills ordering
- Keywords
- Projects ordering

Always include:
- Competitive programming achievements from `config/candidate_profile.json`
- Impact metrics from `config/candidate_profile.json`

Output filenames:
- `generated/Suraj_resume_<company>.tex`
- `generated/Suraj_resume_<company>.pdf`

## Recruiter Message

Generate a concise 80-120 word LinkedIn message.

Must mention:
- Current company from `config/candidate_profile.json`
- Backend systems
- Competitive programming achievement from `config/candidate_profile.json`
- Role alignment

Tone:
- Confident
- Concise
- Technical
- Professional

## Application Automation

Use Playwright for applications.

Use human-like behavior:
- Persistent browser context/session reuse
- Random delays
- Human typing speed
- Mouse movement
- No simultaneous LinkedIn actions
- No aggressive headless scraping
- Residential proxy only if necessary

Flow:
1. Open apply URL
2. Fill forms
3. Upload tailored resume
4. Upload cover letter only if mandatory
5. Submit application
6. Save confirmation

Track every evaluated/applied job in `tracker/applications.json`.

Tracker fields:
- company
- role
- URL
- fit_score
- compensation_estimate
- status
- date_applied
- recruiter
- resume_used
- notes

Valid statuses:
- discovered
- shortlisted
- applied
- OA received
- interview
- rejected
- offer

Auto-apply only when confidence is at least 7/10 and the form risk is low.

Save screenshots, confirmation pages, and timestamps for submitted applications.

## Token Optimization

- Store candidate profile and rules locally.
- Reuse master resume templates.
- Send only JD-specific deltas to the model.
- Reuse recruiter message skeletons.
- Avoid repeating full resume or unchanged history.

## Local LLM Policy

- Use only local Ollama models.
- Primary model: `qwen2.5-coder:14b`.
- Fallback models: `llama3.1`, `deepseek-coder`, `mistral`.
- Do not use OpenAI, Anthropic, or paid AI APIs.
- Cache repeated LLM calls under `.cache/ollama`.
