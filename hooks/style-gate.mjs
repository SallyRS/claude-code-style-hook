#!/usr/bin/env node
// style-gate — inject a writing-style directive into Claude Code, but only
// when a chosen model is answering.
//
// Why this exists: putting a style rule in CLAUDE.md applies it to every model
// and drifts out of attention on long turns. This injects the rule close to
// where the reply gets written, and only for the model you name.
//
// Configure in config.json next to this repo root:
//   { "model": "claude-opus-5", "directive": "directives/caveman.md" }
// `model` is matched as a PREFIX, so it covers dated and point variants.
//
// Register it on four events in settings.json. Each covers a path the others
// miss — see README.md. Every failure path exits 0: a broken style hook must
// never cost you a turn.

import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const DEDUP_MS = 2000 // two injections for one session inside this window: keep the first

function config() {
  try {
    return JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"))
  } catch {
    return { model: "claude-opus-5", directive: "directives/caveman.md" }
  }
}

/** Newest real assistant model id in the transcript, or null. */
function activeModel(transcriptPath) {
  try {
    if (!transcriptPath) return null
    const lines = readFileSync(transcriptPath, "utf8").trim().split("\n")
    for (let i = lines.length - 1; i >= 0; i--) {
      let obj
      try { obj = JSON.parse(lines[i]) } catch { continue }
      if (obj && obj.isSidechain) continue // a subagent runs its own model
      const m = (obj && obj.message && obj.message.model) || (obj && obj.model)
      if (m && m !== "<synthetic>") return m
    }
  } catch { /* fall through */ }
  return null
}

/** True if this session was injected under DEDUP_MS ago; stamps the clock otherwise. */
function recentlyInjected(sessionId) {
  if (!sessionId) return false
  const stamp = join(tmpdir(), `style-gate-${String(sessionId).replace(/[^\w.-]/g, "")}`)
  try {
    const now = Date.now()
    if (existsSync(stamp) && now - statSync(stamp).mtimeMs < DEDUP_MS) return true
    writeFileSync(stamp, "")
  } catch { /* a broken dedup must cost a duplicate, never a miss */ }
  return false
}

function offSwitchEngaged(sessionId) {
  const dir = join(ROOT, "state")
  if (existsSync(join(dir, "GLOBAL"))) return true
  if (sessionId && existsSync(join(dir, String(sessionId)))) return true
  return false
}

function emit(event, text) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: event, additionalContext: text },
  }))
  process.exit(0)
}

let raw = ""
for await (const chunk of process.stdin) raw += chunk

let payload
try { payload = JSON.parse(raw) } catch { process.exit(0) }

const { model: MODEL_PREFIX, directive } = config()

let DIRECTIVE
try {
  DIRECTIVE = readFileSync(join(ROOT, directive), "utf8").trim()
} catch {
  process.exit(0) // no directive file, nothing to say
}
if (!DIRECTIVE) process.exit(0)

const event = payload.hook_event_name || ""
if (offSwitchEngaged(payload.session_id)) process.exit(0)

const model = activeModel(payload.transcript_path)

if (event === "SessionStart") {
  // At startup the transcript holds no model id yet, so the model cannot be
  // read from disk. Inject with a self-gate line and let the model check its
  // own identity. A resumed session usually does carry one.
  if (model && !model.startsWith(MODEL_PREFIX)) process.exit(0)
  if (model) emit(event, DIRECTIVE)
  emit(event, `Applies only if your model is ${MODEL_PREFIX}. Any other model: ignore this block entirely.\n\n${DIRECTIVE}`)
}

if (event === "UserPromptSubmit" || event === "UserPromptExpansion" || event === "PostToolUse") {
  // agent_id is present only inside a subagent call. Tool events fire there
  // exactly as on the main thread, and a subagent doing drafting work must
  // never inherit a terse-chat style rule.
  if (payload.agent_id !== undefined) process.exit(0)
  if (event === "PostToolUse" && payload.tool_name !== "Skill") process.exit(0)
  if (!model) process.exit(0) // turn one; SessionStart already covered it
  if (!model.startsWith(MODEL_PREFIX)) process.exit(0)
  if (recentlyInjected(payload.session_id)) process.exit(0)
  emit(event, DIRECTIVE)
}

process.exit(0)
