#!/usr/bin/env node
'use strict';

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

const GRAPHQL_URL = 'https://leetcode.com/graphql/';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_LIMIT = 50;

async function leetcodeQuery(query, variables = {}) {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': 'job-automation-leetcode-mcp/1.0',
      referer: 'https://leetcode.com/'
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error(`LeetCode returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join('; '));
  }
  if (!payload.data) {
    throw new Error('LeetCode returned an empty response');
  }
  return payload.data;
}

function textResult(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function errorResult(error) {
  const message = error?.name === 'TimeoutError'
    ? 'LeetCode request timed out. Try again shortly.'
    : (error?.message || 'The LeetCode request failed.');
  return { isError: true, content: [{ type: 'text', text: message }] };
}

async function respond(handler, args) {
  try {
    return textResult(await handler(args));
  } catch (error) {
    return errorResult(error);
  }
}

function boundedLimit(value, fallback = 20) {
  return Math.max(1, Math.min(MAX_LIMIT, value ?? fallback));
}

function createServer() {
  const server = new McpServer({
    name: 'job-automation-leetcode',
    version: '1.0.0'
  });

  server.tool(
    'leetcode_daily_challenge',
    'Get the current LeetCode daily coding challenge.',
    {},
    async () => respond(async () => {
      const data = await leetcodeQuery(`
        query dailyChallenge {
          activeDailyCodingChallengeQuestion {
            date
            link
            question {
              questionFrontendId
              title
              titleSlug
              difficulty
              acRate
              topicTags { name slug }
            }
          }
        }
      `);
      return data.activeDailyCodingChallengeQuestion;
    })
  );

  server.tool(
    'leetcode_get_problem',
    'Get a LeetCode problem statement and metadata by its URL slug. Does not include a solution.',
    { titleSlug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/i) },
    async ({ titleSlug }) => respond(async () => {
      const data = await leetcodeQuery(`
        query questionData($titleSlug: String!) {
          question(titleSlug: $titleSlug) {
            questionId
            questionFrontendId
            title
            titleSlug
            content
            difficulty
            likes
            dislikes
            isPaidOnly
            similarQuestions
            topicTags { name slug }
            codeSnippets { lang langSlug code }
          }
        }
      `, { titleSlug });
      if (!data.question) throw new Error(`Problem not found: ${titleSlug}`);
      return data.question;
    })
  );

  server.tool(
    'leetcode_search_problems',
    'Search public LeetCode problems by difficulty and/or topic tags.',
    {
      difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
      tags: z.array(z.string().min(1).max(80)).max(10).optional(),
      limit: z.number().int().min(1).max(MAX_LIMIT).default(20),
      skip: z.number().int().min(0).max(10_000).default(0)
    },
    async ({ difficulty, tags, limit, skip }) => respond(async () => {
      const filters = {};
      if (difficulty) filters.difficulty = difficulty;
      if (tags?.length) filters.tags = tags.join('+');
      const data = await leetcodeQuery(`
        query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
          problemsetQuestionList(categorySlug: $categorySlug, limit: $limit, skip: $skip, filters: $filters) {
            total
            questions {
              questionFrontendId
              title
              titleSlug
              difficulty
              acRate
              paidOnly
              topicTags { name slug }
            }
          }
        }
      `, { categorySlug: '', limit: boundedLimit(limit), skip, filters });
      return data.problemsetQuestionList;
    })
  );

  server.tool(
    'leetcode_get_user_profile',
    'Get publicly visible LeetCode profile, ranking, and solved counts for a username.',
    { username: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/) },
    async ({ username }) => respond(async () => {
      const data = await leetcodeQuery(`
        query userPublicProfile($username: String!) {
          matchedUser(username: $username) {
            username
            profile {
              realName
              aboutMe
              ranking
              countryName
              skillTags { name }
            }
            submitStats {
              acSubmissionNum { difficulty count submissions }
              totalSubmissionNum { difficulty count submissions }
            }
          }
        }
      `, { username });
      if (!data.matchedUser) throw new Error(`Public profile not found: ${username}`);
      return data.matchedUser;
    })
  );

  server.tool(
    'leetcode_get_recent_submissions',
    'Get recent public submissions for a LeetCode username.',
    {
      username: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/),
      limit: z.number().int().min(1).max(MAX_LIMIT).default(20)
    },
    async ({ username, limit }) => respond(async () => {
      const data = await leetcodeQuery(`
        query recentAcSubmissionList($username: String!, $limit: Int!) {
          recentAcSubmissionList(username: $username, limit: $limit) {
            title
            titleSlug
            timestamp
          }
        }
      `, { username, limit: boundedLimit(limit) });
      return data.recentAcSubmissionList;
    })
  );

  server.tool(
    'leetcode_get_contest_ranking',
    'Get public contest rating and ranking information for a LeetCode username.',
    { username: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/) },
    async ({ username }) => respond(async () => {
      const data = await leetcodeQuery(`
        query userContestRankingInfo($username: String!) {
          userContestRanking(username: $username) {
            attendedContestsCount
            rating
            globalRanking
            totalParticipants
            topPercentage
          }
        }
      `, { username });
      return data.userContestRanking;
    })
  );

  return server;
}

async function main() {
  const transport = new StdioServerTransport();
  await createServer().connect(transport);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('LeetCode MCP server failed to start:', error);
    process.exitCode = 1;
  });
}

module.exports = { boundedLimit, leetcodeQuery, createServer };
