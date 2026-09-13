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

# Images are served through Cloudflare's transformations rather than built into
# the deploy, so if that is switched off — or S3 drops off the source-origin
# allowlist — every image on the site 404s. Check one before shipping, because
# the failure is total and silent from the build's point of view.
# One sample per source host: the allowlist is per-origin, so S3 working tells
# you nothing about whether the YouTube thumbnails do.
#
# No mapfile here — macOS ships bash 3.2. Process substitution keeps the loop
# in this shell so `failed` survives it.
checked=0
failed=0
while IFS= read -r sample; do
  [[ -n "$sample" ]] || continue
  if (( checked == 0 )); then
    echo "==> Checking Cloudflare image transformations"
  fi
  checked=$((checked + 1))
  host=$(sed -E 's|.*/cdn-cgi/image/[^/]*/https?://([^/]+).*|\1|' <<<"$sample")
  # The first transformation of a large original is slow, and a cold origin
  # can rate-limit Cloudflare's fetch — both look like failure once and
  # succeed on a retry. Do not fail a deploy over that.
  for attempt in 1 2 3; do
    code=$(curl -s -o /dev/null -w '%{http_code}' -H 'Accept: image/avif,image/webp,image/*' --max-time 45 "$sample") || code=000
    [[ "$code" == "200" ]] && break
    (( attempt < 3 )) && sleep 4
  done
  if [[ "$code" == "200" ]]; then
    printf '    %-28s ok\n' "$host"
  else
    printf '    %-28s HTTP %s\n' "$host" "$code"
    failed=1
  fi
done < <(
  grep -rho 'https://aenism\.com/cdn-cgi/image/[^"]*' dist --include=index.html \
    | awk '{ if (match($0, /\/https?:\/\/[^\/]+/)) { h = substr($0, RSTART+1, RLENGTH-1); if (!(h in seen)) { seen[h]; print } } }'
)

if (( failed )); then
  echo
  echo "    Refusing to deploy — those images would 404 on the live site."
  echo "    Check in the Cloudflare dashboard:"
  echo "      · Images > Transformations is enabled for this zone"
  echo "      · every host listed above is on the source-origin allowlist"
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
#   export CLOUDFLARE_API_TOKEN=...    # scoped to "Cache Purge" on this zone only
#
# Make it an *account-owned* token — Manage Account > Account API Tokens, not
# My Profile > API Tokens. A user token acts on your behalf and stops working
# if you ever leave the account; an account-owned one is a service principal
# and outlives that, which is what a deploy script wants.
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
