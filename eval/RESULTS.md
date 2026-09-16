# Results

Three questions, measured rather than assumed:

1. Does the directive leak into work that must stay in normal prose?
2. Does a hook beat a Claude Code **output style** for the same job?
3. Is correcting a finished reply better than shaping it before it is written?

Run 2026-09-15 and 2026-09-16 against Claude Opus 5, Claude Code 2.1.271.
Reproduce with `node eval/run.mjs`.

## Method

Twelve prompts. Eleven must come back as ordinary prose (a SKILL.md, a workflow
task prompt, a Python function, a commit message, client-voice copy, a 900-word
article). One is a chat control that must come back terse.

Grader is article density. The directive tells Claude to drop "the", "a" and
"an", so a low score means it was followed. Ordinary English runs roughly 6-12
articles per 100 words. Fenced code and YAML frontmatter are stripped first; an
answer that is entirely one fence is graded on its own prose, since a docstring
or a commit body is the prose.

Three arms: hook registered, output style active, neither.

## 1. Carve-out adherence

| case | hook | output style | neither |
| :-- | --: | --: | --: |
| skill-md | 9.0 | 7.9 | 7.9 |
| skill-md-2 | 9.9 | 5.9 | 11.1 |
| skill-md-3 | 11.5 | 9.9 | 10.0 |
| skill-description | 8.6 | 7.4 | 4.9 |
| skill-gotchas | 13.3 | 12.8 | 13.3 |
| task-prompt | 9.0 | 7.0 | not obtainable |
| python-docstring | 6.0 | 6.7 | 7.4 |
| commit-message | 11.8 | 12.2 | 12.2 |
| client-prose | 9.9 | 9.5 | 6.2 |
| long-article (934-991 words) | 11.2 | 12.2 | not run |
| chat-control | 0.0 | 0.0 | 13.1 |

Zero leaks in either active arm. Both scored 0.0 on the chat control and left
every artifact case in ordinary prose, in the same range as the arm with nothing
running at all.

The control is what makes the rest trustworthy. Same session, same configuration:
the chat answer went terse while the artifact cases did not. So the instruction
was live and still did not bleed.

`task-prompt` has no "neither" number. With nothing active, the model reads
"write a task prompt file" as a job to carry out with tools and exhausts its turn
budget instead of printing the file. A property of that prompt in headless mode,
not a result.

## 2. Hook versus output style

They score the same on adherence. They are not interchangeable.

| | hook | output style |
| :-- | :-- | :-- |
| Where the text lands | system reminder inside the conversation | system prompt |
| Survives compaction | summarized away with the rest of the conversation | "System prompt and output style: Both still apply" |
| Periodic re-arm | none; the hook re-injects on its own schedule | Claude Code reminds Claude of the style during the conversation |
| Model gating | yes, by reading the transcript | **no** |
| Subagents | excluded via `agent_id` | excluded; subagents run their own system prompt |

**The model-gating difference is real and was verified.** With the style active
and the hook off, a `claude -p --model claude-sonnet-5` run answered in the terse
register. A style applies to whatever model is running.

So the choice is not about quality:

- **Want it on one model only → hook.** No style can do this.
- **Want it to survive compaction on every model → output style.** Fewer moving
  parts than this repo: one markdown file and one settings key.

A `PostModelSwitch` hook can add model-specific context, and the docs list it as
context-only, so it could inject a style-flavoured block on an Opus switch. It
fires on a model change, not every turn, which makes it weaker than
`UserPromptSubmit` for keeping an instruction in front of the model. Whether an
external file write of `outputStyle` reloads mid-session was not testable
headlessly; a fresh `-p` session reads settings at startup and proves nothing.

## 3. Why the directive is injected, not applied afterwards

The opposite approach was built and measured first: let the model answer, then
compress the finished reply with a cheaper model on a `turn.complete` function
hook. Three turns saved 13%, 8% and 10% of characters.

It was worse, for structural reasons.

**No fat was left.** Injection had already removed the padding, so compression
cut facts:

| injected | compressed afterwards |
| :-- | :-- |
| "Needs one more restart to load — this session still run old code." | "Needs one restart to load old code still running." |

The first says restart to stop running old code. The second reads as though the
restart will load old code. The meaning inverted.

**It optimized the wrong thing.** It scored characters removed. Nothing told it
correctness outweighs length, and length is the easier of the two to measure.

**It fought the directive.** Ordinary English is a compressor's prior, so it
normalized the register back: "prevention does most work" for "prevention
already do most of work".

Two mechanisms cannot help here at all, both confirmed in the docs. A blocking
`Stop` hook makes Claude write a second reply *below* the first, so the verbose
original stays on screen. `turn.complete` has the same shape: `TurnCompleteResult`
is `{ text }`, and a text other than the answer's "is shown beneath it". Only
`turn.step` truly replaces, since its chunks are "what is shown and recorded" —
and on this evidence, correction after writing is the wrong strategy whichever
API delivers it.

## What did not hold up

An earlier draft of this file claimed register drifts across a long session,
based on scoring 90 replies by position: article density rose from 3.9 to 4.9 per
100 words between the third and fourth quarters. That is inside the noise. With
22-23 replies per quarter and per-reply values ranging 0.0 to 12.5, the standard
error is around 0.8. Two noisy samples, not a decline.

Article density also tracks subject matter, not only obedience. A reply quoting
paths, commands and documentation carries more articles than a status report, so
the metric needs content-type controls before it can measure drift at all.

## Limits

One sample per case per arm. Treat individual numbers as indicative and the
zero-leak result across arms as the finding.

Density measures register, not length or correctness. A SKILL.md could keep its
articles and still come back thinner than it should.

The invoked-skill case is still untested. Both arms hit the turn limit while a
long-running skill was still executing, so what was captured is a status line
rather than skill output. It needs a skill that finishes quickly.

The grader had two bugs during the first run, both fixed before these numbers
were produced: it graded failed runs as prose, and it assumed fences open with
exactly three backticks, which mis-scored an output wrapped in four.
