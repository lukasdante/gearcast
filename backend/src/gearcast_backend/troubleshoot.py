"""Troubleshooter: classify symptom (retrieval + LLM) → walk the diagnosticQuestions tree (structured yes/no) →
return the procedure verbatim from the data. Uploaded manuals without a structured procedure get LLM-summarised
steps, flagged as generated."""
from __future__ import annotations

import re

from .data import DATA, StatusCtx, get_status, partner_of, view
from .llm import complete_json
from .rag import KB, SYMPTOM_ALIASES

PROC_RX = re.compile(r"\b([A-Z]{2}-\d{2})\b")

CLASSIFY_SYSTEM = """You are Caster, GearCast's troubleshooting assistant. You classify a maintenance technician's description of a problem at a wastewater treatment plant
(pumps, motors, vibrating screens, check valves, sump and EQ tank levels) into exactly one symptom from the list.
Return JSON: {"behaviour": "answer"|"escalate"|"out_of_scope"|"no_match", "symptom_id": "SY-xx" or null,
"confidence": 0..1, "rationale": "<one sentence>", "likely_causes": ["<from the symptom's typical causes, most likely first>"],
"caster_says": "<one or two short, warm, plain sentences to the technician: what it sounds like and that you'll ask a few
yes/no checks. No emoji, no gushing.>"}
- "escalate": injury, burns, electric shock, fire spreading, structural damage (tank wall cracked, collapse), chemical
  exposure, anything life-safety → do not troubleshoot.
- "out_of_scope": not about WWTP equipment (sports, HR, IT, cooking, production lines unrelated to the WWTP...).
- "no_match": WWTP equipment but none of the symptoms fit.
- Prefer the most specific symptom: both units of a pair down → SY-16; trips on overload/thermal/breaker → SY-07;
  will not start / seized / standby failed to start → SY-06; earth leakage/ELCB/cable damage → SY-10;
  cavitation noise with fluctuating pressure → SY-11; leak at a transfer pump seal → SY-03; submersible seal alarm → SY-04."""


def _symptom_card(sid: str) -> dict:
    s = DATA.symptoms[sid]
    return {"id": sid, "name": s["symptom"], "equipment_group": s["equipment_group"], "severity": s["severity"],
            "typical_causes": [c.strip() for c in s["typical_causes"].split(";")], "first_check": s["first_check"],
            "first_procedure": s["first_procedure"], "escalate_if": s["escalate_if"]}


def classify(query: str, asset_id: str | None = None) -> dict:
    hits = KB.search(query + (f" {asset_id}" if asset_id else ""), k=5, source_types=["symptom"])
    cands = [h["source_id"] for h in hits]
    catalog = "\n".join(f"{s['symptom_id']}: {s['symptom']} | {s['equipment_group']} | {SYMPTOM_ALIASES.get(s['symptom_id'], '')}"
                        for s in DATA.symptoms.values())
    asset_txt = ""
    if asset_id and asset_id in DATA.asset:
        a = DATA.asset[asset_id]
        asset_txt = f"\nAsset selected: {asset_id} – {a['asset_type']} – {a['description']}"
    user = (f"Symptoms:\n{catalog}\n\nRetrieval top candidates (hybrid search): {', '.join(cands)}{asset_txt}\n\n"
            f"Technician says: \"{query}\"")
    try:
        out = complete_json(CLASSIFY_SYSTEM, user, max_tokens=900)
    except Exception as e:  # noqa: BLE001 – fall back to retrieval only
        out = {"behaviour": "answer", "symptom_id": cands[0] if cands else None, "confidence": 0.5,
               "rationale": f"Retrieval match (LLM unavailable: {type(e).__name__})"}
    beh = out.get("behaviour") if out.get("behaviour") in ("answer", "escalate", "out_of_scope", "no_match") else "answer"
    sid = out.get("symptom_id") if out.get("symptom_id") in DATA.symptoms else None
    if beh == "answer" and not sid:
        sid = cands[0] if cands else None
    return {"behaviour": beh, "symptom_id": sid if beh == "answer" else None, "confidence": out.get("confidence"),
            "rationale": out.get("rationale"), "caster_says": out.get("caster_says"), "likely_causes": out.get("likely_causes") or [], "retrieval": hits[:3]}


def _root_question(sid: str) -> str | None:
    qs = [q for q in DATA.questions.values() if q["symptom_id"] == sid]
    referenced = {t for q in qs for t in (q["if_yes"], q["if_no"]) if t in DATA.questions}
    roots = sorted(q["question_id"] for q in qs if q["question_id"] not in referenced)
    return roots[0] if roots else (qs[0]["question_id"] if qs else None)


