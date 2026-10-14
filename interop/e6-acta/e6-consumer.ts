// Independent E6 consumer, written from the VeritasActa/e6-fixture v1.0.1 README only.
// Not derived from consumer/ in that repo, nor from Nobulex's consumer.
// Signatures are checked with node:crypto Ed25519 and a JCS implemented here;
// it does NOT call @veritasacta/verify. Author/runner: Pico (AI agent, piiiico).
import { createHash, createPublicKey, verify as edVerify } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type R = "PASS" | "FAIL" | "ABSTAIN" | "NOT_EVALUATED";
const CLAIMS = ["keys", "signatures", "scope", "coverage_bill_to_receipts", "coverage_receipts_to_bill", "uniqueness", "quantities", "amount"] as const;
type Claim = (typeof CLAIMS)[number];

// RFC 8785 JCS: keys sorted by UTF-16 code units; numbers/strings via ECMAScript serialization.
export function jcs(v: unknown): string {
  if (v === null || typeof v === "boolean") return JSON.stringify(v);
  if (typeof v === "number") { if (!Number.isFinite(v)) throw new Error("non-finite"); return JSON.stringify(v); }
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(jcs).join(",") + "]";
  const o = v as Record<string, unknown>;
  return "{" + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + jcs(o[k])).join(",") + "}";
}
const sha = (b: Buffer | string) => createHash("sha256").update(b).digest();
const recordId = (env: any) => "sha256:" + sha(Buffer.from(jcs(env), "utf8")).toString("hex");
const fingerprint = (pubHex: string) => "sha256:" + sha(Buffer.from(pubHex, "hex")).toString("hex");

function edOk(pubHex: string, env: any): boolean {
  try {
    const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(pubHex, "hex").toString("base64url") }, format: "jwk" });
    if (env?.signature?.alg !== "EdDSA") return false;
    return edVerify(null, Buffer.from(jcs(env.payload), "utf8"), key, Buffer.from(env.signature.sig, "hex"));
  } catch { return false; }
}

// RFC 6962 Merkle tree hash over 32-byte receipt IDs.
function mth(leaves: Buffer[]): Buffer {
  if (leaves.length === 0) return sha(Buffer.alloc(0));
  if (leaves.length === 1) return sha(Buffer.concat([Buffer.from([0]), leaves[0]]));
  let k = 1; while (k * 2 < leaves.length) k *= 2;
  return sha(Buffer.concat([Buffer.from([1]), mth(leaves.slice(0, k)), mth(leaves.slice(k))]));
}

export interface Inputs { receipts: string; manifest: string; bill: string; keys: string; root_fingerprint: string; earlier_bills: string[]; verifierAvailable: boolean }

