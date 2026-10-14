#!/bin/sh
# Fresh run: fetch the fixture at a tag, check every file against SHA256SUMS and the
# published digest of SHA256SUMS, then run the 11 fixture cases and the extra case 12.
set -eu
TAG="${1:-v1.0.1}"
case "$TAG" in
  v1.0.1) WANT=0d8afb137e93b28da0177e9b9dc090a09b0d777e42a718448cde17c99d48dd11 ;;
  v1.0.0) WANT=c744788dfb4c193d4cb97b3f31592c43a8384931eb2f62c1eafef03d28465f70 ;;
  *) echo "unknown tag $TAG"; exit 2 ;;
esac
cd "$(dirname "$0")"
rm -rf e6-fixture
git -c advice.detachedHead=false clone -q --depth 1 --branch "$TAG" https://github.com/VeritasActa/e6-fixture
GOT=$(sha256sum e6-fixture/SHA256SUMS | cut -d' ' -f1)
[ "$GOT" = "$WANT" ] || { echo "SHA256SUMS digest $GOT, expected $WANT"; exit 1; }
(cd e6-fixture && sha256sum -c --quiet SHA256SUMS) && echo "$TAG: SHA256SUMS $GOT, every file OK"
bun e6-consumer.ts e6-fixture
bun e6-consumer.ts . 
