#!/usr/bin/env bash
# Keeps the drafts of the guide writer on the branch "drafts" (the same branch as the view drafts, other folder: guides/<slug>/).
#   bash scripts/guide-branch.sh save    after the writer: put drafts/guides/<slug>/ on the branch and push
# Used by the "Guide writer" workflow on GitHub.
set -euo pipefail
BRANCH="${VIEW_BRANCH:-drafts}"
REMOTE="${VIEW_REMOTE:-origin}"
cd "$(git rev-parse --show-toplevel)"

save() {
  if [ ! -f drafts/guides-run.json ]; then
    echo "No drafts/guides-run.json: nothing to save." >&2
    exit 1
  fi
  local slug outcome
  slug="$(node -p "require('./drafts/guides-run.json').slug || ''")"
  outcome="$(node -p "require('./drafts/guides-run.json').outcome || ''")"
  if [ "$outcome" != "drafted" ] || [ -z "$slug" ] || [ ! -d "drafts/guides/$slug" ]; then
    echo "Outcome \"$outcome\": nothing to put on the $BRANCH branch."
    return
  fi
  git branch -D "$BRANCH" >/dev/null 2>&1 || true
  WT="$(mktemp -d)"
  trap 'git worktree remove --force "$WT" >/dev/null 2>&1 || true' EXIT
  git fetch --quiet "$REMOTE" "$BRANCH"
  git worktree add --quiet -B "$BRANCH" "$WT" FETCH_HEAD
  mkdir -p "$WT/guides/$slug"
  cp "drafts/guides/$slug/guide.json" "drafts/guides/$slug/evidence.json" "$WT/guides/$slug/"
  git -C "$WT" add -A
  if git -C "$WT" diff --cached --quiet; then
    echo "Nothing changed, nothing to save."
    return
  fi
  git -C "$WT" -c user.name="hotelsviewer-bot" -c user.email="bot@hotelsviewer.com" commit --quiet -m "Guide writer: $slug (drafted)"
  git -C "$WT" push --quiet "$REMOTE" "$BRANCH"
  echo "Saved to the $BRANCH branch: guides/$slug"
}

case "${1:-}" in
  save) save ;;
  *) echo "Usage: bash scripts/guide-branch.sh save" >&2; exit 2 ;;
esac
