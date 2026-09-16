# claude-code-style-hook

## What it does and how it works

This project is a Claude Code hook that adds a writing-style directive to a
session only when a model you name is answering. The included example uses a
terse "caveman" register. The directive itself is an ordinary text file, so you
can replace it with your own instructions.

A Claude Code hook is a command that the Claude Code harness runs at specified
lifecycle events. This hook writes JSON containing
`hookSpecificOutput.additionalContext`. Claude Code wraps that text in a system
reminder and inserts it into the conversation where the event fired. It does
not alter the main system prompt.

For events after startup, the hook reads the active model identifier from the
session transcript. If that identifier does not start with the model prefix in
`config.json`, the hook exits without producing output.

The hook is registered for four events because no single event covers every
path to an answer:

| Event | What it covers | Why it is needed |
| :-- | :-- | :-- |
| `SessionStart` | The start of a session | Nothing else has fired yet. A new session's startup transcript has no model identifier, so the hook cannot perform its normal hard check. It injects the directive with a first line telling any nonmatching model to ignore the block. |
| `UserPromptSubmit` | Every message typed by the user | This is the main path for placing the directive near the next answer. |
| `UserPromptExpansion` | A typed command such as `/skillname` | A typed skill command expands directly into a prompt and bypasses `PreToolUse`. |
| `PostToolUse`, matched on `Skill` | A skill loaded during a turn | The loaded `SKILL.md` body lands between the earlier directive and the reply. This event places the directive after it again. |

The `PostToolUse` re-arm reads `tool_input.skill` and stays silent for skills
whose names indicate that their job is writing prose. The match includes names
containing terms such as `voice`, `article`, `post`, `linkedin`, `press`,
`digest`, `content`, `draft`, `editor`, `copy`, and `proposal`. A writing skill
usually loads just before long-form or client-facing output, which is the worst
time to repeat a terse-chat rule. The carve-out in the directive is an
instruction to the model; this filter is the one place where the mechanism can
enforce that carve-out. Tests confirmed that nine writing skills stay silent
and six technical skills re-arm.

## Guards

The hook exits when the event payload contains `agent_id`. Tool events also run
inside subagents, and a subagent doing drafting work must not inherit a terse
chat rule from the main session.

Claude Code fires both `UserPromptSubmit` and `UserPromptExpansion` for one
typed slash command. A two-second deduplication window keeps that command from
being charged twice. A later `PostToolUse` event occurs after a model round trip
and can still re-arm the directive.

Every failure path exits with status 0 and no output. Malformed input, a missing
transcript, an unreadable directive, or any other hook failure must not block a
Claude Code turn.

You can turn the hook off without removing its settings:

```bash
hooks/style-toggle.sh status
hooks/style-toggle.sh off
hooks/style-toggle.sh on
hooks/style-toggle.sh off --global
hooks/style-toggle.sh on --global
```

Without `--global`, `on` and `off` apply to the current session. Sentinel files
are stored in `state/`, which is ignored by Git.

## Install

Clone the repository:

```bash
git clone https://github.com/SallyRS/claude-code-style-hook.git /absolute/path/claude-code-style-hook
cd /absolute/path/claude-code-style-hook
```

Edit `config.json` to set the model prefix and directive path:

```json
{
  "model": "claude-opus-5",
  "directive": "directives/caveman.md"
}
```

The model value is matched as a prefix, so it also matches dated or point
variants that begin with the same text. The directive path is relative to the
repository root.

