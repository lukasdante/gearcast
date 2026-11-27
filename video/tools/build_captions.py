"""Step 2: align whisper words to the script text and build caption phrases.

Run from the repo root (after transcribe.py):
  uv run --with numpy python -I video/tools/build_captions.py
Reads docs/video/promo/script.md, video/tools/whisper_raw.json and video/public/audio/*.wav.
Writes video/src/data/captions.json and video/tools/captions_report.md.
"""
import difflib
import json
import math
import re
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "docs" / "video" / "promo" / "script.md"
RAW = ROOT / "video" / "tools" / "whisper_raw.json"
AUDIO = ROOT / "video" / "public" / "audio"
OUT = ROOT / "video" / "src" / "data" / "captions.json"
REPORT = ROOT / "video" / "tools" / "captions_report.md"
FPS = 30

NOTES = """## Review notes

- **Wording:** every clip follows the script word for word. The automatic diff flags only the items below,
  and none of them is a wording change:
  - "Jun" (scenes 04, 09, 10, 11): ASR hears "June" in 04/10/11 and "Jin" in 09. This is a name-recognition
    artefact, but it also suggests the voice says "Jun" a little differently in 09. Listen to 09 against 04
    if the name has to sound the same throughout. Captions show "Jun".
  - "five point nine million pesos" (00, 13): ASR writes "5.9 million". This is spoken correctly and is shown as "₱5.9 M".
  - The ASR spells it "GAP" in 01, "XG Boost" in 08 and "Gear cast" in 13. These are only spelling and spacing
    differences, so the diff ignores them. In 01 the voice stresses "gap", and 13 has a small pause inside "GearCast".
  - Punctuation the ASR leaves out, such as the colon before "P-101B" in 02 or the "?" after "Repair or replace" in 08,
    comes from the script, so captions keep the script's punctuation.
- **Trailing silence:** this is 0.04–0.16 s in every clip, not the 0.4 s the script asked for. The voice fades to
  digital silence, so nothing is cut off, but each scene needs a tail added in the edit.
  - 00 has a short noise (a breath or click, about 100 ms at -25 dBFS) at 18.02–18.12 s, right after "check".
    Fade out from about 18.0 s, or trim it.
  - 04 ("happens") and 13 (which starts 0.04 s in) are tight at the edges. Don't put a hard cut on the clip's
    first or last frame.
- **Levels:** the peaks are -0.6 to -1.3 dBFS and no samples are clipped. The clips are loud, so give them some
  headroom when mixing them with the music.
- **Pauses:** the longest pause inside a clip is 0.59 s (04 at 5.83 s, before "what if it fails?"). There are no
  long gaps.
- **Durations vs script estimates:** 00 runs 18.2 s against an estimate of about 14 s. 06, 09, 10, 12 and 13 run
  shorter than estimated. The total of 2:37 is under the 2:45 target, so add the difference as scene tails or transitions.
"""

IDS = ["00_hook", "01_meet", "02_dashboard", "03_qr_scan", "04_overview_fault", "05_caster",
       "06_spares_approval", "07_incident", "08_repair_replace", "09_knowledge", "10_layout_approval",
       "11_pm_findings", "12_emergency_access", "13_close"]

# spoken form in the script -> on-screen form
SUBS = [
    # each returns [(display word, spoken words)], so multi-word displays stay one word per token
    (r"P one-oh-one ([AB])", lambda m: [(f"P-101{m.group(1)}", m.group(0))]),
    (r"[Ff]ive point nine million pesos", lambda m: [("₱5.9", "five point nine"), ("M", "million pesos")]),
    (r"\bTen hours\b", lambda m: [("10", "ten"), ("hours", "hours")]),
    (r"\bPlant two\b", lambda m: [("Plant", "Plant"), ("2", "two")]),
]

# emphasis per scene: display-word sequences (case-insensitive, punctuation ignored)
EMPHASIS = {
    0: ["Six", "P-101A", "trips", "P-101B", "doesn't start", "10 hours", "₱5.9 M", "missed check"],
    1: ["gap", "GearCast", "supervisor", "engineer", "technicians"],
    2: ["Lemuel", "supervisor", "dashboard", "P-101B"],
    3: ["Mia", "technician", "QR tag", "whole history", "vibration is climbing"],
    4: ["Jun", "engineer", "3D plant overview", "what if it fails?", "red", "critical", "price"],
    5: ["Caster", "assistant", "own tools", "manuals", "parts"],
    6: ["Grease", "accessory", "bearing kit", "major", "Lemuel", "one tap"],
    7: ["photo", "incident report", "own form", "trend", "one week", "one year", "failure date"],
    8: ["Repair", "replace?", "XGBoost", "brand", "supplier", "lead time"],
    9: ["procedure", "Jun", "knowledge base", "manual page"],
    10: ["Jun", "layout", "Engineers", "propose", "supervisors", "approve", "Lemuel"],
    11: ["PM", "Ken", "tablet", "checklist", "readings", "photos", "Jun", "approves", "maintenance record"],
    12: ["Plant 2", "Rico", "temporary access", "expiry"],
    13: ["One pump", "early", "₱5.9 M", "GearCast", "sees it coming"],
}

