#!/usr/bin/env node
// Interference eval: does the directive survive a skill loading mid-turn?
//
// This is the case that separates the approaches. Every mechanism holds register
// fine on a plain question; the question is what happens when a SKILL.md body
// lands between the directive and the reply.
//
// The prompt loads `find-skills`, chosen deliberately: read-only, no scripts, no
// MCP. An earlier version used `ai-writing-guard`, which was wrong twice over —
// it routes through a paid MCP service, and it REWRITES prose, so it confounded
// the very thing being measured. Swapping it changed the result: arms that had
// looked tied separated cleanly.
//
// Set up the arm you want first (toggle the hook, set outputStyle, pass
// --plugin-dir), then:
//
//   node eval/interference.mjs <arm-name> [runs] [-- extra claude args]
//
// Each run is one `claude -p` call. Nothing runs until you invoke it.

import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const PROMPT = readFileSync(join(ROOT, "eval", "interference-prompt.txt"), "utf8").trim()

const argv = process.argv.slice(2)
const sep = argv.indexOf("--")
const extra = sep === -1 ? [] : argv.slice(sep + 1)
const [arm = "unnamed", runsArg = "6"] = sep === -1 ? argv : argv.slice(0, sep)
const runs = Number(runsArg)

const out = join(ROOT, "eval", "runs", `i3-${arm}`)
mkdirSync(out, { recursive: true })

const ARTICLE = /\b(the|a|an)\b/gi
const measure = (t) => {
  const s = t.replace(/```[\s\S]*?```/g, " ")
  const w = s.trim().split(/\s+/).filter(Boolean).length
  return { words: w, articles: w ? ((s.match(ARTICLE) || []).length / w) * 100 : 0 }
}

const rows = []
for (let n = 1; n <= runs; n++) {
  process.stderr.write(`${arm} run ${n}... `)
  try {
    const t = execFileSync("claude", ["-p", PROMPT, "--max-turns", "8", ...extra], {
      encoding: "utf8", timeout: 600000,
    })
    writeFileSync(join(out, `run-${n}.txt`), t)
    const m = measure(t)
    rows.push(m)
    process.stderr.write(`${m.words}w ${m.articles.toFixed(1)}a\n`)
  } catch {
    process.stderr.write("ERR\n")
  }
  if (n < runs) execFileSync("sleep", ["8"])
}

if (rows.length) {
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
  const w = rows.map((r) => r.words)
  console.log(`\n${arm}: n=${rows.length}  mean ${mean(w).toFixed(0)}w  range ${Math.min(...w)}-${Math.max(...w)}  articles ${mean(rows.map(r => r.articles)).toFixed(1)}/100w`)
  console.log(`outputs: ${out}`)
}
