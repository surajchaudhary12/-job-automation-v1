const { z } = require('zod');

const JobSourceSchema = z.object({
  name: z.string().min(1),
  url: z.string().url().optional().nullable(),
  type: z.enum(['greenhouse', 'lever', 'linkedin', 'wellfound', 'instahyre', 'hirist']),
  isEnabled: z.boolean().default(true),
  config: z.record(z.any()).optional().nullable(),
});

const JobSchema = z.object({
  company: z.string().min(1),
  title: z.string().min(1),
  jd: z.string().min(1),
  url: z.string().url(),
  location: z.string().optional().nullable(),
  source: z.string(),
  sourceId: z.string().optional().nullable(),
  salaryEstimate: z.string().optional().nullable(),
  status: z.enum(['active', 'expired', 'filled']).default('active'),
  raw: z.record(z.any()).optional().nullable(),
});

module.exports = {
  JobSourceSchema,
  JobSchema,
};