def procedure_payload(pid: str) -> dict | None:
    p = DATA.procedures.get(pid)
    if not p:
        return None
    steps = [{"no": s["step_no"], "phase": s["phase"], "instruction": s["instruction"], "acceptance": s.get("acceptance_criteria"),
              "safety": s.get("safety_note"), "photo_required": bool(s.get("photo_required")), "sign_off": bool(s.get("sign_off_required"))}
             for s in DATA.steps.get(pid, [])]
    figs = [{"figure_id": f["figure_id"], "file_name": f["file_name"], "title": f["title"], "caption": f.get("caption"),
             "illustrative": bool(f.get("illustrative"))} for f in DATA.figures.get(pid, [])]
    return {"id": pid, "title": p["title"], "category": p["category"], "equipment": p["equipment"], "purpose": p["purpose"],
            "ppe": p["ppe"], "tools": p["tools"], "permits": p["permits"], "parts": p.get("parts"), "est_time_h": p.get("est_time_h"),
            "crew_size": p.get("crew_size"), "skills": p.get("skills"), "prerequisites": p.get("prerequisites"),
            "revision": p.get("revision"), "approval": p.get("approval"),
            "key_points": [{"type": k["point_type"], "text": k["text"]} for k in DATA.key_points.get(pid, [])],
            "steps": steps, "figures": figs, "generated": False}


def _sources_for(pid: str, sid: str | None) -> list[dict]:
    src = [{"kind": "procedure", "id": pid, "label": f"{pid} · {DATA.procedures[pid]['title']} (GearCast data)"}]
    if sid:
        src.append({"kind": "symptom", "id": sid, "label": f"{sid} · {DATA.symptoms[sid]['symptom']} (symptom table)"})
    pages = sorted({c["page"] for c in KB.chunks if c["source_type"] == "manual" and c.get("procedure_id") == pid})
    if pages:
        src.append({"kind": "manual", "id": "MANUAL", "pages": pages,
                    "label": f"WWTP Maintenance Manual p.{', '.join(map(str, pages[:3]))}"})
    return src


def _asset_context(ctx: StatusCtx, asset_id: str | None) -> dict | None:
    if not asset_id or asset_id not in DATA.asset:
        return None
    v = view(ctx, asset_id)
    p = partner_of(asset_id)
    pv = view(ctx, p) if p else None
    advice = None
    if pv and v["role"] == "DUTY" and pv["status"] == "In Service":
        advice = f"Start standby {p} before isolating {asset_id}."
    elif pv and pv["status"] != "In Service":
        advice = f"Partner {p} is {pv['status']} – isolating {asset_id} takes the pair down. Inform production / escalate (EM-09)."
    return {"asset_id": asset_id, "status": v["status"], "role": v["role"], "partner": p,
            "partner_status": get_status(ctx, p) if p else None, "advice": advice}


def generated_from_upload(query: str, asset_id: str | None) -> dict | None:
    hits = KB.search(query, k=5, source_types=["upload"], asset_id=asset_id)
    if not hits:
        return None
    doc_id = hits[0]["source_id"]
    doc = next((d for d in KB.docs if d["doc_id"] == doc_id), {"title": doc_id})
    context = "\n---\n".join(f"[p.{h.get('page')}] {h['text']}" for h in hits)
    out = complete_json(
        "You write a short step-by-step maintenance job for a technician from the manual excerpts given. Use only facts in "
        "the excerpts. JSON: {\"title\": str, \"ppe\": str, \"tools\": str, \"steps\": [{\"phase\": str, \"instruction\": str, "
        "\"acceptance\": str|null, \"safety\": str|null, \"page\": int|null}], \"escalate_if\": str|null}. Max 10 steps.",
        f"Problem: {query}\n\nManual excerpts from '{doc['title']}':\n{context}", max_tokens=1800)
    steps = [{"no": i + 1, "phase": s.get("phase") or "Work", "instruction": s.get("instruction", ""), "acceptance": s.get("acceptance"),
              "safety": s.get("safety"), "photo_required": False, "sign_off": False, "page": s.get("page")}
             for i, s in enumerate(out.get("steps") or [])]
    return {"stage": "procedure", "symptom": None, "path": [], "outcome": None,
            "procedure": {"id": doc_id, "title": out.get("title") or f"Job from {doc['title']}", "ppe": out.get("ppe"),
                          "tools": out.get("tools"), "permits": "Per plant rules", "est_time_h": None, "steps": steps, "figures": [],
                          "key_points": [], "generated": True,
                          "generated_note": f"Generated from {doc['title']} — verify against the manual before use."},
            "escalate_if": out.get("escalate_if"),
            "sources": [{"kind": "upload", "id": doc_id, "label": f"{doc['title']} p.{h.get('page')}"} for h in hits[:3]]}