ONES = "zero one two three four five six seven eight nine".split()
WEAK_END = {"the", "a", "an", "of", "to", "and", "on", "in", "its", "it", "with", "from", "for", "is",
            "that", "so", "his", "her", "their", "plant's", "pump's", "every", "one"}


def parse_script():
    text = SCRIPT.read_text()
    scenes = {}
    for m in re.finditer(r"^## (\d\d) [^\n]*\n((?:>[^\n]*\n)+)", text, re.M):
        lines = [l.lstrip(">").strip() for l in m.group(2).splitlines()]
        scenes[int(m.group(1))] = " ".join(lines)
    return scenes


def norm_tokens(s):
    """Spoken-ish normalisation shared by script and ASR text."""
    s = s.lower().replace("’", "'").replace("₱", "")
    s = re.sub(r"(^|\s)\.(\d)", r"\1 point \2", s)
    s = re.sub(r"(\d+)\.(\d+)", lambda m: f"{m.group(1)} point {m.group(2)}", s)
    s = re.sub(r"(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])", " ", s)
    s = re.sub(r"\d+", lambda m: " ".join("oh" if (d == "0" and len(m.group()) > 1) else ONES[int(d)]
                                          for d in m.group()), s)
    s = s.replace("-", " ").replace("'", "")
    return re.findall(r"[a-z]+", s)


def display_units(text):
    """Split the script into display words, each with its spoken form."""
    holders = []

    def hold(fn):
        def rep(m):
            holders.append(fn(m))
            return f"\x00{len(holders) - 1}\x00"
        return rep

    for pat, fn in SUBS:
        text = re.sub(pat, hold(fn), text)
    units = []
    for tok in text.split():
        m = re.search(r"\x00(\d+)\x00", tok)
        if m:
            pre, post = tok.split(m.group(0))
            pairs = holders[int(m.group(1))]
            for k, (disp, spoken) in enumerate(pairs):
                a = pre if k == 0 else ""
                b = post if k == len(pairs) - 1 else ""
                units.append((a + disp + b, a + spoken + b))
        else:
            units.append((tok, tok))
    return units


def align(units, asr_words):
    # script tokens, with owning unit index
    s_tok, s_owner = [], []
    for ui, (_, spoken) in enumerate(units):
        for t in norm_tokens(spoken):
            s_tok.append(t)
            s_owner.append(ui)
    # asr tokens, each with a sub-span of its word's time
    a_tok, a_time = [], []
    for w in asr_words:
        toks = norm_tokens(w["text"]) or []
        n = len(toks)
        for k, t in enumerate(toks):
            d = (w["end"] - w["start"]) / n
            a_tok.append(t)
            a_time.append((w["start"] + k * d, w["start"] + (k + 1) * d))
    sm = difflib.SequenceMatcher(a=s_tok, b=a_tok, autojunk=False)
    times = [None] * len(s_tok)
    ops = sm.get_opcodes()
    for tag, i1, i2, j1, j2 in ops:
        if tag == "equal":
            for k in range(i2 - i1):
                times[i1 + k] = a_time[j1 + k]
        elif tag == "replace":
            t0, t1 = a_time[j1][0], a_time[j2 - 1][1]
            lens = [len(t) for t in s_tok[i1:i2]]
            tot, acc = sum(lens), 0
            for k, L in enumerate(lens):
                times[i1 + k] = (t0 + (t1 - t0) * acc / tot, t0 + (t1 - t0) * (acc + L) / tot)
                acc += L
    # deletes (script tokens with no audio match): squeeze between neighbours
    for i, t in enumerate(times):
        if t is None:
            prev = next((times[k][1] for k in range(i - 1, -1, -1) if times[k]), 0.0)
            nxt = next((times[k][0] for k in range(i + 1, len(times)) if times[k]), prev)
            times[i] = (prev, max(prev, nxt))
    words = []
    for ui, (disp, _) in enumerate(units):
        ts = [times[k] for k in range(len(s_tok)) if s_owner[k] == ui]
        words.append({"text": disp, "start": round(min(t[0] for t in ts), 3),
                      "end": round(max(t[1] for t in ts), 3)})
    # deviations: non-equal opcodes that are not just spacing / compounding differences
    devs = []
    for tag, i1, i2, j1, j2 in ops:
        if tag == "equal":
            continue
        a, b = "".join(s_tok[i1:i2]), "".join(a_tok[j1:j2])
        if a == b:
            continue
        devs.append({"script": " ".join(s_tok[i1:i2]), "heard": " ".join(a_tok[j1:j2]),
                     "at": round(a_time[j1][0] if j1 < len(a_time) else a_time[-1][1], 2)})
    return words, devs


