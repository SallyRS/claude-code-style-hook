#!/usr/bin/env node
// Length eval: does the directive's word cap actually hold?
// Chat-shaped questions only, so every answer is a plain reply with no artifact
// to excuse the length. Run both arms to see what the cap is worth.
//
//   node eval/length.mjs on     # hook registered
//   node eval/length.mjs off    # toggle it off first yourself
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const CASES = JSON.parse(readFileSync(join(ROOT, "eval", "length-cases.json"), "utf8"))
const CAP = 120
const arm = process.argv[2] || "on"
const out = join(ROOT, "eval", "runs", `length-${arm}`)
mkdirSync(out, { recursive: true })
const words = t => t.replace(/```[\s\S]*?```/g, " ").trim().split(/\s+/).filter(Boolean).length
const rows = []
for (const c of CASES) {
  process.stderr.write(`${c.id}... `)
  let t = "", ok = true
  try { t = execFileSync("claude", ["-p", c.prompt, "--max-turns", "2"], { encoding: "utf8", timeout: 300000 }) }
  catch { ok = false }
  if (!ok) { process.stderr.write("ERR\n"); rows.push({ id: c.id, w: null }); continue }
  writeFileSync(join(out, `${c.id}.txt`), t)
  const w = words(t)
  rows.push({ id: c.id, w })
  process.stderr.write(`${w}w ${w <= CAP ? "under" : "OVER"}\n`)
}
const got = rows.filter(r => r.w !== null)
console.log(`\n| case | words | vs ${CAP} cap |`)
console.log("| :-- | --: | :-- |")
for (const r of rows) console.log(`| ${r.id} | ${r.w ?? "ERR"} | ${r.w === null ? "-" : r.w <= CAP ? "under" : `OVER by ${r.w - CAP}`} |`)
if (got.length) {
  const ws = got.map(r => r.w).sort((a, b) => a - b)
  const med = ws[Math.floor(ws.length / 2)]
  console.log(`\nn=${got.length}  median ${med}w  max ${ws.at(-1)}w  over cap ${got.filter(r => r.w > CAP).length}/${got.length}`)
}
