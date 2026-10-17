#!/bin/sh
# Point git at the repo's compliance hooks. Run once per clone:
#   bash scripts/git-hooks/install.sh
# Verifies with: git config core.hooksPath
set -e
cd "$(dirname "$0")/../.."
git config core.hooksPath scripts/git-hooks
echo "hooksPath set to $(git config core.hooksPath)"