def bare(s):
    return re.sub(r"[^\w₱.\-' ]", "", s.lower().replace("’", "'")).strip(".")


def emphasis_flags(words, phrases):
    flags = [False] * len(words)
    flat = [(b, wi) for wi, w in enumerate(words) for b in bare(w["text"]).split()]
    fb = [f[0] for f in flat]
    for p in phrases:
        seq = bare(p).split()
        n = len(seq)
        for i in range(len(fb) - n + 1):
            if fb[i:i + n] == seq:
                for k in range(i, i + n):
                    flags[flat[k][1]] = True
    return flags


GOOD_START = {"and", "so", "with", "from", "before", "that", "the", "to", "on", "in", "of", "but", "while"}


def split_long(idx, words):
    """Split a clause (list of word indices) into chunks of <= 6 words."""
    n = len(idx)
    glue = sum(1 for i in idx if re.fullmatch(r"M[.,:]?", words[i]["text"]))  # "₱5.9 M" reads as one word
    if n - glue <= 6:
        return [idx]
    k = math.ceil(n / 6)
    out, start = [], 0
    for part in range(1, k):
        target = round(n * part / k)
        best, score = target, None
        for c in range(max(start + 2, target - 2), min(n - 2, target + 2) + 1):
            gap = words[idx[c]]["start"] - words[idx[c - 1]]["end"]
            weak = bare(words[idx[c - 1]]["text"]) in WEAK_END
            good = bare(words[idx[c]]["text"]) in GOOD_START
            sc = gap - (1.0 if weak else 0) + (0.3 if good else 0) - 0.1 * abs(c - target)
            if c - start <= 6 and (score is None or sc > score):
                best, score = c, sc
        out.append(idx[start:best])
        start = best
    out.append(idx[start:])
    return out


def build_phrases(words, flags):
    clauses, cur = [], []
    for i, w in enumerate(words):
        cur.append(i)
        nxt_gap = words[i + 1]["start"] - w["end"] if i + 1 < len(words) else 9
        hard = re.search(r"[.?!:]$", w["text"]) is not None
        soft = w["text"].endswith(",") or nxt_gap > 0.35
        if hard or (soft and len(cur) >= 2) or i == len(words) - 1:
            clauses.append(cur)
            cur = []
    chunks = []
    for c in clauses:
        chunks.extend(split_long(c, words))
    # merge single-word chunks: forward if it fits, else backward
    final, k = [], 0
    while k < len(chunks):
        c = chunks[k]
        if len(c) == 1 and k + 1 < len(chunks) and len(chunks[k + 1]) + 1 <= 6 and \
                not re.search(r"[.?!]$", words[c[0]]["text"]):
            chunks[k + 1] = c + chunks[k + 1]
        elif len(c) == 1 and final and len(final[-1]) + 1 <= 6:
            final[-1] = final[-1] + c
        else:
            final.append(c)
        k += 1
    phrases = []
    for c in final:
        emph, run = [], []
        for i in c:
            if flags[i]:
                run.append(words[i]["text"])
            elif run:
                emph.append(" ".join(run)); run = []
        if run:
            emph.append(" ".join(run))
        emph = [re.sub(r"^[\"“]+|[,.:;!?\"”]+$", "", e) for e in emph]
        phrases.append({"text": " ".join(words[i]["text"] for i in c),
                        "start": words[c[0]]["start"], "end": words[c[-1]]["end"], "emphasis": emph,
                        "_idx": c})
    return phrases


