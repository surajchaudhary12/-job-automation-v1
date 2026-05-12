const { prisma } = require("./prisma");

function toDbStatus(status) {
  if (status === "OA received") return "oa_received";
  return String(status || "discovered").replace(/\s+/g, "_");
}

async function storeApplication(entry) {
  const db = prisma();
  if (!db) return { stored: false, reason: "DATABASE_URL not set" };

  const job = await db.job.upsert({
    where: { url: entry.URL || entry.url },
    update: {
      fitScore: entry.fit_score,
      compensation: entry.compensation_estimate
    },
    create: {
      company: entry.company,
      title: entry.role,
      jd: entry.jd || "",
      url: entry.URL || entry.url,
      location: entry.location || "",
      source: entry.source || "unknown",
      salaryEstimate: entry.salary_estimate || "",
      fitScore: entry.fit_score,
      compensation: entry.compensation_estimate
    }
  });

  let recruiter = null;
  if (entry.recruiter) {
    recruiter = await db.recruiter.create({
      data: {
        name: entry.recruiter,
        company: entry.company,
        message: entry.recruiter_message || ""
      }
    });
  }

  let resume = null;
  if (entry.resume_used) {
    resume = await db.resume.create({
      data: {
        company: entry.company,
        template: entry.resume_template || "",
        texPath: entry.resume_used.endsWith(".tex") ? entry.resume_used : "",
        pdfPath: entry.resume_used.endsWith(".pdf") ? entry.resume_used : null
      }
    });
  }

  await db.application.upsert({
    where: { company_role: { company: entry.company, role: entry.role } },
    update: {
      status: toDbStatus(entry.status),
      fitScore: entry.fit_score,
      compensationEstimate: entry.compensation_estimate,
      notes: entry.notes,
      recruiterId: recruiter?.id,
      resumeId: resume?.id
    },
    create: {
      jobId: job.id,
      company: entry.company,
      role: entry.role,
      url: entry.URL || entry.url,
      status: toDbStatus(entry.status),
      fitScore: entry.fit_score,
      compensationEstimate: entry.compensation_estimate,
      notes: entry.notes,
      recruiterId: recruiter?.id,
      resumeId: resume?.id
    }
  });

  return { stored: true };
}

async function storeRun(summary) {
  const db = prisma();
  if (!db) return { stored: false, reason: "DATABASE_URL not set" };
  await db.run.create({ data: summary });
  return { stored: true };
}

module.exports = { storeApplication, storeRun };
