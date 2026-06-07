#!/usr/bin/env bash
# Stop hook: after a task completes, ask the main agent to run the doc-sync subagent
# so package READMEs stay in sync and a CLAUDE.md proposal is regenerated.
#
# Safe against loops: if Claude is already continuing because of this hook
# (stop_hook_active=true), or there are no uncommitted changes, we allow the stop.

input="$(cat)"

# Avoid re-triggering on the continuation we ourselves caused.
if printf '%s' "$input" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$repo_root" || exit 0

# Only bother if the working tree actually changed (ignore pure doc/.claude noise).
# glob magic so **/README.md also matches the repo-root README.md (no dir prefix).
changes="$(git status --porcelain -- . ':(exclude).claude' ':(exclude,glob)**/README.md' 2>/dev/null)"
if [ -z "$changes" ]; then
  exit 0
fi

cat <<'JSON'
{
  "decision": "block",
  "reason": "Task complete with uncommitted changes. Use the Task tool to invoke the 'doc-sync' subagent now: analyze the changed files and update README.md in the affected packages. After it finishes, stop."
}
JSON
