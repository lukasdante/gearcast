"""GearCast API (FastAPI, port 8000). Vite dev server proxies /api → here."""
from __future__ import annotations

import threading
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

from . import incidents, pdf, rr, tools
from .chat import run_chat
from .config import DEEPSEEK_API_KEY
from .data import StatusCtx
from .llm import MODEL
from .rag import KB
from .render import render_docx, soffice_bin
from .troubleshoot import troubleshoot

app = FastAPI(title="GearCast API", version="0.1.0")


@app.on_event("startup")
def _startup() -> None:
    threading.Thread(target=KB.load_or_build, daemon=True).start()
    threading.Thread(target=_prebuild_history_pdfs, daemon=True).start()


class Sim(BaseModel):
    overrides: dict[str, Any] = Field(default_factory=dict)
    roleOverrides: dict[str, Any] = Field(default_factory=dict)


@app.get("/api/health")
def health():
    return {"ok": True, "model": MODEL, "llm_configured": bool(DEEPSEEK_API_KEY), "kb_ready": KB.ready,
            "kb_chunks": len(KB.chunks), "pdf_export": bool(soffice_bin())}


# ------------------------------------------------------------------ tools (read-only, also handy for the UI)
@app.post("/api/tools/{name}")
def call_tool(name: str, body: dict):
    ctx = StatusCtx.from_client(body.pop("sim", None))
    return tools.run_tool(ctx, name, body)


# ------------------------------------------------------------------ chat
class ChatReq(BaseModel):
    messages: list[dict]
    sim: Sim | None = None


@app.post("/api/chat")
def chat(req: ChatReq):
    return StreamingResponse(run_chat(req.messages, req.sim.model_dump() if req.sim else None), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ------------------------------------------------------------------ troubleshoot
class Answer(BaseModel):
    question_id: str
    answer: str


class TroubleReq(BaseModel):
    query: str = ""
    asset_id: str | None = None
    symptom_id: str | None = None
    answers: list[Answer] = Field(default_factory=list)
    skip_questions: bool = False
    sim: Sim | None = None


@app.post("/api/troubleshoot")
def trouble(req: TroubleReq):
    if not req.query.strip() and not req.symptom_id:
        raise HTTPException(400, "query required")
    return troubleshoot(req.query, req.asset_id, [a.model_dump() for a in req.answers], req.symptom_id,
                        req.sim.model_dump() if req.sim else None, req.skip_questions)


# ------------------------------------------------------------------ knowledge
@app.get("/api/knowledge/docs")
def kb_docs():
    return KB.list_docs()


@app.get("/api/knowledge/search")
def kb_search(q: str, asset_id: str | None = None, k: int = 6):
    return {"query": q, "results": KB.search(q, k=k, asset_id=asset_id)}


@app.post("/api/knowledge/upload")
async def kb_upload(file: UploadFile = File(...), asset_id: str | None = Form(None), equipment_model: str | None = Form(None),
                    title: str | None = Form(None)):
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, "File too large (max 25 MB)")
    try:
        return KB.add_upload(file.filename or "upload.txt", data, (asset_id or "").upper() or None, equipment_model, title)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.delete("/api/knowledge/docs/{doc_id}")
def kb_delete(doc_id: str):
    if not KB.delete_doc(doc_id):
        raise HTTPException(404, "not found")
    return {"ok": True}


# ------------------------------------------------------------------ incidents
class DraftReq(BaseModel):
    asset_id: str
    failure_at: str | None = None
    reported_by: str | None = None
    shift: str | None = None
    detected_by: str | None = None
    operating_condition: str | None = None
    observed: str | None = None
    actions_taken: str | None = None
    downtime_h: float | None = None
    procedure_used: str | None = None
    parts_used: str | None = None
    spare_used: str | None = None
    safety_injury: str | None = None
    severity: str | None = None
    shut_down: bool = False
    sim: Sim | None = None


@app.post("/api/incidents/draft")
def incident_draft(req: DraftReq):
    body = req.model_dump(exclude={"sim"})
    try:
        return incidents.build_draft(body, req.sim.model_dump() if req.sim else None)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.post("/api/incidents/render")
def incident_render(draft: dict, format: str = "docx"):
    data = render_docx(draft)
    name = draft.get("report_id", "IR-draft")
    if format == "pdf":
        return Response(pdf.draft_pdf(draft), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{name}.pdf"'})
    return Response(data, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    headers={"Content-Disposition": f'attachment; filename="{name}.docx"'})


@app.post("/api/incidents")
def incident_submit(draft: dict):
    if not draft.get("asset_id") or not draft.get("fields"):
        raise HTTPException(400, "draft with asset_id and fields required")
    return incidents.submit(draft)


@app.get("/api/incidents")
def incident_list():
    return incidents.list_reports()


@app.get("/api/incidents/{report_id}")
def incident_get(report_id: str):
    r = incidents.get_report(report_id)
    if not r:
        raise HTTPException(404, "not found")
    return r


@app.get("/api/incidents/{report_id}/pdf")
def incident_pdf(report_id: str):
    path = pdf.pdf_path(report_id)
    if not path.exists():  # produced at submission / startup; build once if missing (e.g. older records)
        r = incidents.get_report(report_id)
        if not r:
            raise HTTPException(404, "not found")
        pdf.store(report_id, pdf.history_pdf(r["history"]) if "history" in r else pdf.draft_pdf(r))
    return Response(path.read_bytes(), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{report_id}.pdf"'})


def _prebuild_history_pdfs() -> None:
    from .data import DATA
    for h in DATA.incident_reports:
        p = pdf.pdf_path(h["report_id"])
        if not p.exists():
            pdf.store(h["report_id"], pdf.history_pdf(h))



# ------------------------------------------------------------------ repair or replace
@app.get("/api/rr/cases")
def rr_cases():
    return {"model": rr.MODEL_INFO, "cases": rr.cases()}


@app.get("/api/rr/predict/{asset_id}")
def rr_predict(asset_id: str, repair_cost_php: float | None = None):
    return tools.repair_or_replace(asset_id=asset_id, repair_cost_php=repair_cost_php)