def build_plan(symptom_id: str | None, path: list[dict], current_q: dict | None, proc: dict | None) -> list[dict]:
    plan: list[dict] = []
    if symptom_id:
        plan.append({"id": "symptom", "kind": "symptom", "title": f"Identify symptom: {DATA.symptoms[symptom_id]['symptom']}",
                     "detail": symptom_id, "auto": True, "done": True})
    for p in path:
        plan.append({"id": f"q:{p['question_id']}", "kind": "question", "title": p["question"], "detail": p["question_id"],
                     "auto": True, "done": True, "answer": p["answer"]})
    if current_q:
        plan.append({"id": f"q:{current_q['id']}", "kind": "question", "title": current_q["text"], "detail": current_q["id"],
                     "auto": True, "done": False})
    if proc:
        safety = [s["safety"] for s in proc["steps"] if s.get("safety")]
        plan.append({"id": "safety", "kind": "safety", "title": "Safety, LOTO and permits",
                     "detail": "; ".join([f"Permits: {proc.get('permits') or 'per plant rules'}"] + safety[:2]), "auto": False, "done": False})
        plan.append({"id": "prep", "kind": "prep", "title": "Tools and PPE ready",
                     "detail": f"Tools: {proc.get('tools') or '—'} · PPE: {proc.get('ppe') or '—'}", "auto": False, "done": False})
        for st in proc["steps"]:
            plan.append({"id": f"step:{proc['id']}:{st['no']}", "kind": "step", "title": st["instruction"], "detail": st.get("phase"),
                         "no": st["no"], "photo_required": st.get("photo_required"), "sign_off": st.get("sign_off"),
                         "auto": False, "done": False})
        accept = [s["acceptance"] for s in proc["steps"] if s.get("acceptance")]
        plan.append({"id": "check", "kind": "check", "title": "Acceptance check",
                     "detail": accept[-1] if accept else "Unit runs normally; readings within limits", "auto": False, "done": False})
        plan.append({"id": "rts", "kind": "rts", "title": "Return to service and log result",
                     "detail": "OP-05 run test; update status; file the incident report if the unit was taken out of service",
                     "auto": False, "done": False})
    return plan


def troubleshoot(query: str, asset_id: str | None, answers: list[dict], symptom_id: str | None, sim: dict | None,
                 skip_questions: bool = False) -> dict:
    ctx = StatusCtx.from_client(sim)
    asset_id = (asset_id or "").upper() or None
    cls = None
    if not symptom_id:
        cls = classify(query, asset_id)
        if cls["behaviour"] == "escalate":
            return {"stage": "escalate", "classification": cls,
                    "message": "Stop. This is a safety emergency – call the shift supervisor / emergency response and follow the plant safety procedure. Do not attempt repairs."}
        if cls["behaviour"] == "out_of_scope":
            return {"stage": "out_of_scope", "classification": cls,
                    "message": "This is outside the WWTP pumps, motors and screens GearCast covers. Please contact the right department."}
        if cls["behaviour"] == "no_match" or (asset_id and asset_id not in DATA.asset):
            gen = generated_from_upload(query, asset_id)
            if gen:
                return {**gen, "classification": cls, "asset": _asset_context(ctx, asset_id),
                        "plan": build_plan(None, [], None, gen["procedure"])}
            if cls["behaviour"] == "no_match":
                return {"stage": "no_match", "classification": cls,
                        "message": "No matching symptom in the troubleshooting table. Try describing what you see, hear or measure, or upload the equipment manual."}
        symptom_id = cls["symptom_id"]
    if symptom_id not in DATA.symptoms:
        return {"stage": "no_match", "message": f"Unknown symptom {symptom_id}"}

    # walk the decision tree with the answers so far
    amap = {a["question_id"]: str(a["answer"]).lower() in ("yes", "y", "true", "1") for a in answers or []}
    path, outcome, qid = [], None, (None if skip_questions else _root_question(symptom_id))
    guard = 0
    while qid and guard < 12:
        guard += 1
        q = DATA.questions[qid]
        if qid not in amap:
            cq = {"id": qid, "text": q["question"], "step": len(path) + 1}
            return {"stage": "question", "symptom": _symptom_card(symptom_id), "classification": cls, "path": path,
                    "question": cq, "asset": _asset_context(ctx, asset_id), "plan": build_plan(symptom_id, path, cq, None)}
        ans = amap[qid]
        nxt = q["if_yes"] if ans else q["if_no"]
        path.append({"question_id": qid, "question": q["question"], "answer": "Yes" if ans else "No", "next": nxt})
        if nxt in DATA.questions:
            qid = nxt
        else:
            outcome = re.sub(r"^Action:\s*", "", nxt)
            qid = None

    sym = DATA.symptoms[symptom_id]
    procs = PROC_RX.findall(outcome or "")
    pid = next((p for p in procs if p in DATA.procedures), None) or sym["first_procedure"]
    proc = procedure_payload(pid)
    related = [p for p in dict.fromkeys(procs + [sym["first_procedure"]]) if p in DATA.procedures and p != pid]
    return {
        "stage": "procedure", "symptom": _symptom_card(symptom_id), "classification": cls, "path": path,
        "outcome": outcome or f"Follow {pid} ({DATA.procedures[pid]['title']})",
        "why": (f"{' → '.join(f'{p['question_id']} {p['answer']}' for p in path)} → {outcome}" if path else
                f"First procedure for {symptom_id}"),
        "likely_causes": (cls or {}).get("likely_causes") or _symptom_card(symptom_id)["typical_causes"],
        "procedure": proc, "related_procedures": [{"id": r, "title": DATA.procedures[r]["title"]} for r in related],
        "escalate_if": sym["escalate_if"], "sources": _sources_for(pid, symptom_id), "asset": _asset_context(ctx, asset_id),
        "plan": build_plan(symptom_id, path, None, proc),
    }
