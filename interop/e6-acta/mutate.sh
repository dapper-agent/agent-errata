#!/bin/sh
# The signature-blind control: the same consumer with Ed25519 verification replaced by `true`.
# It still checks chain links, scope and the bill. Run ./run.sh first.
set -eu
cd "$(dirname "$0")"
sed 's/return edVerify(null/return true || edVerify(null/' e6-consumer.ts > blind.ts
grep -q 'return true || edVerify' blind.ts || { echo "mutation not applied"; exit 2; }
echo "== signature-blind consumer, fixture cases"; bun blind.ts e6-fixture || true
echo "== signature-blind consumer, case 12"; bun blind.ts . || true
rm blind.ts
