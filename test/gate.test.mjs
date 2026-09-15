// Tests for hooks/style-gate.mjs. Run: node --test test/gate.test.mjs
//
// Each case feeds the hook a real event payload on stdin and asserts whether it
// injected. These are the guards worth trusting: the model gate, the four event
// paths, the subagent guard, the dedup window and the off switch.

import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, unlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const GATE = join(ROOT, "hooks", "style-gate.mjs")
const FIX = join(ROOT, "test", ".fixtures")

const T = {
  opus:   join(FIX, "opus.jsonl"),
  sonnet: join(FIX, "sonnet.jsonl"),
  empty:  join(FIX, "empty.jsonl"),
  side:   join(FIX, "side.jsonl"),
}

before(() => {
  mkdirSync(FIX, { recursive: true })
  writeFileSync(T.opus,   JSON.stringify({ type: "assistant", message: { role: "assistant", model: "claude-opus-5" } }) + "\n")
  writeFileSync(T.sonnet, JSON.stringify({ type: "assistant", message: { role: "assistant", model: "claude-sonnet-5" } }) + "\n")
  writeFileSync(T.empty, "")
  writeFileSync(T.side,
    JSON.stringify({ type: "assistant", message: { role: "assistant", model: "claude-opus-5" } }) + "\n" +
    JSON.stringify({ type: "assistant", isSidechain: true, message: { role: "assistant", model: "claude-haiku-4-5-20251001" } }) + "\n")
})

after(() => {
  rmSync(FIX, { recursive: true, force: true })
  rmSync(join(ROOT, "state"), { recursive: true, force: true })
  for (const f of readdirSync(tmpdir()).filter((n) => n.startsWith("style-gate-"))) {
    try { unlinkSync(join(tmpdir(), f)) } catch {}
  }
})

let n = 0
/** Run the gate on one payload; true when it injected. */
function fires(payload) {
  const out = execFileSync("node", [GATE], {
    input: JSON.stringify({ session_id: `t${n++}`, ...payload }),
    encoding: "utf8",
  })
  return out.trim().length > 0
}

// --- model gate ----------------------------------------------------------

test("injects for the configured model", () => {
  assert.ok(fires({ hook_event_name: "UserPromptSubmit", transcript_path: T.opus }))
})

test("silent for any other model", () => {
  assert.equal(fires({ hook_event_name: "UserPromptSubmit", transcript_path: T.sonnet }), false)
})

test("a subagent's own model in the transcript does not mask the main model", () => {
  assert.ok(fires({ hook_event_name: "UserPromptSubmit", transcript_path: T.side }))
})

// --- the four event paths ------------------------------------------------

test("SessionStart injects even with an empty transcript (self-gated)", () => {
  const out = execFileSync("node", [GATE], {
    input: JSON.stringify({ session_id: "ss", hook_event_name: "SessionStart", transcript_path: T.empty }),
    encoding: "utf8",
  })
  assert.match(JSON.parse(out).hookSpecificOutput.additionalContext, /^Applies only if your model is/)
})

test("SessionStart on a resumed session drops the self-gate line", () => {
  const out = execFileSync("node", [GATE], {
    input: JSON.stringify({ session_id: "ss2", hook_event_name: "SessionStart", transcript_path: T.opus }),
    encoding: "utf8",
  })
  assert.doesNotMatch(JSON.parse(out).hookSpecificOutput.additionalContext, /^Applies only if your model is/)
})

test("UserPromptExpansion fires, covering a typed /skillname", () => {
  assert.ok(fires({ hook_event_name: "UserPromptExpansion", transcript_path: T.opus }))
})

test("PostToolUse fires for the Skill tool and no other tool", () => {
  assert.ok(fires({ hook_event_name: "PostToolUse", tool_name: "Skill", transcript_path: T.opus }))
  assert.equal(fires({ hook_event_name: "PostToolUse", tool_name: "Bash", transcript_path: T.opus }), false)
  assert.equal(fires({ hook_event_name: "PostToolUse", tool_name: "Edit", transcript_path: T.opus }), false)
})

test("turn one with no assistant message yet stays silent", () => {
  assert.equal(fires({ hook_event_name: "UserPromptSubmit", transcript_path: T.empty }), false)
})

// --- subagent guard ------------------------------------------------------

test("never fires inside a subagent call", () => {
  for (const ev of ["UserPromptSubmit", "UserPromptExpansion"]) {
    assert.equal(fires({ hook_event_name: ev, agent_id: "agent-1", transcript_path: T.opus }), false, ev)
  }
  assert.equal(
    fires({ hook_event_name: "PostToolUse", tool_name: "Skill", agent_id: "agent-1", transcript_path: T.opus }),
    false,
  )
})

// --- dedup ---------------------------------------------------------------

test("one typed slash command is not charged twice", () => {
  const p = { session_id: "dedup", transcript_path: T.opus }
  const run = (ev) => execFileSync("node", [GATE], {
    input: JSON.stringify({ ...p, hook_event_name: ev }), encoding: "utf8",
  }).trim().length > 0
  assert.ok(run("UserPromptSubmit"), "first injection should land")
  assert.equal(run("UserPromptExpansion"), false, "second inside the window should be dropped")
})

// --- off switch and robustness -------------------------------------------

test("the global off switch silences every event", () => {
  mkdirSync(join(ROOT, "state"), { recursive: true })
  writeFileSync(join(ROOT, "state", "GLOBAL"), "")
  try {
    assert.equal(fires({ hook_event_name: "UserPromptSubmit", transcript_path: T.opus }), false)
    assert.equal(fires({ hook_event_name: "SessionStart", transcript_path: T.opus }), false)
  } finally {
    rmSync(join(ROOT, "state", "GLOBAL"), { force: true })
  }
})

test("a per-session off switch does not silence other sessions", () => {
  mkdirSync(join(ROOT, "state"), { recursive: true })
  writeFileSync(join(ROOT, "state", "hushed"), "")
  try {
    const one = execFileSync("node", [GATE], {
      input: JSON.stringify({ session_id: "hushed", hook_event_name: "UserPromptSubmit", transcript_path: T.opus }),
      encoding: "utf8",
    })
    assert.equal(one.trim().length, 0)
    assert.ok(fires({ hook_event_name: "UserPromptSubmit", transcript_path: T.opus }))
  } finally {
    rmSync(join(ROOT, "state", "hushed"), { force: true })
  }
})

test("malformed stdin exits quietly instead of breaking the turn", () => {
  const out = execFileSync("node", [GATE], { input: "not json", encoding: "utf8" })
  assert.equal(out.trim().length, 0)
})

test("a missing transcript file is survivable", () => {
  assert.equal(fires({ hook_event_name: "UserPromptSubmit", transcript_path: "/no/such/file.jsonl" }), false)
})
