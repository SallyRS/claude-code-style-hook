# Arms

Each subfolder is one mechanism the eval measured, kept so the results can be
reproduced rather than taken on trust.

## function-hook-sysprompt

A Claude Code **function hook** (early-access API, behind
`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`). It hooks `prompt.section`, matches the
system-prompt section named `communication:L`, and appends the directive to it
when `$.session.model()` starts with `claude-opus-5`.

This is the only mechanism that writes the system prompt *and* gates by model.
An output style writes the system prompt but applies to every model; the command
hook gates by model but writes a system reminder inside the conversation.

Run it:

```bash
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir ./arms/function-hook-sysprompt
```

Check what the engine sees, including which `$` capabilities it calls:

```bash
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin validate ./arms/function-hook-sysprompt
```

Regenerate the API declarations after a Claude Code update with `/plugin-types`.
Section names come from a probe run; they are build-specific, so re-probe rather
than assuming `communication:L` still exists.

## output style

Not kept here as a file, because it is generated from the same directive. To
reproduce that arm, copy `directives/caveman.md` into
`~/.claude/output-styles/caveman.md` with this frontmatter, then set
`"outputStyle": "Caveman"` in settings:

```yaml
---
name: Caveman
description: Terse register for chat replies, normal prose kept for code and artifacts
keep-coding-instructions: true
---
```

`keep-coding-instructions: true` matters. Without it a custom style drops Claude
Code's built-in software-engineering instructions.
