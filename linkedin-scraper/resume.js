import fs from 'fs';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PythonShell } from 'python-shell';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Tailors a resume Python script based on a job description using Gemini AI.
 * @param {string} jobDescription - The JD to tailor the resume for.
 * @returns {Promise<{pythonFile: string, pdfFile: string, timestamp: number}>}
 */
export async function tailorResume(jobDescription) {
  const timestamp = Date.now();
  const resumeDir = path.join(__dirname, 'resume');
  const baseResumePath = path.join(resumeDir, 'base_resume.py');
  const tailoredPythonPath = path.join(resumeDir, `tailored_resume_${timestamp}.py`);
  const tailoredPdfPath = path.join(resumeDir, `tailored_${timestamp}.pdf`);

  // 1. Read base resume script
  const baseResumeContent = fs.readFileSync(baseResumePath, 'utf8');

  // 2. Call Gemini API
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const prompt = `You are a resume tailoring expert. I have a resume written as a Python script using ReportLab.
Tailor this resume for the following job description.

Rules:
- Only modify text content (job bullets, summary, skills)
- Do NOT change any styling, colors, fonts, or layout code
- Do NOT add skills the candidate does not have
- Keep all Python/ReportLab code structure identical
- Return ONLY the complete Python code, nothing else, no markdown, no explanation

Job Description:
${jobDescription}

Current Resume Python Code:
${baseResumeContent}`;

  const result = await model.generateContent(prompt);
  const response = await result.response;
  let tailoredCode = response.text().trim();

  // Clean up markdown code blocks if Gemini included them despite instructions
  if (tailoredCode.startsWith('```python')) {
    tailoredCode = tailoredCode.replace(/^```python\n/, '').replace(/\n```$/, '');
  } else if (tailoredCode.startsWith('```')) {
    tailoredCode = tailoredCode.replace(/^```\n/, '').replace(/\n```$/, '');
  }

  // 3. Save tailored Python script
  fs.writeFileSync(tailoredPythonPath, tailoredCode);

  // 4. Run the script using PythonShell
  // The script is expected to output 'Suraj_Singh_Final_Resume.pdf' in the same directory
  await new Promise((resolve, reject) => {
    const options = {
      mode: 'text',
      pythonPath: 'python',
      scriptPath: resumeDir
    };

    PythonShell.run(path.basename(tailoredPythonPath), options).then(results => {
      resolve(results);
    }).catch(err => {
      reject(err);
    });
  });

  // 5. Move/Rename output PDF
  const defaultOutputPath = path.join(resumeDir, 'Suraj_Singh_Final_Resume.pdf');
  if (fs.existsSync(defaultOutputPath)) {
    fs.renameSync(defaultOutputPath, tailoredPdfPath);
  } else {
    // If the script doesn't output to the expected name, try searching for any new PDF
    console.warn(`[Resume] Expected output ${defaultOutputPath} not found.`);
  }

  return {
    pythonFile: `tailored_resume_${timestamp}.py`,
    pdfFile: `tailored_${timestamp}.pdf`,
    timestamp
  };
}
