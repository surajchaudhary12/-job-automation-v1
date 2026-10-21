# LeetCode MCP

A read-only Model Context Protocol server for public LeetCode problem and profile data. It runs over stdio and is kept separate from the job automation pipeline.

## Run

From the repository root:

```sh
npm run mcp:leetcode
```

The MCP client starts this command as a child process. Do not run it in a terminal and expect normal console output: stdout carries MCP messages. Startup errors are written to stderr.

## Tools

- `leetcode_daily_challenge` — current daily challenge
- `leetcode_get_problem` — statement, metadata, tags, and code snippets by problem slug
- `leetcode_search_problems` — filter by difficulty and topic tags, with bounded pagination
- `leetcode_get_user_profile` — public profile and solved counts
- `leetcode_get_recent_submissions` — recent accepted submissions
- `leetcode_get_contest_ranking` — public contest rating and ranking

All data comes from LeetCode's public GraphQL endpoint. The server does not require credentials and does not submit solutions or change account data. LeetCode may change or rate-limit this unofficial endpoint.

## Connect from Codex

Add a server entry to your Codex `config.toml` (`%USERPROFILE%\\.codex\\config.toml` on Windows):

```toml
[mcp_servers.leetcode]
command = "node"
args = ["leetcode-mcp/server.js"]
cwd = "C:/path/to/Job_automation_v1"
```

Replace `cwd` with this repository's absolute path, then restart Codex so it loads the server.

Other MCP clients that launch local stdio servers can use the same `node` command and script path in their server configuration.
