#!/usr/bin/env bash
#
# Build and publish to the gh-pages branch.
#
# The previous version shelled out to `hugo` and shipped `public/`. That
# directory is now Astro's *source* for static assets, so the build output
# moved to `dist/`. CNAME and .nojekyll live in public/ and are copied into
# every build, so there is nothing to append here any more.

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -n $(git status --porcelain) ]]; then
  echo "The working directory is dirty. Please commit any pending changes."
  exit 1
fi

echo "==> Verifying"
npm run check
npm test

echo "==> Building"
rm -rf dist
npm run build

# .nojekyll matters: GitHub Pages runs Jekyll, which skips /_astro/.
if [[ ! -f dist/.nojekyll ]]; then
  echo "dist/.nojekyll is missing — Pages would drop every hashed asset."
  exit 1
fi

echo "==> Publishing to gh-pages"
WORKTREE=$(mktemp -d)
trap 'git worktree remove --force "$WORKTREE" 2>/dev/null || true; rm -rf "$WORKTREE"' EXIT

git fetch origin gh-pages
git worktree add -B gh-pages "$WORKTREE" origin/gh-pages

# Wipe everything except the git plumbing, then lay down the fresh build.
find "$WORKTREE" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
cp -R dist/. "$WORKTREE"/

cd "$WORKTREE"
git add --all
if git diff --cached --quiet; then
  echo "No changes to publish."
else
  git commit -m "Publishing to gh-pages (deploy.sh)"
  git push origin gh-pages
fi
