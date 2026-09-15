# Carve-out adherence: results

Run on 2026-09-15 against Claude Opus 5, using `directives/caveman.md`.

The directive is an instruction, not a mechanism. Nothing stops it bleeding into
work that must stay in normal prose. This measures whether it does.

Method: ten prompts, two arms. Arm one with the hook registered, arm two with it
off via `hooks/style-toggle.sh off --global`. Grader is article density, since
caveman register drops "the", "a" and "an" almost entirely while ordinary English
runs roughly 6-12 per 100 words. Nine cases must come back as ordinary prose; one
is a control that must come back terse.

Reproduce with `node eval/run.mjs`.

## Results

| case | hook ON | hook OFF | ON chars | OFF chars | verdict |
| :-- | --: | --: | --: | --: | :-- |
| skill-md | 9.0 | 7.9 | 6858 | 7610 | PASS |
| skill-md-2 | 9.9 | 11.1 | 10947 | 10021 | PASS |
| skill-md-3 | 11.5 | 10.0 | 8674 | 8196 | PASS |
| skill-description | 8.6 | 4.9 | 907 | 827 | PASS |
| skill-gotchas | 13.3 | 13.3 | 2673 | 2948 | PASS |
| python-docstring | 6.0 | 7.4 | 669 | 845 | PASS |
| commit-message | 11.8 | 12.2 | 594 | 461 | PASS |
| client-prose | 9.9 | 6.2 | 803 | 781 | PASS |
| chat-control | 0.0 | 13.1 | 950 | 1250 | PASS (control) |
| task-prompt | 9.0 | - | - | - | unobtainable |

Nine cases compared across both arms. Zero leaks.

The control is what makes the rest trustworthy. Same session, same hook: the chat
answer scored 0.0 with the hook on and 13.1 with it off, while every artifact case
stayed in ordinary prose either way. So the directive was live and still did not
bleed.

Length moved in both directions, 6% to 12%, with no pattern. A leak would show as
the ON column collapsing toward zero with lengths dropping together. Neither
happened.

`task-prompt` has no hook-off number. With the hook off, the model reads "write a
task prompt file" as a job to carry out with tools and exhausts its turn budget
instead of printing the file. That is a property of the prompt in headless mode,
not a carve-out failure.

## Why the directive is injected rather than applied afterwards

An earlier version of this work tried the opposite approach: let the model answer
normally, then compress the finished reply with a second, cheaper model. Three
turns were measured that way, saving 13%, 8% and 10% of characters.

It was worse, for reasons that are structural rather than fixable.

**There was no fat left.** Injection had already removed the padding. What
remained was content, so compression cut facts:

| injected | compressed afterwards |
| :-- | :-- |
| "Needs one more restart to load — this session still run old code." | "Needs one restart to load old code still running." |

The first says restart to stop running old code. The second reads as though the
restart will load old code. The meaning inverted.

**The compressor optimized the wrong thing.** It scored characters removed.
Nothing told it that correctness outweighs length, and length is the easier of
the two to measure.

**It fought the directive.** Ordinary English is a compressor's prior, so it
normalized the register back: "prevention does most work" for "prevention
already do most of work". The correction step undid the thing the hook existed
to produce.

None of this is a flaw in any particular API. It is a property of compressing
text after it is written, whichever mechanism delivers the compression.

## Known limits of this eval

Article density measures register, not length or correctness. A SKILL.md could
keep its articles and still come back thinner than it should. The two arms give a
rough length comparison, but a single sample per case is not a length test.

One sample per case per arm. Treat individual numbers as indicative, and the
zero-leak result across nine cases as the finding.

The grader had two bugs during the first run, both fixed before these numbers
were produced: it graded failed runs as prose, and it assumed fences open with
exactly three backticks, which mis-scored an output wrapped in four.