def audio_stats(path):
    with wave.open(str(path)) as wf:
        sr, n, ch, sw = wf.getframerate(), wf.getnframes(), wf.getnchannels(), wf.getsampwidth()
        raw = wf.readframes(n)
    assert sw == 2
    x = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    hop = int(sr * 0.01)
    frames = x[: len(x) // hop * hop].reshape(-1, hop)
    db = 20 * np.log10(np.sqrt((frames ** 2).mean(axis=1)) + 1e-9)
    active = np.where(db > -45)[0]
    start = active[0] * 0.01 if len(active) else 0.0
    end = (active[-1] + 1) * 0.01 if len(active) else n / sr
    # longest internal pause (< -45 dB run) between speech
    quiet = db <= -45
    longest, run, run_at, best_at = 0, 0, 0, 0
    for i in range(active[0], active[-1] + 1):
        if quiet[i]:
            if run == 0:
                run_at = i
            run += 1
            if run > longest:
                longest, best_at = run, run_at
        else:
            run = 0
    peak = float(np.abs(x).max())
    clipped = int((np.abs(x) >= 0.999).sum())
    return {"duration": round(n / sr, 3), "speechStart": round(start, 3), "speechEnd": round(end, 3),
            "peakDb": round(20 * math.log10(peak + 1e-9), 2), "clippedSamples": clipped,
            "longestPause": round(longest * 0.01, 2), "longestPauseAt": round(best_at * 0.01, 2),
            "sr": sr}


def main():
    script = parse_script()
    raw = json.loads(RAW.read_text())
    out = {"fps": FPS, "asrModel": raw["model"], "scenes": []}
    report = ["# Caption timing report", "",
              f"ASR: faster-whisper `{raw['model']}` (CPU int8), aligned to `docs/video/promo/script.md`.",
              "Times are seconds from each clip's start. Generated by `video/tools/build_captions.py`.", ""]
    total = 0.0
    summary = ["| Scene | Duration | Speech start | Speech end | Tail silence | Longest pause | Peak |",
               "|---|---|---|---|---|---|---|"]
    body = []
    for i in range(14):
        key = f"{i:02d}"
        units = display_units(script[i])
        asr = raw["clips"][key]
        st = audio_stats(AUDIO / f"{key}.wav")
        words, devs = align(units, asr["words"])
        # whisper pins the first word to 0.0; start it where the audio actually starts
        words[0]["start"] = max(words[0]["start"], st["speechStart"])
        flags = emphasis_flags(words, EMPHASIS.get(i, []))
        phrases = build_phrases(words, flags)
        for w, f in zip(words, flags):
            w["emphasis"] = f
        # per-phrase word lists (the Remotion loader reads word times/emphasis from here)
        wi = 0
        for p in phrases:
            n = len(p.pop("_idx"))
            p["words"] = words[wi:wi + n]
            wi += n
        total += st["duration"]
        out["scenes"].append({
            "scene": i, "id": IDS[i], "audio": f"audio/{key}.wav",
            "durationSec": st["duration"], "durationFrames": math.ceil(st["duration"] * FPS),
            "speechStartSec": st["speechStart"], "speechEndSec": st["speechEnd"],
            "transcript": " ".join(u[0] for u in units),
            "asrTranscript": asr["text"],
            "words": words, "phrases": phrases,
        })
        summary.append(f"| {key} | {st['duration']:.2f} s | {st['speechStart']:.2f} | {st['speechEnd']:.2f} | "
                       f"{st['duration'] - st['speechEnd']:.2f} s | {st['longestPause']:.2f} s @ "
                       f"{st['longestPauseAt']:.2f} | {st['peakDb']:.1f} dBFS"
                       f"{' (' + str(st['clippedSamples']) + ' clipped)' if st['clippedSamples'] else ''} |")
        body += [f"## {IDS[i]} · {st['duration']:.2f} s", "",
                 f"Speech {st['speechStart']:.2f}–{st['speechEnd']:.2f} s.", "",
                 f"ASR heard: _{asr['text']}_", ""]
        for p in phrases:
            em = f"  · emphasis: {', '.join(p['emphasis'])}" if p["emphasis"] else ""
            body.append(f"- `{p['start']:6.2f}–{p['end']:6.2f}` {p['text']}{em}")
        body.append("")
        if devs:
            body.append("Differences between script and ASR (normalised tokens):")
            for d in devs:
                body.append(f"- @{d['at']:.2f} s: script “{d['script']}” · heard “{d['heard']}”")
        else:
            body.append("No differences between script and ASR.")
        body.append("")
    out["totalDurationSec"] = round(total, 3)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    m, s = divmod(total, 60)
    report += [f"Total narration: **{total:.2f} s ({int(m)}:{s:05.2f})** across 14 clips.", ""] + summary + \
              ["", NOTES] + body
    REPORT.write_text("\n".join(report) + "\n")
    print(REPORT.read_text())


if __name__ == "__main__":
    main()
