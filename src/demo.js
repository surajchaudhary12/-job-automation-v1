const { runLivePipeline } = require("./pipeline/live");
const { log } = require("./logging/logger");

async function runDemo() {
  console.log("Starting Job Automation Demo...");
  console.log("This will process a mock job to test scoring, tailoring, and application preparation.");

  const mockJob = {
    company: "TestCorp AI",
    title: "Backend Engineer (Java/Spring Boot)",
    location: "Bangalore (Remote)",
    url: "https://boards.greenhouse.io/testcorp/jobs/12345",
    jd: `
      About the role:
      We are looking for a Backend Engineer with 3-5 years of experience.
      Required Skills:
      - Strong Java and Spring Boot experience.
      - Experience with Microservices and Scalable Systems.
      - Knowledge of MySQL and Redis.
      - Familiarity with monitoring tools like Prometheus/Grafana.
      
      Compensation: 25-35 LPA
    `,
    source: "greenhouse",
    salary_estimate: "25-35 LPA"
  };

  try {
    await runLivePipeline({
      jobs: [mockJob],
      limit: 1,
      useLlm: true,
      prepareApply: false // Don't actually open browser for demo unless specified
    });

    console.log("\nDemo complete! Check 'tracker/applications.json' and 'reports/' for results.");
  } catch (error) {
    console.error("Demo failed:", error);
  }
}

runDemo();
