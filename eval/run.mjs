#!/usr/bin/env node
// Carve-out adherence eval.
//
// The style directive is an instruction, not a mechanism. Nothing stops it
// bleeding into work that must stay in normal prose: skills, workflow prompts,
// code, commit messages, client-voice copy. This measures whether it does.
//
// Grader: article density. Caveman register drops "the", "a" and "an" almost
// entirely; ordinary English runs roughly 6-12 articles per 100 words. A
// carve-out case that comes back near zero means the directive leaked.
//
//   node eval/run.mjs            run every case
//   node eval/run.mjs skill-md   run one case
//
// Each case is a separate `claude -p` call, so this costs real usage. Nothing
// runs until you invoke it.

import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const CASES = JSON.parse(readFileSync(join(ROOT, "eval", "cases.json"), "utf8"))
const ARTICLE = /\b(the|a|an)\b/gi
const FLOOR = 4 // articles per 100 words that ordinary prose clears easily

/**
 * Articles per 100 words.
 *
 * Fenced code and YAML frontmatter are stripped first, so a code sample does
 * not drag the score down. But an answer that is ENTIRELY one fence (a commit
 * message, a function with its docstring) would strip to nothing, and that is
 * exactly the case worth grading: the docstring and the commit body are the
 * prose. So when stripping empties the text, grade the text itself with only
 * the fence markers removed.
 */
function articleDensity(text) {
  const fence = /^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm
  const wordsIn = t => t.trim().split(/\s+/).filter(Boolean).length

  // Prose OUTSIDE fences, which is the normal case.
  const outside = text.replace(fence, " ").replace(/^---\n[\s\S]*?^---[ \t]*$/m, " ")

  // Prose INSIDE fences. An answer whose whole body is one fenced document is
  // still prose worth grading: a SKILL.md, a commit message, a docstring. The
  // first bug here graded only the few words outside such a fence, which scored
  // a full normal-prose SKILL.md as 0.0 because the leftover was a status line.
  let inside = ""
  for (const m of text.matchAll(fence)) {
    inside += " " + m[0]
      .replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n/, " ")   // opening fence + language
      .replace(/^[ \t]*(`{3,}|~{3,})[ \t]*$/gm, " ")   // closing fence
      .replace(/^---\n[\s\S]*?^---[ \t]*$/m, " ")     // YAML frontmatter inside it
  }

  // Grade whichever body actually carries the answer. Comparing word counts,
  // rather than testing one against a fixed floor, is what makes this robust to
  // a short preamble sitting outside a long fenced document.
  const prose = wordsIn(inside) > wordsIn(outside) ? inside : outside
  const words = wordsIn(prose)
  if (!words) return null
  return ((prose.match(ARTICLE) || []).length / words) * 100
}


const only = process.argv[2]
const cases = only ? CASES.filter((c) => c.id === only) : CASES
if (!cases.length) { console.error(`no case named ${only}`); process.exit(2) }

const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")
const outDir = join(ROOT, "eval", "runs", stamp)
mkdirSync(outDir, { recursive: true })

const rows = []
for (const c of cases) {
  process.stderr.write(`running ${c.id}... `)
  let out = ""
  let failed = false
  try {
    out = execFileSync("claude", ["-p", c.prompt, "--max-turns", "2"], {
      encoding: "utf8", timeout: 300000,
    })
    failed = false
  } catch (err) {
    out = `RUN FAILED: ${err.message}`
    failed = true
  }
  writeFileSync(join(outDir, `${c.id}.txt`), out)
  const d = articleDensity(out)
  // A carve-out case must read as ordinary prose; the chat control must not.
  const verdict = failed ? "ERROR (not graded)"
    : d === null ? "NO OUTPUT"
    : c.carveOut ? (d >= FLOOR ? "PASS" : "LEAKED")
    : (d < FLOOR ? "PASS" : "DIRECTIVE NOT APPLIED")
  rows.push({ id: c.id, carveOut: c.carveOut, density: d, verdict, chars: out.length })
  process.stderr.write(`${verdict} (${d === null ? "-" : d.toFixed(1)}/100w)\n`)
}

console.log("\n| case | must be | articles/100w | chars | verdict |")
console.log("| :-- | :-- | --: | --: | :-- |")
for (const r of rows) {
  console.log(`| ${r.id} | ${r.carveOut ? "normal prose" : "caveman"} | ${r.density === null ? "-" : r.density.toFixed(1)} | ${r.chars} | ${r.verdict} |`)
}
writeFileSync(join(outDir, "results.json"), JSON.stringify(rows, null, 2))
console.log(`\noutputs: ${outDir}`)
