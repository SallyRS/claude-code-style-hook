# claude-code-style-hook

Make Claude Code write the way you want it to, but only when a model you choose
is answering.

A style rule in `CLAUDE.md` applies to every model and drifts out of attention
during long, tool-heavy turns. This puts the rule back in front of the model on
four separate events, checks which model is actually answering first, and stays
completely silent otherwise.

Ships with a caveman register as the example directive. The directive is a plain
text file. Swap it for whatever you want enforced.

## Install

Three steps.

**1. Clone it.**

```bash
git clone https://github.com/SallyRS/claude-code-style-hook.git ~/claude-code-style-hook
```

**2. Point `config.json` at your model and directive.**

```json
{
  "model": "claude-opus-5",
  "directive": "directives/caveman.md"
}
```

`model` is matched as a prefix, so `claude-opus-5` also covers dated and point
variants.

Three directives ship:

| file | what it asks for |
| :-- | :-- |
| `directives/caveman.md` | short and blunt, grammar intact. The default, and the one in daily use |
| `directives/caveman-strict.md` | also drops articles. What the eval was run against |
| `directives/terse.md` | a plainer wording of the same idea |

Or write your own file and point `config.json` at it.

**3. Register the hook on four events in `~/.claude/settings.json`.**

```json
{
  "hooks": {
    "SessionStart":        [{ "hooks": [{ "type": "command", "command": "node /ABSOLUTE/PATH/claude-code-style-hook/hooks/style-gate.mjs", "timeout": 10 }] }],
    "UserPromptSubmit":    [{ "hooks": [{ "type": "command", "command": "node /ABSOLUTE/PATH/claude-code-style-hook/hooks/style-gate.mjs", "timeout": 10 }] }],
    "UserPromptExpansion": [{ "hooks": [{ "type": "command", "command": "node /ABSOLUTE/PATH/claude-code-style-hook/hooks/style-gate.mjs", "timeout": 10 }] }],
    "PostToolUse":         [{ "matcher": "Skill", "hooks": [{ "type": "command", "command": "node /ABSOLUTE/PATH/claude-code-style-hook/hooks/style-gate.mjs", "timeout": 10 }] }]
  }
}
```

Use real absolute paths; `~` is not expanded here. Restart Claude Code.

Verify it works:

```bash
cd ~/claude-code-style-hook && node --test test/gate.test.mjs
```

## Why four events

One event is not enough, and each of the three extras closes a specific gap.

| Event | Catches | Why the others miss it |
| :-- | :-- | :-- |
| `SessionStart` | session opens | Nothing else has fired yet |
| `UserPromptSubmit` | you type a message | The main path, once per turn |
| `UserPromptExpansion` | you type `/some-skill` | A typed slash command expands straight into a prompt and bypasses `PreToolUse` |
| `PostToolUse` (`Skill`) | Claude loads a skill mid-turn | A SKILL.md body lands between the directive and the reply, pushing the rule far back in context |

`SessionStart` is a special case. At startup the transcript carries no model id
yet, so the model cannot be read from disk. The hook injects anyway with a
self-gating first line telling any other model to ignore the block. From the
first assistant reply onward, every other event gates deterministically by
reading the transcript.

## What it deliberately does not do

**It does not rewrite your replies.** Two obvious-looking mechanisms both append
rather than replace:

- A `Stop` hook that blocks makes Claude write a *second* reply below the first.
  The verbose one stays on screen.
- On the experimental function-hooks API, `turn.complete` returns `{ text }`, and
  the type declaration says a text other than the answer's "is shown beneath it".
  Same problem.

The only true replacement point is `turn.step`, whose streamed chunks are "what
is shown and recorded". That is not implemented here.

So this is a prevention tool. It changes what gets written, rather than
correcting it afterwards. That also means it costs nothing: no extra model calls,
no added latency, no second reply to read.

## Guards worth knowing about

**It never fires inside a subagent.** Tool events fire inside subagents exactly
as they do on the main thread, carrying an `agent_id`. Without a guard, a
subagent drafting long-form copy would inherit your terse-chat rule and truncate
real work. The hook exits as soon as it sees `agent_id`.

**One typed slash command is not charged twice.** `UserPromptSubmit` and
`UserPromptExpansion` both fire for the same typed command, milliseconds apart. A
2-second dedup window keeps the first and drops the second. A later re-arm after
a skill load is always a model round trip away, so it still lands.

**Every failure path exits 0.** Malformed stdin, a missing transcript, an
unreadable directive file: all silent. A style hook must never cost you a turn.

## Off switch

```bash
hooks/style-toggle.sh status
hooks/style-toggle.sh off              # this session only
hooks/style-toggle.sh on
hooks/style-toggle.sh off --global     # everywhere until turned back on
hooks/style-toggle.sh on  --global
```

Sentinels live in `state/`, which is gitignored. Session sentinels older than
seven days are cleaned up automatically.

`commands/style.md` wraps this as a `/style` slash command. Copy it into
`~/.claude/commands/` and fix the script path inside it.

An `off` takes effect on your next message, since the current turn's directive
was injected before the command ran.

## Should you use this, or something else?

Six mechanisms were measured against each other on the case that separates them:
a skill loading mid-turn, between the directive and the reply. Six runs each.

| arm | mean words | vs no directive |
| :-- | --: | --: |
| nopus (`Stop` hook) | 361 | +7% |
| nothing | 337 | — |
| output style | 268 | -21% |
| function hook writing the system prompt | 212 | -37% |
| **this hook** | **178** | **-47%** |

That ordering is the opposite of what the mechanism predicts. An output style
sits in the system prompt and gets a periodic reminder from Claude Code itself;
this hook injects a system reminder into the conversation, the weakest channel
available. The weakest channel won by 89 words (se 21). Stacking mechanisms did
not help. No tested hypothesis explains it.

The one thing an output style cannot do is gate by model — verified: a Sonnet 5
run under the style answered in the terse register. This hook reads the model
from the transcript and stays silent on anything else.

Full numbers, the carve-out results, a comparison with
[JuliusBrussee/caveman](https://github.com/juliusbrussee/caveman), three
retracted claims and four harness bugs: [eval/RESULTS.md](eval/RESULTS.md).

## Does the carve-out actually hold?

Yes, measured. Twelve prompts, four mechanisms, one control. Zero leaks in every
active arm: nothing bled into skills, workflow prompts, code, commit messages,
client-voice copy, or a 900-word article, while the chat control went terse.

```bash
node eval/run.mjs                  # 12-case carve-out
node eval/interference.mjs <arm>   # the test that separates the mechanisms
node eval/length.mjs               # word counts on plain questions
```

Each case is a separate `claude -p` call against your own account. Nothing runs
until you invoke it.

## Writing your own directive

The directive is injected verbatim, so write it the way you want the model to
behave — a short block that models its own rule beats an essay about the rule.

Scope it explicitly. Both bundled directives end with a carve-out naming what
keeps normal prose: code, specs, prompts, documentation, commit messages, and
anything written in someone else's voice. Without that, a terse-chat rule will
happily shorten a document that needed to be long.

If you keep path-scoped rules in `~/.claude/rules/` with a `paths:` glob, those
stay the stronger mechanism for files, because they are enforced by path rather
than by the model's judgement. This hook governs conversation.

## Requirements

Node 18 or newer. No dependencies.

## License

MIT
