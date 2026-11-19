"""Render a filled .docx form to PDF in pure Python (no LibreOffice).

Walks the document body in order (paragraphs, tables, page breaks) and reproduces it with reportlab: the
template's column widths, merged cells, cell shading, bold/white header text, font sizes and the ☐/☒ tick
boxes. Used for the client's Incident_Report_Form_v1.2.docx, so the PDF keeps the client's format.
"""
from __future__ import annotations

import io
from xml.sax.saxutils import escape

import docx
from docx.oxml.ns import qn
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .config import BACKEND_DIR

_FONTS = BACKEND_DIR / "assets" / "fonts"
pdfmetrics.registerFont(TTFont("Form", str(_FONTS / "DejaVuSansCondensed.ttf")))
pdfmetrics.registerFont(TTFont("Form-Bold", str(_FONTS / "DejaVuSansCondensed-Bold.ttf")))
pdfmetrics.registerFontFamily("Form", normal="Form", bold="Form-Bold", italic="Form", boldItalic="Form-Bold")

TWIP = 1 / 20  # points


def _runs_markup(p_el, default_size: float) -> tuple[str, float, str | None]:
    """Paragraph XML -> reportlab markup, biggest font size, first explicit colour."""
    out, size, color = [], default_size, None
    for r in p_el.iter(qn("w:r")):
        rpr = r.find(qn("w:rPr"))
        bold = rpr is not None and rpr.find(qn("w:b")) is not None and rpr.find(qn("w:b")).get(qn("w:val")) not in ("0", "false")
        if rpr is not None:
            sz = rpr.find(qn("w:sz"))
            if sz is not None:
                size = max(size, int(sz.get(qn("w:val"))) / 2) if out else int(sz.get(qn("w:val"))) / 2
            c = rpr.find(qn("w:color"))
            if c is not None and color is None and c.get(qn("w:val")) not in (None, "auto"):
                color = "#" + c.get(qn("w:val"))
        txt = ""
        for node in r:
            if node.tag == qn("w:t"):
                txt += node.text or ""
            elif node.tag == qn("w:tab"):
                txt += "    "
            elif node.tag in (qn("w:br"), qn("w:cr")) and node.get(qn("w:type")) != "page":
                txt += "\n"
            elif node.tag == qn("w:sym"):
                txt += "☒" if node.get(qn("w:char"), "").upper() in ("2612", "F0FE") else "☐"
        if txt:
            t = escape(txt).replace("\n", "<br/>")
            out.append(f"<b>{t}</b>" if bold else t)
    # content-control checkboxes (w14:checkbox) render as their placeholder glyph text, already collected above
    return "".join(out), size, color


def _para(p_el, default=8.5, align=0, in_cell=False) -> Paragraph | None:
    markup, size, color = _runs_markup(p_el, default)
    if not markup.strip():
        return None
    jc = p_el.find(f"{qn('w:pPr')}/{qn('w:jc')}")
    if jc is not None:
        align = {"center": 1, "right": 2, "end": 2}.get(jc.get(qn("w:val")), align)
    st = ParagraphStyle("p", fontName="Form", fontSize=size, leading=size * 1.22, alignment=align,
                        textColor=colors.HexColor(color) if color else colors.HexColor("#1a1a1a"),
                        spaceAfter=0 if in_cell else 2)
    return Paragraph(markup, st)


def _table(tbl, avail_w: float) -> Table:
    grid = [int(g.get(qn("w:w"))) * TWIP for g in tbl.findall(f"{qn('w:tblGrid')}/{qn('w:gridCol')}")]
    scale = min(1.0, avail_w / sum(grid)) if grid and sum(grid) else 1.0
    widths = [g * scale for g in grid] or None
    ncols = len(grid) or max(len(tr.findall(qn("w:tc"))) for tr in tbl.findall(qn("w:tr")))
    data, styles, vmerge_open = [], [], {}
    for ri, tr in enumerate(tbl.findall(qn("w:tr"))):
        row, ci = [""] * ncols, 0
        for tc in tr.findall(qn("w:tc")):
            if ci >= ncols:
                break
            tcpr = tc.find(qn("w:tcPr"))
            span = 1
            if tcpr is not None:
                gs = tcpr.find(qn("w:gridSpan"))
                span = int(gs.get(qn("w:val"))) if gs is not None else 1
                shd = tcpr.find(qn("w:shd"))
                fill = shd.get(qn("w:fill")) if shd is not None else None
                if fill and fill.lower() not in ("auto", "ffffff"):
                    styles.append(("BACKGROUND", (ci, ri), (ci + span - 1, ri), colors.HexColor("#" + fill)))
                vm = tcpr.find(qn("w:vMerge"))
                if vm is not None:
                    if vm.get(qn("w:val")) == "restart":
                        vmerge_open[ci] = ri
                    elif ci in vmerge_open:
                        styles.append(("SPAN", (ci, vmerge_open[ci]), (ci + span - 1, ri)))
            paras = [p for p in (_para(p, in_cell=True) for p in tc.findall(qn("w:p"))) if p is not None]
            row[ci] = paras or ""
            if span > 1:
                styles.append(("SPAN", (ci, ri), (ci + span - 1, ri)))
            ci += span
        data.append(row)
    t = Table(data, colWidths=widths, repeatRows=0)
    t.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#8a9bb0")), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 3.5), ("RIGHTPADDING", (0, 0), (-1, -1), 3.5), *styles]))
    return t


def docx_bytes_to_pdf(data: bytes, footer: str = "", skip_instructions: bool = True) -> bytes:
    d = docx.Document(io.BytesIO(data))
    sec = d.sections[0]
    page_w = (sec.page_width or A4[0] * 12700) / 12700  # EMU -> pt
    lm, rm = (sec.left_margin or 0) / 12700 or 36, (sec.right_margin or 0) / 12700 or 36
    tm, bm = (sec.top_margin or 0) / 12700 or 36, (sec.bottom_margin or 0) / 12700 or 36
    avail = page_w - lm - rm
    story, skipping = [], False
    for el in d.element.body.iterchildren():
        text = "".join(t.text or "" for t in el.iter(qn("w:t"))).strip()
        if skip_instructions and el.tag == qn("w:p") and text.upper().startswith("HOW TO FILL IN"):
            skipping = True  # a completed report doesn't need the blank form's instructions page
        if skipping:
            if el.find(f".//{qn('w:br')}[@{qn('w:type')}='page']") is not None:
                skipping = False
            continue
        if el.tag == qn("w:p"):
            if el.find(f".//{qn('w:br')}[@{qn('w:type')}='page']") is not None:
                story.append(PageBreak())
                continue
            p = _para(el)
            story.append(p if p is not None else Spacer(1, 4))
        elif el.tag == qn("w:tbl"):
            story += [_table(el, avail), Spacer(1, 5)]

    def on_page(canvas, doc):
        canvas.saveState()
        canvas.setFont("Form", 6.5)
        canvas.setFillColor(colors.HexColor("#777777"))
        if footer:
            canvas.drawString(lm, bm * 0.45, footer)
        canvas.drawRightString(page_w - rm, bm * 0.45, f"Page {doc.page}")
        canvas.restoreState()

    buf = io.BytesIO()
    SimpleDocTemplate(buf, pagesize=(page_w, (sec.page_height or A4[1] * 12700) / 12700), leftMargin=lm, rightMargin=rm,
                      topMargin=tm, bottomMargin=bm, title="Equipment incident report").build(story, onFirstPage=on_page, onLaterPages=on_page)
    return buf.getvalue()
