"""GearCast backend: AI assistant, troubleshooter, incident reports, repair-or-replace."""


def main() -> None:
    import uvicorn

    uvicorn.run("gearcast_backend.main:app", host="127.0.0.1", port=8000)
