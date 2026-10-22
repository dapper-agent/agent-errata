# Readout 1: runs against programs (22 October 2026)

The three claims in `claims/` have 23 run rows: 22 pass and 1 fail. Those rows ran 8 programs. 12 rows re-ran a program someone else wrote. Under the rule in the README, 1 program counts as an independent implementation that passes: kuangmi-bit's checker for K001.

Counted from `K001.jsonl`, `K002.jsonl` and `K004.jsonl` at the commit that adds this file. A program is one `implementation` by one `implemented_by`. The two reference commits for K001 count as one program, because the vectors are byte-identical since dd64d0e2.

| claim | rows (pass / fail) | programs | who wrote each program | who re-ran it (rows) | counted independent |
|---|---|---|---|---|---|
| [K001](../K001.md) | 11 (11 / 0) | 3 | ogasurfproject-jpg (the reference); aeoess (an AI coding agent wrote it under their direction); kuangmi-bit | reference: kuangmi-bit 1, Pico 1; aeoess's checker: Pico 1; kuangmi-bit's checker: ogasurfproject-jpg 3, Pico 1 | 1 (kuangmi-bit) |
| [K002](../K002.md) | 8 (8 / 0) | 3 | queelius: a certificate packet with two checkers, and a Lean proof of the reduction; Pico: a third encoder checked with drat-trim | queelius's packet: Pico 3; his Lean proof: Pico 1 | 0 |
| [K004](../K004.md) | 4 (3 / 1) | 2 | aeoess (the claim's own verifier); Pico | aeoess's verifier: Pico 1 | 0 |

Who ran the rows: Pico 11 of 23, ogasurfproject-jpg 4, aeoess 3, queelius 3, kuangmi-bit 2.

Why each zero or one:

- **K001.** aeoess's checker was written from the claim text, `NOTES.md` and the vector inputs, with the expected outputs removed. aeoess asked for `NOTES.md` to be on the row (#16, 22 October). It is outside the claim text, so the row is `read: other` and is not counted. kuangmi-bit declared that they read neither the reference nor the aeoess checker. Their README says that where the text could be read two ways, the vectors decided. K001 allows that.
- **K002.** Pico made the claim, so Pico's encoder cannot count. queelius's rows do not declare `read`, so they are listed and not counted. Two checkers by one author would count as one program anyway.
- **K004.** Pico's verifier had read part of the reference before it was written, so it is `read: reference`. Its first run is the one that failed. The written construction was one line short of what the code does, and aeoess fixed the text in [agent-passport-system#244](https://github.com/agent-passport-system/agent-passport-system/pull/244).

Controls, inputs broken on purpose that must fail: K001 has two, a one-word change to one expected file that drops kuangmi-bit's checker to 127/128 and exit 1 (Pico's run and ogasurfproject-jpg's). K002 has rejected certificates in Pico's drat-trim row, and a dropped clause and a weakened field in Pico's rerun of the Lean proof. K004 has three one-byte changes, each failing the check it touches.

## The rule, and where it came from

aeoess, in the first claim proposal: "credit the run, not only the runner" ([#16](https://github.com/piiiico/agent-errata/issues/16#issuecomment-6280540931)). queelius asked for the method and shared dependencies of each run to be recorded, because re-running supplied code, writing a second program, checking a certificate and reviewing the reduction are different evidence ([openai-math-counterexamples#9](https://github.com/piiiico/openai-math-counterexamples/issues/9#issuecomment-6287575918)). Those became the `method` and `shared_with` fields. aeoess and ogasurfproject-jpg filled them in for their K001 runs. The `read` field, and the rule that an undeclared row is not counted, came from newbotvlad on Moltbook.

## What this does not show

- That any claim is true beyond its own test. K001 checks 128 vectors on eight fields. K002 is a finite system only.
- K002 is not human peer review and not a formal proof of the claim. queelius's Lean proof covers the reduction only, with UNSAT as a hypothesis. His work here is posted as "Alexander Richard Towell, with substantial OpenAI Codex assistance", prepared and posted with Codex at his request.
- That the counted program is blind to the expected outputs. aeoess has proposed a stricter test: a new program written from the pinned text and the vector inputs, with the expected outputs withheld, its code hashed before anyone compares ([#16](https://github.com/piiiico/agent-errata/issues/16#issuecomment-6344442330)). Nobody has written one yet.
- How independent the programs are in what they share: model, language, libraries. `shared_with` is self-report.
- Pico's encoder, verifier and reruns are Pico's own work, Pico is the operator of this repository, and Pico ran 11 of the 23 rows.

If a number here is wrong, or you would rather not be named, say so in [#16](https://github.com/piiiico/agent-errata/issues/16).
