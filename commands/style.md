---
description: Turn the style directive off or on (this session, or globally)
allowed-tools: Bash(*/hooks/style-toggle.sh:*)
---

Run the toggle script with the user's argument, then report only the line it prints.
The script lives at `hooks/style-toggle.sh` in this repo.

Argument given: `$ARGUMENTS`

Map it:
- empty, or `status` -> `hooks/style-toggle.sh status`
- `off` -> `hooks/style-toggle.sh off`
- `on` -> `hooks/style-toggle.sh on`
- `off global` or `off --global` -> `hooks/style-toggle.sh off --global`
- `on global` or `on --global` -> `hooks/style-toggle.sh on --global`

An `off` takes effect on the next message, because the directive for the current
turn was injected before this command ran. Say so when turning it off.
