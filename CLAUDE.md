Rules for edits

1. Make the smallest possible change per task.
2. No refactors, renames, or style changes unless explicitly requested.
3. Before editing, explain what files will be touched and why.
4. After editing, run: `npm run build` and report pass/fail.
5. Summarize changes and list files modified.
6. Inspect `package.json` and list exact commands for `dev`/`build`/`lint`/`test` that exist in the repo.

Notes
- Follow instructions exactly and avoid unrelated changes.
- If a `test` script is not present in `package.json`, explicitly state that it does not exist.
