# Results

Five mechanisms measured against each other, on one machine, Claude Opus 5,
Claude Code 2.1.271, 2026-09-15 and 2026-09-16.

The question behind all of it: what actually keeps a writing-style instruction in
front of the model, and what does it cost in unwanted side effects?

## The headline

A skill loading mid-turn is the case that separates every approach. On a plain
question they all work. Six runs per arm, one prompt that loads a read-only
skill and then asks an ordinary question:

| arm | n | mean words | range | vs baseline | articles/100w |
| :-- | --: | --: | :-- | --: | --: |
| nothing | 6 | 337 | 305-364 | — | 10.3 |
| output style | 6 | 268 | 219-315 | -21% | 7.9 |
| function hook (`prompt.section`) | 6 | 212 | 174-230 | -37% | 7.6 |
| command hook + function hook | 6 | 198 | 163-215 | -41% | 7.8 |
| **command hook** | 6 | **178** | 139-216 | **-47%** | **6.2** |

The command hook wins, and the margins clear their error bars: 89 words below
the output style (se 21) and 34 below the function hook (se 15).

This is the opposite of what the mechanism suggests. A command hook's
`additionalContext` is a system reminder inside the conversation — the weakest
channel Claude Code offers for an instruction. An output style sits in the system
prompt and gets a periodic reminder the engine sends on its own. The strongest
channel finished last and the weakest finished first.

Stacking the command hook and the function hook gave 198 words, statistically
tied with both singles. So "more injections per turn" does not explain the
ordering either. No tested hypothesis explains it; the ranking is a measurement,
not a theory.

## Carve-out adherence

Twelve prompts, eleven of which must come back as ordinary prose: a SKILL.md, a
workflow task prompt, a Python function with a docstring, a commit message,
client-voice copy, a 900-word article. The twelfth is a chat control that must
come back terse.

Grader is article density. The directive says to drop "the", "a" and "an", so a
low score means it was followed. Ordinary English runs roughly 6-12 per 100 words.

| arm | leaks | chat control |
| :-- | --: | --: |
| command hook | 0 | 0.0 |
| function hook | 0 | 0.6 |
| output style | 0 | 0.0 |
| upstream caveman skill | 0 | 1.0 |

All four hold. Nothing bled into client copy, skill files, prompts, code, or
commit messages, while the chat control went terse in every active arm.

The control is what makes that trustworthy: same configuration, same session, and
the chat answer went terse while the artifact cases did not.

## Comparison with the upstream `caveman` skill

[JuliusBrussee/caveman](https://github.com/juliusbrussee/caveman) solves a
different problem — token cost across thirty-plus agents — with a skill plus a
proxy. On the twelve-case carve-out eval, invoked properly, it tied with
everything here: twelve cases, zero leaks either side.

Its rule text is better written than this repo's first draft, and three of its
rules were adopted here after measuring:

```
Never drop not/never/no/only/except: flipping meaning costs more than any token saved.
Never ADD a word to sound caveman. Compression only cuts, never grows.
If caveman phrasing is not shorter than plain phrasing, use plain.
```

It also resolves a contradiction this repo's directive originally had, between
"drop articles" and "must be understood on first read", by saying which wins:
clarity.

## Why the directive is injected rather than applied afterwards

The opposite approach was built and measured first: let the model answer, then
compress the finished reply with a cheaper model on a `turn.complete` function
hook. Three turns saved 13%, 8% and 10% of characters, and it was worse.

**There was no fat left**, so compression cut facts:

| injected | compressed afterwards |
| :-- | :-- |
| "Needs one more restart to load — this session still run old code." | "Needs one restart to load old code still running." |

The first says restart to stop running old code. The second reads as though the
restart will load old code. The meaning inverted.

It also optimized the wrong thing — it scored characters removed, and nothing
told it correctness outweighs length — and it normalized the register back
toward ordinary English, undoing the directive.

Two mechanisms cannot help at all, confirmed in the docs and the type
declarations. A blocking `Stop` hook makes Claude write a second reply *below*
the first. `turn.complete` has the same shape: `TurnCompleteResult` is `{ text }`
and a text other than the answer's "is shown beneath it". Only `turn.step`
truly replaces, since its chunks are "what is shown and recorded".

## What did not hold up

Three claims made during this work were retracted after more data. They are kept
here because each was stated confidently first.

**"Register drifts across a long session."** Based on scoring 90 replies by
position: density rose 3.9 to 4.9 between the third and fourth quarters. That is
inside the noise — 22-23 replies per quarter, per-reply values ranging 0.0 to
12.5, standard error around 0.8.

**"The system prompt arm is better."** At n=3 it looked like 8.2 against 10.3.
At n=9 the difference was 1.7 with a standard error of 1.6. It took a cleaner
test, not a bigger one, to separate the arms.

**"More injections per turn explains the gap."** Predicted that stacking both
mechanisms would beat either. It tied with both.

## Bugs in this harness, found and fixed

Three, all of which produced wrong numbers before they were caught.

**Failed runs graded as prose.** A `claude -p` call that errored wrote
`RUN FAILED: …` to the output file, and the grader scored that text and called
it a pass. Now a failed run is marked `ERROR (not graded)`.

**Fences assumed to be exactly three backticks.** An answer wrapped in four
(```` ````markdown ````) was mis-stripped and a full normal-prose SKILL.md scored
0.0. The fence matcher now captures the opener's own length.

**An entirely-fenced answer graded on its preamble.** When a reply was a short
status line plus one long fenced document, the grader scored the status line —
three words — and reported a leak that did not exist. It now grades whichever
body carries more words, inside the fence or outside it.

**The interference prompt used the wrong skill.** It originally invoked
`ai-writing-guard`, which routes through a paid MCP service *and rewrites prose*.
Four jobs were started and abandoned, and any register change could have been the
skill's edit rather than the directive's. Replaced with `find-skills`: read-only,
no scripts, no MCP. The swap changed the result — arms that had looked tied
separated cleanly.

## Reproducing

```bash
node eval/run.mjs                  # 12-case carve-out, current configuration
node eval/interference.mjs <arm>   # 6 runs of the skill-interference test
node eval/length.mjs               # word counts on plain chat questions
```

Set up the arm first: toggle the command hook with `hooks/style-toggle.sh`, set
`outputStyle` in settings, or pass `--plugin-dir ./arms/function-hook-sysprompt`.
See `arms/README.md`.

Every case is a separate `claude -p` call against your own account. Nothing runs
until you invoke it.

## Limits

One prompt drives the interference test. The ordering is solid for that prompt
and unverified for others.

Six runs per arm. Enough to separate 178 from 268, not enough to split 178 from
198.

Article density measures register, not correctness. It also tracks subject
matter: a reply quoting paths and commands carries more articles than a status
report, regardless of obedience.

Run outputs are gitignored — generated, large, and stale as soon as a model
updates. The numbers above are the record; the scripts reproduce them.