export function check(inp: Inputs) {
  const receipts = inp.receipts.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const manifest = JSON.parse(inp.manifest);
  const bill = JSON.parse(inp.bill);
  const keysDoc = JSON.parse(inp.keys);
  const earlier = inp.earlier_bills.map((b) => JSON.parse(b));
  const claims = Object.fromEntries(CLAIMS.map((c) => [c, "NOT_EVALUATED"])) as Record<Claim, R>;
  const codes: Partial<Record<Claim, string[]>> = {};
  const add = (c: Claim, code: string) => { (codes[c] ??= []).includes(code) || codes[c]!.push(code); };
  const meter = (keysDoc.keys ?? []).find((k: any) => k.role === "meter");
  const ids = receipts.map(recordId);
  const records = [...receipts, manifest];

  // keys
  if (!inp.verifierAvailable) { claims.keys = "ABSTAIN"; add("keys", "verifier_unavailable"); }
  else {
    const root = keysDoc.root;
    if (!root || root.fingerprint !== inp.root_fingerprint || fingerprint(root.public_key_hex) !== inp.root_fingerprint) add("keys", "root_fingerprint_mismatch");
    if (!meter) add("keys", "no_meter_key");
    else {
      if (fingerprint(meter.public_key_hex) !== meter.fingerprint || Buffer.from(meter.x ?? "", "base64url").toString("hex") !== meter.public_key_hex) add("keys", "key_material_mismatch");
      const cert = meter.certificate, s = cert?.payload?.subject;
      if (!cert || cert.signature?.kid !== root?.kid || !edOk(root.public_key_hex, cert)) add("keys", "certificate_invalid");
      if (!s || s.kid !== meter.kid || s.public_key_hex !== meter.public_key_hex || s.fingerprint !== meter.fingerprint || s.valid_from !== meter.valid_from || s.valid_until !== meter.valid_until) add("keys", "certificate_subject_mismatch");
      for (const r of records) {
        if (r.signature?.kid !== meter.kid || r.payload?.issuer_id !== meter.kid) add("keys", "unexpected_signer");
        const t = Date.parse(r.payload?.issued_at);
        if (!(t >= Date.parse(meter.valid_from)) || (meter.valid_until != null && !(t < Date.parse(meter.valid_until)))) add("keys", "outside_key_window");
      }
    }
    claims.keys = codes.keys ? "FAIL" : "PASS";
  }

  // signatures (under the pinned meter key only; never keys from the bundle)
  if (!inp.verifierAvailable) { claims.signatures = "ABSTAIN"; add("signatures", "verifier_unavailable"); }
  else if (!meter) { claims.signatures = "FAIL"; add("signatures", "no_pinned_key"); }
  else {
    receipts.forEach((r, i) => {
      if (!edOk(meter.public_key_hex, r)) add("signatures", "invalid_signature");
      if (i > 0) {
        const link = r.payload?.previousReceiptHash;
        if (link == null) add("signatures", "missing_link");
        else if (link !== ids[i - 1]) add("signatures", "chain_break");
      }
    });
    if (!edOk(meter.public_key_hex, manifest)) add("signatures", "manifest_signature_invalid");
    claims.signatures = codes.signatures ? "FAIL" : "PASS";
  }

  // scope (structural; needs no signature backend)
  const mp = manifest.payload ?? {}, range = mp.range ?? {};
  if (bill.period !== mp.period?.id) add("scope", "period_mismatch");
  if (bill.manifest !== recordId(manifest)) add("scope", "manifest_mismatch");
  if (receipts.length !== (range.outcome_receipts ?? NaN) + (range.correction_receipts ?? NaN)) add("scope", "count_mismatch");
  const seqs = receipts.map((r) => r.payload?.sequence);
  const want = Array.from({ length: Math.max(0, range.last_sequence - range.first_sequence + 1) }, (_, i) => range.first_sequence + i);
  if (seqs.length !== want.length || seqs.some((s, i) => s !== want[i])) add("scope", "sequence_mismatch");
  if (ids[ids.length - 1] !== range.head || mp.previousReceiptHash !== range.head) add("scope", "head_mismatch");
  const root = "sha256:" + mth(ids.map((id) => Buffer.from(id.slice(7), "hex"))).toString("hex");
  if (root !== range.root) add("scope", "root_mismatch");
  if (receipts.some((r) => r.payload?.period !== mp.period?.id)) add("scope", "receipt_period_mismatch");
  claims.scope = codes.scope ? "FAIL" : "PASS";

  // bill against receipts, only when keys, signatures and scope all PASS
  if (claims.keys === "PASS" && claims.signatures === "PASS" && claims.scope === "PASS") {
    const set = new Map(ids.map((id, i) => [id, receipts[i]]));
    const lineIds: string[] = (bill.lines ?? []).flatMap((l: any) => l.receipts ?? []);
    const exclIds: string[] = (bill.exclusions ?? []).map((e: any) => e.receipt);
    const named = [...lineIds, ...exclIds];
    if (named.some((id) => !set.has(id))) add("coverage_bill_to_receipts", "unknown_receipt");
    claims.coverage_bill_to_receipts = codes.coverage_bill_to_receipts ? "FAIL" : "PASS";
    const namedSet = new Set(named);
    if (ids.some((id) => !namedSet.has(id))) add("coverage_receipts_to_bill", "unaccounted_receipt");
    claims.coverage_receipts_to_bill = codes.coverage_receipts_to_bill ? "FAIL" : "PASS";
    if (namedSet.size !== named.length) add("uniqueness", "listed_twice_in_bill");
    const earlierBilled = new Set(earlier.flatMap((b) => (b.lines ?? []).flatMap((l: any) => l.receipts ?? [])));
    if (lineIds.some((id) => earlierBilled.has(id))) add("uniqueness", "billed_on_earlier_bill");
    claims.uniqueness = codes.uniqueness ? "FAIL" : "PASS";
    for (const l of bill.lines ?? []) {
      if (l.quantity !== (l.receipts ?? []).length) add("quantities", "quantity_mismatch");
      for (const id of l.receipts ?? []) {
        const o = set.get(id)?.payload?.outcome;
        if (!o) continue; // unknown IDs are coverage's finding
        if (o.billable !== true) add("quantities", "not_billable");
        if (o.billing_class !== l.billing_class) add("quantities", "billing_class_mismatch");
      }
    }
    claims.quantities = codes.quantities ? "FAIL" : "PASS";
  }

  const ev = CLAIMS.filter((c) => c !== "amount").map((c) => claims[c]);
  const verdict: R = ev.includes("FAIL") ? "FAIL" : ev.every((x) => x === "PASS") ? "PASS" : "ABSTAIN";
  // Decisive: the README states no rule. Ours: the first FAIL in claim order; for an ABSTAIN,
  // signatures if it abstained (the verifier claim), else the first ABSTAIN.
  const decisive: Claim[] = verdict === "FAIL" ? [CLAIMS.find((c) => claims[c] === "FAIL")!]
    : verdict === "ABSTAIN" ? [claims.signatures === "ABSTAIN" ? "signatures" : CLAIMS.find((c) => claims[c] === "ABSTAIN")!] : [];
  return { verdict, decisive, claims, codes, payment_ready: false as const };
}

