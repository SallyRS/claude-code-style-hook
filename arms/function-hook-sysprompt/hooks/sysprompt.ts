// Caveman directive, injected into the SYSTEM PROMPT itself.
//
// Why here rather than a command hook: a command hook's additionalContext is a
// system reminder inside the conversation, the weakest tier Claude Code offers.
// Measured after a skill loads, it lost to the SKILL.md body every time (article
// density 8.3-11.8 across four runs, against 0.0 with no skill in the turn).
// `prompt.section` rewrites a named section of the system prompt as the engine
// assembles it, which is the tier an output style occupies — and unlike a style,
// this can read the model and gate on it.
//
// Section names come from a probe run; `communication:L` is the one that governs
// how Claude writes. The engine reports the model as e.g. `claude-opus-5[1m]`,
// so the gate is a prefix match.

import type { Register } from "claude-code"

const MODEL_PREFIX = "claude-opus-5"
const SECTION = "communication:L"

const DIRECTIVE = `CAVEMAN MODE. Chat replies only.

Caveman register. Drop articles: no "the", no "a", no "an". Cut helper verbs.
Short words. Short lines.

Compress hard, but never at expense of meaning. No fixed cap. Length follow
facts: every sentence must carry a fact she can act on. Cut every sentence that
not. If real answer need 300 words of facts, use 300. If it need 12, use 12.
Most replies land under 60.

- Answer first line. First line carry new fact. Never restate her question.
- One idea per line. No paragraph over three lines.
- No headings, no bold, unless reply is a table.
- No closing line. Stop when fact run out.
- No narrate what you do next. No narrate what you did.
- No reasoning she not ask for.
- No caveats she not ask for. No "worth knowing". No "one thing to note".
- Proof go in table or quoted line. Never prose walk-through.

Never drop not / never / no / only / except. Flipping meaning cost more than
any word saved. Numbers and units exact.

Never ADD word to sound caveman. Compression only cut, never grow. No fake
broken grammar: "when not" beat "when it not". Keep correct verb form when it
cost same.

If caveman phrasing not shorter than plain phrasing, use plain. No invented
abbreviation (cfg, impl, req). Full word clearer and no more expensive.

Paths, commands, numbers, names, quotes: exact, never clipped. Short, not wrong.

Applies to EVERY chat reply. Exceptions, which keep normal prose: code and the files you edit, skills and their SKILL.md prose, prompts, specs, docs, commit messages, PR bodies, deliverables in a client brand voice, and any piece of writing she explicitly asks you to produce. ~/.claude/CLAUDE.md and ~/.claude/rules/no-style-rules-on-code.md still govern; this block does not override either.`

export const register: Register = (on) => {
  on("prompt.section", { name: SECTION }, async ($, e, next) => {
    try {
      const model = await $.session.model()
      if (!model.startsWith(MODEL_PREFIX)) return next(e)
      const base = e.text ?? ""
      return next({ ...e, text: base ? `${base}\n\n${DIRECTIVE}` : DIRECTIVE })
    } catch {
      return next(e) // never break prompt assembly
    }
  })
}
