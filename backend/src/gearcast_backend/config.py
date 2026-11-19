"""Paths and settings. The API key is read from backend/.env and never logged."""
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = BACKEND_DIR.parent
load_dotenv(BACKEND_DIR / ".env")

REF_DIR = REPO_DIR / "ref"
DATA_JSON = REF_DIR / "prototype_data_extracted.json"
PKG_DIR = REF_DIR / "data_package"
MANUAL_PDF = PKG_DIR / "02_Guides (for humans)" / "WWTP_Maintenance_Manual_v1.0_F_2026-11-16.pdf"
IR_FORMAT_PDF = PKG_DIR / "02_Guides (for humans)" / "Incident_Report_Format_v1.3_F_2026-11-16.pdf"
IR_TEMPLATE_DOCX = PKG_DIR / "03_Forms" / "Incident_Report_Form_v1.2_F_2026-11-16.docx"

VAR_DIR = BACKEND_DIR / "var"
UPLOAD_DIR = VAR_DIR / "uploads"
INDEX_DIR = VAR_DIR / "index"
INCIDENTS_FILE = VAR_DIR / "incidents.json"
RENDER_DIR = VAR_DIR / "rendered"
for d in (VAR_DIR, UPLOAD_DIR, INDEX_DIR, RENDER_DIR):
    d.mkdir(parents=True, exist_ok=True)

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-flash")
EMBED_MODEL = os.getenv("GEARCAST_EMBED_MODEL", "BAAI/bge-small-en-v1.5")