export function runCase(dir: string, opts: { forceVerifier?: boolean } = {}) {
  const c = JSON.parse(readFileSync(resolve(dir, "case.json"), "utf8"));
  const rd = (p: string) => readFileSync(resolve(dir, p), "utf8");
  const i = c.inputs;
  const out = check({ receipts: rd(i.receipts), manifest: rd(i.manifest), bill: rd(i.bill), keys: rd(i.keys), root_fingerprint: i.root_fingerprint,
    earlier_bills: (i.earlier_bills ?? []).map(rd), verifierAvailable: opts.forceVerifier ?? i.verifier !== "unavailable" });
  return { case: c.case, expected: c.expected, got: out };
}

if (import.meta.main) {
  const root = resolve(process.argv[2] ?? ".");
  const { readdirSync } = await import("node:fs");
  const cases = readdirSync(resolve(root, "cases")).sort();
  let agree = 0, full = 0;
  for (const name of cases) {
    const { expected: e, got: g } = runCase(resolve(root, "cases", name));
    const sameDecisive = e.decisive.every((d: Claim) => g.claims[d] === e.claims[d]) && jcs([...e.decisive].sort()) === jcs([...g.decisive].sort());
    const ok = g.verdict === e.verdict && sameDecisive && g.payment_ready === false;
    const vec = jcs(g.claims) === jcs(e.claims);
    const codesOk = jcs(g.codes) === jcs(Object.fromEntries(Object.entries(e.codes).map(([k, v]) => [k, v]))) ;
    agree += +ok; full += +(ok && vec && codesOk);
    console.log(`${ok ? "agree   " : "DISAGREE"} ${name.padEnd(40)} ${g.verdict.padEnd(7)} decisive=${g.decisive.join(",") || "-"} claims=${vec ? "same" : "DIFF"} codes=${codesOk ? "same" : "DIFF " + jcs(g.codes)}`);
  }
  console.log(`\n${agree} agree on verdict+decisive+payment_ready, ${full} also on all 8 claims and every code, of ${cases.length} cases`);
  process.exit(agree === cases.length ? 0 : 1);
}
