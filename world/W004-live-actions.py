"""Build or check W004-live-actions.json, the skip-list of W004's live-action tasks.

The task ids are not typed here: they are read from the re-check blocks in W004.md
(and the OSWorld id from W003.md), then looked up in the pinned task files.

  python3 W004-live-actions.py build   # in a dir holding the 5 pinned files, writes W004-live-actions.json
  python3 W004-live-actions.py check   # asserts the counts W004 states; exits 1 on a mismatch
"""
import ast, hashlib, json, re, sys
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).parent
OUT = HERE / "W004-live-actions.json"
STOP = ("do not", "don't", "without submitting", "before submitting", "stop before", "let me review")

FILES = {  # benchmark -> (file, pin, url)
    "WebVoyager": ("wv.jsonl", "MinorJerry/WebVoyager@5a7896738c10bfb8b9edccce6bb0e0411f8ae569",
                   "https://raw.githubusercontent.com/MinorJerry/WebVoyager/5a7896738c10bfb8b9edccce6bb0e0411f8ae569/data/WebVoyager_data.jsonl"),
    "Online-Mind2Web": ("om2w.json", "allenai/molmoweb@bab3fc3f1bff5b42c0624c073b68ddf9ad651d91 (copy; official file gated)",
                        "https://raw.githubusercontent.com/allenai/molmoweb/bab3fc3f1bff5b42c0624c073b68ddf9ad651d91/benchmarks/jsons/online_mind2web.json"),
    "Mind2Web-Live": ("m2wl.json", "HF iMeanAI/Mind2Web-Live@160677b57f6a608e6d63b51849a33d2920b35588",
                      "https://huggingface.co/datasets/iMeanAI/Mind2Web-Live/resolve/160677b57f6a608e6d63b51849a33d2920b35588/mind2web-live_test_20241024.json"),
    "OSWorld": ("osw_da46.json", "xlang-ai/OSWorld@b138d348256078fa634fc3b73567a7337c793e6b",
                "https://raw.githubusercontent.com/xlang-ai/OSWorld/b138d348256078fa634fc3b73567a7337c793e6b/evaluation_examples/examples/chrome/da46d875-6b82-4681-9284-653b0c7ae241.json"),
}
# what W004's summary states: benchmark -> {class: count}
EXPECTED = {
    "WebVoyager": {"reaches_business": 8, "account_or_cart_state": 2, "sends_credentials": 1},
    "Online-Mind2Web": {"reaches_business": 4, "account_or_cart_state": 15},
    "Mind2Web-Live": {"reaches_business": 7, "account_or_cart_state": 14},
    "OSWorld": {"reaches_business": 1},
}
NO_STOP = 50  # W004: 10 + 19 + 21 with no stop instruction


def lists(block):
    """Python list literals assigned in a W004 re-check block: name -> list."""
    return {m[1]: ast.literal_eval(m[2]) for m in re.finditer(r"^(\w+) = (\[.*?\])$", block, re.M | re.S)}


def blocks():
    md = (HERE / "W004.md").read_text()
    def get(h):
        return md.split(f"### Re-check ({h})", 1)[1].split("###", 1)[0]
    return lists(get("WebVoyager")), lists(get("Online-Mind2Web")), lists(get("Mind2Web-Live"))


def sha(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def row(bench, tid, site, cls, text):
    f, pin, url = FILES[bench]
    return {"benchmark": bench, "file": url, "commit_or_sha256": f"{pin} sha256:{sha(f)}", "task_id": tid,
            "site": site, "class": cls, "stop_instruction": any(s in text.lower() for s in STOP),
            "instruction_verbatim": text}


def build():
    wv_l, om_l, ml_l = blocks()
    rows = []
    wv = {r["id"]: r for r in map(json.loads, filter(str.strip, open("wv.jsonl")))}
    for t in wv_l["ten"]:
        cls = "account_or_cart_state" if "cart" in wv[t]["ques"].lower() else "reaches_business"
        rows.append(row("WebVoyager", t, wv[t]["web"], cls, wv[t]["ques"]))
    t = "Google Search--15"  # named in W004 prose and asserted by its re-check ("twitter login True")
    rows.append(row("WebVoyager", t, "x.com (task starts at " + wv[t]["web"] + ")", "sends_credentials", wv[t]["ques"]))
    om = {r["task_id"][:8]: r for r in json.load(open("om2w.json"))}
    for group, cls in (("send", "reaches_business"), ("cart", "account_or_cart_state")):
        for k in om_l[group]:
            r = om[k]
            rows.append(row("Online-Mind2Web", r["task_id"], urlparse(r["website"]).hostname, cls, r["confirmed_task"]))
    ml = {r["index"]: r for r in json.load(open("m2wl.json"))}
    for group, cls in (("send", "reaches_business"), ("account", "account_or_cart_state"), ("cart", "account_or_cart_state")):
        for i in ml_l[group]:
            r = ml[i]
            hosts = [urlparse(e["content"]["url"]).hostname.removeprefix("www.") for e in r["evaluation"]
                     if e["content"].get("url", "").startswith("http")]
            rows.append(row("Mind2Web-Live", i, hosts[0] if hosts else r["task"].rsplit(" on ", 1)[-1].strip(" ."), cls, r["task"]))
    osw_id = re.search(r"grep -c (da46d875-[0-9a-f-]+)", (HERE / "W003.md").read_text())[1]
    d = json.load(open("osw_da46.json"))
    assert d["id"] == osw_id
    rows.append(row("OSWorld", f"chrome/{d['id']}", "mbta.com", "reaches_business", d["instruction"]))
    OUT.write_text(json.dumps(rows, indent=1, ensure_ascii=False) + "\n")
    print("wrote", len(rows), "rows")


def check(rows):
    bad = []
    for bench, want in EXPECTED.items():
        got = {}
        for r in rows:
            if r["benchmark"] == bench:
                got[r["class"]] = got.get(r["class"], 0) + 1
        print(bench, got, "OK" if got == want else f"MISMATCH, W004 says {want}")
        bad += [bench] if got != want else []
    nostop = sum(not r["stop_instruction"] for r in rows if r["benchmark"] != "OSWorld" and r["class"] != "sends_credentials")
    print("no stop instruction", nostop, "OK" if nostop == NO_STOP else f"MISMATCH, W004 says {NO_STOP}")
    bad += [] if nostop == NO_STOP else ["no-stop"]
    osw = [r for r in rows if r["benchmark"] == "OSWorld"]
    bad += [] if len(osw) == 1 and osw[0]["stop_instruction"] else ["OSWorld stop"]
    dup = len(rows) - len({(r["benchmark"], r["task_id"]) for r in rows})
    bad += ["duplicates"] if dup else []
    return bad


if __name__ == "__main__":
    if sys.argv[1:] == ["build"]:
        build()
    bad = check(json.loads(OUT.read_text()))
    sys.exit(1 if bad else 0)
