"""Troubleshooter eval over the 145 symptomPhrases (expected_symptom_id + expected_first_step).

Retrieval mode (default, free): hybrid search restricted to symptom chunks; reports top-1 / top-3 symptom hit
rate and first-procedure hit rate for the 120 'Answer' phrases, plus BM25-only / dense-only ablations.
Agent mode (--agent N): runs the LLM classifier on N phrases (incl. escalate / out-of-scope) — costs tokens.

    uv run python eval/troubleshoot_eval.py [--agent 30]
"""
import argparse
import random
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from gearcast_backend.data import DATA  # noqa: E402
from gearcast_backend.rag import KB  # noqa: E402


def retrieval_eval(label: str, **kw) -> dict:
    rows = [p for p in DATA.symptom_phrases if p["expected_behaviour"] == "Answer"]
    top1 = top3 = proc1 = 0
    misses = []
    for p in rows:
        hits = KB.search(p["technician_phrase"], k=3, source_types=["symptom"], **kw)
        ids = [h["source_id"] for h in hits]
        exp = p["expected_symptom_id"]
        top1 += bool(ids and ids[0] == exp)
        top3 += exp in ids
        fp = DATA.symptoms[ids[0]]["first_procedure"] if ids else None
        proc1 += fp == p["expected_first_step"]
        if not ids or ids[0] != exp:
            misses.append((p["technician_phrase"], exp, ids[:3]))
    n = len(rows)
    print(f"{label:<14} n={n}  top-1 symptom {top1 / n:6.1%}   top-3 symptom {top3 / n:6.1%}   first-procedure {proc1 / n:6.1%}")
    return {"n": n, "top1": top1 / n, "top3": top3 / n, "proc": proc1 / n, "misses": misses}


def agent_eval(n: int) -> None:
    from gearcast_backend.troubleshoot import classify

    random.seed(7)
    rows = random.sample(DATA.symptom_phrases, n)
    ok_sym = ok_beh = ok_proc = 0
    t0 = time.time()
    for p in rows:
        r = classify(p["technician_phrase"])
        beh = {"answer": "Answer", "escalate": "Escalate", "out_of_scope": "Refuse – out of scope"}[r["behaviour"]]
        ok_beh += beh == p["expected_behaviour"]
        if p["expected_behaviour"] == "Answer":
            ok_sym += r.get("symptom_id") == p["expected_symptom_id"]
            ok_proc += (DATA.symptoms.get(r.get("symptom_id") or "", {}).get("first_procedure") == p["expected_first_step"])
        else:
            ok_sym += beh == p["expected_behaviour"]
            ok_proc += beh == p["expected_behaviour"]
        if beh != p["expected_behaviour"] or (beh == "Answer" and r.get("symptom_id") != p["expected_symptom_id"]):
            print("  miss:", p["technician_phrase"], "| expected", p["expected_symptom_id"], "| got", beh, r.get("symptom_id"))
    print(f"agent (LLM)    n={n}  behaviour {ok_beh / n:6.1%}   symptom {ok_sym / n:6.1%}   first-procedure {ok_proc / n:6.1%}"
          f"   ({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--agent", type=int, default=0)
    ap.add_argument("--misses", action="store_true")
    a = ap.parse_args()
    KB.load_or_build()
    res = retrieval_eval("hybrid (RRF)")
    retrieval_eval("bm25 only", w_dense=0.0)
    retrieval_eval("dense only", w_bm25=0.0, w_dense=1.0)
    if a.misses:
        for m in res["misses"]:
            print("  ", m)
    if a.agent:
        agent_eval(a.agent)
