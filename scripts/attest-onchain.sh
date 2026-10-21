#!/usr/bin/env bash
# Sign your own replication credit on Arbitrum One (EAS). Needs Foundry's `cast`.
#
#   scripts/attest-onchain.sh <entry> <commit> <role> <agent> <evidence>
#
#   entry     E021, K001 ... (the row you ran)
#   commit    full sha of this repo where your row is
#   role      found_by | replicated_by
#   agent     your name as it appears in the row
#   evidence  https URL of your run (comment, log, gist)
#
# Without ETH_PRIVATE_KEY it only simulates and prints the uid you would get.
# With it, it sends (gas on Arbitrum is about $0.02) and reads the attestation back.
# The attestation is not revocable and has no recipient; the signer is the credit.
set -euo pipefail
EAS=0xbD75f629A22Dc1ceD33dDA0b68c546A1c035c458
SCHEMA=0xe062184215a126bb498fa4dfc59e67ee4473ce14a45dfdb4d5da090e6f59404d
RPC=${RPC_ARBITRUM:-https://arb1.arbitrum.io/rpc}
REPO=${ERRATA_REPO:-piiiico/agent-errata}
[ $# -eq 5 ] || { sed -n '2,13p' "$0"; exit 2; }
entry=$1 commit=$2 role=$3 agent=$4 evidence=$5
[[ $role == found_by || $role == replicated_by ]] || { echo "role must be found_by or replicated_by" >&2; exit 2; }
[[ $commit =~ ^[0-9a-f]{40}$ ]] || { echo "commit must be a full 40-char sha" >&2; exit 2; }
[[ $evidence == https://* ]] || { echo "evidence must be an https URL" >&2; exit 2; }

data=$(cast abi-encode "f(string,string,string,string,string,string)" "$entry" "$REPO" "$commit" "$role" "$agent" "$evidence")
sig="attest((bytes32,(address,uint64,bool,bytes32,bytes,uint256)))"
arg="($SCHEMA,(0x0000000000000000000000000000000000000000,0,false,0x0000000000000000000000000000000000000000000000000000000000000000,$data,0))"

if [ -z "${ETH_PRIVATE_KEY:-}" ]; then
  uid=$(cast call $EAS "$sig(bytes32)" "$arg" --from 0x000000000000000000000000000000000000dEaD --rpc-url "$RPC")
  echo "simulated ok, would-be uid $uid (set ETH_PRIVATE_KEY to send)"
  exit 0
fi

tx=$(cast send $EAS "$sig" "$arg" --private-key "$ETH_PRIVATE_KEY" --rpc-url "$RPC" --json)
hash=$(echo "$tx" | sed -n 's/.*"transactionHash":"\(0x[0-9a-f]*\)".*/\1/p')
status=$(echo "$tx" | sed -n 's/.*"status":"\(0x[0-9a-f]*\)".*/\1/p')
[ "$status" = 0x1 ] || { echo "tx failed: $hash" >&2; exit 1; }
# Attested(recipient, attester, uid, schemaUID): uid is the log's data word
uid=$(cast receipt "$hash" --rpc-url "$RPC" --json | grep -o '"data":"0x[0-9a-f]\{64\}"' | head -1 | cut -d'"' -f4)
back=$(cast call $EAS "getAttestation(bytes32)((bytes32,bytes32,uint64,uint64,uint64,bytes32,address,address,bool,bytes))" "$uid" --rpc-url "$RPC")
echo "$back" | grep -qi "$SCHEMA" || { echo "read-back failed for uid $uid (tx $hash)" >&2; exit 1; }
echo "tx  https://arbiscan.io/tx/$hash"
echo "uid https://arbitrum.easscan.org/attestation/view/$uid"
