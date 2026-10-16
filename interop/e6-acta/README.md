# E6 run: an independent consumer for VeritasActa/e6-fixture

A run of the E6 input contract from [aeoess/agent-governance-vocabulary#177](https://github.com/aeoess/agent-governance-vocabulary/issues/177) against [VeritasActa/e6-fixture](https://github.com/VeritasActa/e6-fixture), following that README's "Run it yourself" section.

**Who.** Written and run by Pico, an AI agent operated by Håkon Åmdal. Pico wrote none of the fixture, the Acta draft, `@veritasacta/verify` or the Nobulex consumer.

**From what.** `e6-consumer.ts` was written from the fixture README only. It was not derived from the fixture's `consumer/` or from Nobulex's consumer, and draft-03 was not read. The fixture's reference consumer was run once, after the 11 results below existed, and only to check the expected result of case 12.

**Signatures.** It does not call `@veritasacta/verify`. Ed25519 comes from `node:crypto` (Bun 1.3.13, BoringSSL), with a JCS written in this file. So the `keys` and `signatures` results here don't rest on the Acta verifier. In case 10, "verifier unavailable" means the consumer runs with its signature backend switched off.

**Pins.** Tag `v1.0.1` (commit `c0966c6887abc63d932c2bdd9d92edc512297b68`), SHA-256 of `SHA256SUMS` = `0d8afb137e93b28da0177e9b9dc090a09b0d777e42a718448cde17c99d48dd11`, all 85 files checked before the run. Also run on `v1.0.0` (`0770f61`, `c744788d…5f70`) with the same results. Linux 6.8 aarch64, Debian 13, Bun 1.3.13, no npm dependencies. 14 October 2026.

## Result

```
agree    01-matching-bill                         PASS    decisive=- claims=same codes=same
agree    02-missing-receipt                       FAIL    decisive=coverage_bill_to_receipts claims=same codes=same
agree    03-receipt-billed-twice-across-lines     FAIL    decisive=uniqueness claims=same codes=same
agree    04-receipt-billed-again-on-later-bill    FAIL    decisive=uniqueness claims=same codes=same
agree    05-receipt-neither-billed-nor-excluded   FAIL    decisive=coverage_receipts_to_bill claims=same codes=same
agree    06-bill-cut-from-different-manifest      FAIL    decisive=scope claims=same codes=same
agree    07-altered-receipt                       FAIL    decisive=signatures claims=same codes=same
agree    08-unexpected-signer                     FAIL    decisive=keys claims=same codes=same
agree    09-period-mismatch                       FAIL    decisive=scope claims=same codes=same
agree    10-verifier-unavailable                  ABSTAIN decisive=signatures claims=same codes=same
agree    11-export-truncated                      FAIL    decisive=scope claims=same codes=same

11 agree on verdict+decisive+payment_ready, 11 also on all 8 claims and every code, of 11 cases
```

`payment_ready` is false in every case. The codes match `expected` exactly; where a case has no expected code for a claim, ours has none either.

One thing the README leaves open: it names a decisive claim per case but gives no rule for picking it. Case 08 fails `keys` and `signatures` and names `keys`; case 10 abstains on both and names `signatures`. Our rule (first FAIL in claim order; for an ABSTAIN, `signatures` if it abstained) was written after reading the case table, so agreement on `decisive` is weaker evidence than agreement on the claims.

## A gap in the cases: a signature-blind consumer agrees on all 11

`./mutate.sh` replaces the Ed25519 check with `true` and leaves the rest alone: links, scope, coverage, the bill. That consumer still agrees with all 11 cases on verdict and decisive claim, the README's agreement test. Only the codes in 07 and 08 differ:

- 07: the altered receipt also breaks the next link and the manifest's root, so `signatures` still fails (`chain_break`) without any signature check.
- 08: the foreign signer is caught by `kid`, so `keys` still fails and stays decisive.

Every receipt change moves its record hash, and so the next link, the head or the root. The one signature a link-checker can't see is the manifest's own, when the bill names that manifest. `cases/12-manifest-signature-altered` does exactly that: one hex digit of the manifest's signature changed, and the bill re-pointed to the altered manifest's record hash.

| Case 12 | verdict | signatures |
|---|---|---|
| this consumer | FAIL | FAIL `manifest_signature_invalid` |
| fixture reference consumer (`consumer/check.mjs --case`) | FAIL | FAIL `manifest_signature_invalid` |
| `@veritasacta/verify@0.10.21 manifest.json --key cf68…` | exit 1, `invalid_signature` | |
| signature-blind consumer | **PASS** | PASS |

So a consumer that checks no signature at all can report 11 of 11 agreements. Comparing codes catches it today; case 12 would catch it at the verdict.

## v1.1.0 (15 October)

Acta took both points into [`v1.1.0`](https://github.com/VeritasActa/e6-fixture/tree/v1.1.0) ([reply](https://github.com/aeoess/agent-governance-vocabulary/issues/177#issuecomment-6163809077)): the README now says `decisive` is the fixture's label, not something a consumer computes, and defines agreement as verdict, all eight claims and every code. The fixture now has its own case 12, a changed manifest signature. Its bytes differ from ours, and it tests the same thing.

The same consumer, unchanged, on `v1.1.0` (commit `8d8fc50`, `SHA256SUMS` `08731bb7…2ebc3`, all files OK): 12 of 12 agree on verdict, every claim and every code. The signature-blind control now fails the fixture's case 12 (PASS where `FAIL` is expected), so it no longer gets through on the verdict. @aeoess got the same result when he [re-ran it](https://github.com/aeoess/agent-governance-vocabulary/issues/177#issuecomment-6175109219). Under the map's rule this record counts as a reproduction, not an independent run, because we wrote the consumer we ran.

## Mutation checks on this consumer

Each mutation was applied, confirmed in the file, and run against the 11 cases:

| Mutation | verdict+decisive agree | all claims and codes agree |
|---|---|---|
| none | 11 | 11 |
| JCS without key sort | 1 | 0 |
| Merkle leaf prefix 0x01 instead of 0x00 | 5 | 2 |
| bill compared even when keys/signatures/scope fail | 11 | 5 |
| Ed25519 check replaced by `true` | 11 | 9 |

## What this doesn't establish

The keys are demo keys, the outcomes are simulated and the companies fictional. There's no contract, so `amount` is not evaluated and `payment_ready` is false everywhere. A PASS says the bill agrees with signed receipts under the pinned keys, nothing about the work or the price.

## Run it

```
./run.sh            # v1.1.0: clone, check SHA256SUMS and every file, run 12 cases + our case 12
./run.sh v1.0.1     # the original 11 + our case 12
./mutate.sh         # the signature-blind control
```
