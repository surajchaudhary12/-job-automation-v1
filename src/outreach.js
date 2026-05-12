const { candidateProfile } = require("./config");

function recruiterMessage(job) {
  if (!job.recruiter) return "";
  const profile = candidateProfile();
  const competitiveAchievement = profile.achievements?.[0] || "competitive programming background";
  const skillLine = (profile.skills || []).slice(0, 5).join(", ");

  return `Hi ${job.recruiter}, I am ${profile.name}, currently an ${profile.title} at ${profile.current_company} working around backend systems, production workflows, debugging, and API optimization. The ${job.role || job.title} role at ${job.company} looks strongly aligned with my ${skillLine}, scalable systems, and DSA background. I also bring ${competitiveAchievement} and strong DSA practice. I would be glad to connect and share how my backend systems mindset can contribute to this team.`;
}

module.exports = { recruiterMessage };
