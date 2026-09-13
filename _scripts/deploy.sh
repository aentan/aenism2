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
  exit 0
fi

git commit -m "Publishing to gh-pages (deploy.sh)"
git push origin gh-pages

# ── invalidate the edge ───────────────────────────────────────────────────
#
# Cloudflare sits in front of Pages and now caches HTML, so a fresh deploy
# would otherwise sit behind a stale copy until the edge TTL expired. Purge
# after a successful push.
#
# Credentials come from the environment and are never stored in the repo. Set
# them in your shell profile:
#
#   export CLOUDFLARE_ZONE_ID=...      # Cloudflare dashboard, zone Overview
#   export CLOUDFLARE_API_TOKEN=...    # a token with the "Cache Purge" permission
#
# Without them the deploy still succeeds; the edge just clears on its own TTL.
if [[ -n "${CLOUDFLARE_ZONE_ID:-}" && -n "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "==> Purging the Cloudflare cache"
  response=$(curl -fsS -X POST \
    "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data '{"purge_everything":true}' 2>&1) || {
      echo "    purge failed — the deploy is live, but the edge will serve the"
      echo "    previous copy until its TTL expires. Response: $response"
      exit 0
    }
  if grep -q '"success":true' <<<"$response"; then
    echo "    purged"
  else
    echo "    purge rejected: $response"
  fi
else
  echo "==> Skipping cache purge (CLOUDFLARE_ZONE_ID / CLOUDFLARE_API_TOKEN not set)"
  echo "    The deploy is live; the edge will pick it up on its own TTL."
fi
