#!/usr/bin/env bash
# Keeps the drafts of the view writer on their own git branch called "drafts", so the main branch (and the site deploy) is never touched.
#
#   bash scripts/view-branch.sh load    before the writer: get the earlier state (drafts/views-state.json) from the branch
#   bash scripts/view-branch.sh save    after the writer: put the new draft on the branch as views/<slug>/ and push it; always saves the state
#
# Used by the "View writer" workflow on GitHub. Every run is one commit, so the branch history is an archive of all drafts.
# The branch "drafts" first held a whole copy of the site (the first batch of views, already merged into main). The first save
# on top of it removes those old files with an ordinary commit (nothing is deleted from history), and from then on the branch
# holds only views-state.json and views/<slug>/.
# Environment: VIEW_BRANCH (default "drafts"), VIEW_REMOTE (default "origin").
set -euo pipefail

BRANCH="${VIEW_BRANCH:-drafts}"
REMOTE="${VIEW_REMOTE:-origin}"
cd "$(git rev-parse --show-toplevel)"

load() {
  mkdir -p drafts
  if git fetch --quiet "$REMOTE" "$BRANCH" 2>/dev/null && git cat-file -e FETCH_HEAD:views-state.json 2>/dev/null; then
    git show FETCH_HEAD:views-state.json > drafts/views-state.json
    echo "Loaded the earlier state from the $BRANCH branch."
  else
    echo "No earlier view drafts yet (first run)."
  fi
}

save() {
  if [ ! -f drafts/views-run.json ] || [ ! -f drafts/views-state.json ]; then
    echo "No drafts/views-run.json or drafts/views-state.json: nothing to save." >&2
    exit 1
  fi
  local slug outcome
  slug="$(node -p "require('./drafts/views-run.json').slug || ''")"
  outcome="$(node -p "require('./drafts/views-run.json').outcome || ''")"
  git branch -D "$BRANCH" >/dev/null 2>&1 || true # a local copy from an earlier step must not get in the way
  WT="$(mktemp -d)"
  trap 'git worktree remove --force "$WT" >/dev/null 2>&1 || true' EXIT
  if git ls-remote --exit-code --heads "$REMOTE" "$BRANCH" >/dev/null 2>&1; then
    git fetch --quiet "$REMOTE" "$BRANCH"
    git worktree add --quiet -B "$BRANCH" "$WT" FETCH_HEAD
    if ! git -C "$WT" cat-file -e HEAD:views-state.json 2>/dev/null; then
      # the old branch with a copy of the site: empty it with a normal commit
      git -C "$WT" rm -rfq .
      git -C "$WT" -c user.name="hotelsviewer-bot" -c user.email="bot@hotelsviewer.com" commit --quiet --allow-empty -m "Clear the old copy of the site: this branch now holds only view drafts"
    fi
  else
    # first run: a new branch with no history and none of the site files
    git worktree add --quiet --detach "$WT" HEAD
    git -C "$WT" checkout --quiet --orphan "$BRANCH"
    git -C "$WT" rm -rfq .
  fi
  if [ "$outcome" = "drafted" ] && [ -n "$slug" ] && [ -d "drafts/views/$slug" ]; then
    mkdir -p "$WT/views/$slug"
    for f in view.json evidence.json notes.md; do
      cp "drafts/views/$slug/$f" "$WT/views/$slug/$f"
    done
  fi
  # a short record of what the run opened and searched (the run log of GitHub is not reachable from the chat)
  if [ -f drafts/views-trace.json ] && [ -n "$slug" ]; then
    mkdir -p "$WT/traces"
    cp drafts/views-trace.json "$WT/traces/$(node -p "require('./drafts/views-run.json').date")-$slug.json"
  fi
  cp drafts/views-state.json "$WT/views-state.json"
  git -C "$WT" add -A
  if git -C "$WT" diff --cached --quiet; then
    echo "Nothing changed, nothing to save."
    return
  fi
  git -C "$WT" -c user.name="hotelsviewer-bot" -c user.email="bot@hotelsviewer.com" commit --quiet -m "View writer: $slug ($outcome)"
  git -C "$WT" push --quiet "$REMOTE" "$BRANCH"
  echo "Saved to the $BRANCH branch ($outcome: $slug)."
}

case "${1:-}" in
  load) load ;;
  save) save ;;
  *) echo "Usage: bash scripts/view-branch.sh load|save" >&2; exit 2 ;;
esac