Register all four events in `~/.claude/settings.json`. Replace every example
path below with the absolute path to your clone. Do not use `~` in a hook
command.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /absolute/path/claude-code-style-hook/hooks/style-gate.mjs",
            "timeout": 10
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /absolute/path/claude-code-style-hook/hooks/style-gate.mjs",
            "timeout": 10
          }
        ]
      }
    ],
    "UserPromptExpansion": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /absolute/path/claude-code-style-hook/hooks/style-gate.mjs",
            "timeout": 10
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Skill",
        "hooks": [
          {
            "type": "command",
            "command": "node /absolute/path/claude-code-style-hook/hooks/style-gate.mjs",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

Restart Claude Code after changing the settings. Then verify the hook:

```bash
node --test test/gate.test.mjs
```

The test suite contains 14 tests.

## Writing your own directive

The hook injects the directive file verbatim. Write the instructions exactly as
you want the model to receive them, then set `directive` in `config.json` to the
new file.

State the scope and exceptions explicitly. The bundled directive ends with a
carve-out naming the work that must keep normal prose, including code,
documentation, prompts, specifications, commit messages, client-voice work, and
other writing the user asks the model to produce.

Three rules in `directives/caveman.md` were adopted from the upstream
[JuliusBrussee/caveman](https://github.com/juliusbrussee/caveman) skill after it
was measured: preserve words that control meaning, never add words merely to
sound caveman, and use plain phrasing when caveman phrasing is not shorter.

## What else was tested

Six delivery mechanisms and two directive variants were measured on one test:
a prompt loads a read-only skill during the turn and then asks an ordinary
question. Each arm ran six times. Fewer words is better.

| arm | mean words | vs no directive |
| :-- | --: | --: |
| nopus (Stop hook) | 361 | +7% |
| nothing | 337 | baseline |
| terse directive, same hook | 288 | -15% |
| output style | 268 | -21% |
| function hook writing the system prompt | 212 | -37% |
| upstream JuliusBrussee/caveman skill | 200 | -41% |
| command hook + function hook stacked | 198 | -41% |
| this hook, caveman directive | 178 | -47% |

The main finding is that the directive text mattered more than the delivery
mechanism. Replacing the shipped caveman directive with the terse directive,
through the same hook and the same events, added 109 words (standard error 17).
The best mechanism change was worth 89 words. In this test, wording beat
plumbing.

Adding concrete rules to the terse directive did not close the gap. A version
that banned filler, pleasantries, and hedging and specified a sentence pattern
measured 300 words, slightly worse than the terse directive without those
rules. The difference came from the grammar instruction itself, not merely from
being concrete. That result is counterintuitive, but it is the part readers can
act on when writing their own directives.

The terse variant was removed from the repository after these measurements. Only
`directives/caveman.md` ships. Its earlier text is recoverable from the git
history if you want to start a gentler directive from it, but start by measuring
whatever you write.

This hook beat the output style by 89 words (standard error 21). That is the one
clearly real gap. Its 22-word lead over the upstream caveman skill (standard
error 20) and its 20-word lead over the stacked command and function hooks are
inside the noise, so those results are ties.

The ordering contradicts the delivery mechanism. `additionalContext` becomes a
system reminder inside the conversation, which is the weakest channel tested.
An output style is part of the system prompt and receives a periodic reminder
from Claude Code itself. The weakest channel won. Stacking mechanisms did not
improve the result, so injection frequency does not explain it either. No
tested hypothesis explains the ordering. These numbers are recorded as a
measurement, not a theory.

The nopus `Stop` hook did not appear to trigger. None of its six runs contained
a rewrite notice. Its number therefore means "installed and silent," not
"working."

A separate carve-out evaluation ran 12 prompts against each mechanism. It
checked a `SKILL.md`, a workflow task prompt, a Python docstring, a commit
message, client-voice copy, and a 900-word article, all of which had to remain in
normal prose. It also included one chat control that had to use the terse
register. This hook, the output style, and the function hook each leaked zero
times. The upstream caveman skill leaked once: it wrote a `SKILL.md` explainer
in caveman register when the prompt asked for prose.

An output style cannot gate its directive by model. This was verified with a
Sonnet 5 run, which answered in the terse register while the style was active.

The repository also contains a working Claude Code function hook at
`arms/function-hook-sysprompt/`. Function hooks are an early-access feature and
require `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`. This hook handles
`prompt.section`, appends the directive to the system-prompt section named
`communication:L`, and gates on `$.session.model()`. It is the only tested
mechanism that both writes to the system prompt and gates by model. It ranked
second among the single delivery mechanisms.

See [eval/RESULTS.md](eval/RESULTS.md) for the evaluation results and
[arms/README.md](arms/README.md) for setup and implementation details for the
other mechanisms.

## Requirements

Node.js 18 or newer. The project has no dependencies.

## License

MIT
