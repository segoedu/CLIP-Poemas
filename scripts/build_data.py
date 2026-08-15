# -*- coding: utf-8 -*-
"""
build_data.py — Genera los archivos de datos de la web desde un CSV de
afinidades Jina-CLIP v2 (completo o ligero).

A partir del CSV indicado (el mapa poeta -> JSON se resuelve dinámicamente
desde poetas.json, por lo que vale tanto para el corpus completo como para el
ligero) escribe, siempre con su versión .gz precomprimida para servir con
Content-Encoding: gzip (ver serve.py):

  <prefijo>.js          -> dataset completo  (window.APP_DATA)
  <prefijo>_home.js     -> resúmenes de inicio (window.APP_DATA_HOME):
                           metadatos + poemas + top-3 pintores/poetas y
                           parejas precalculadas + simStats + la obra más
                           afín de cada poema (para la galería inmersiva).

Uso:
  python build_data.py [ruta_al_csv] [--out PREFIJO]
    ruta_al_csv   Por defecto: data/afinidades_jinaclipv2_obrapoema.csv.
                  Acepta el CSV plano o comprimido (.gz o .zip): se detecta
                  por contenido y se descomprime a un temporal que se borra
                  al terminar.
    --out PREFIJO Por defecto: data  ->  data.js, data.js.gz,
                                          data_home.js, data_home.js.gz
"""

import argparse
import csv
import gzip
import json
import re
import shutil
import unicodedata
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
CORPUS = ROOT / "corpus"

DEFAULT_CSV = ROOT / "data" / "afinidades_jinaclipv2_obrapoema.zip"


def normalize(s):
    """Normaliza un texto para comparar: baja, colapsa espacios, unifica
    guiones/rayas y elimina la diacrítica. Conserva solo alfanuméricos y espacio."""
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower()
    s = re.sub(r"[\u2013\u2014\u2015\u2212\u2011-]", "-", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def fragment_core(frag):
    """Quita el marcador de truncado '...' del fragmento del CSV."""
    f = frag.strip()
    if f.endswith("..."):
        f = f[:-3].strip()
    return f


def load_poet_poems(poetas_raw, poet_name):
    """Devuelve (poemas, profile) de un poeta resolviendo dinámicamente su
    archivo poets/<directory>.json, o (None, None) si el poeta no existe en
    poetas.json o no tiene archivo. 'poemas' es la lista
    [ {title, year, text, norm} ]; 'profile' es la url del perfil, o None."""
    dirname = None
    for p in poetas_raw:
        if p["name"] == poet_name:
            dirname = p["directory"]
            break
    if not dirname:
        print(f"  ! Sin entrada en poetas.json para '{poet_name}'")
        return None, None
    path = CORPUS / "poets" / f"{dirname}.json"
    if not path.exists():
        print(f"  ! No existe poets/{dirname}.json para '{poet_name}'")
        return None, None
    with open(path, "r", encoding="utf-8-sig") as fh:
        data = json.load(fh)
    lst = []
    for p in data.get("poems", []):
        text = p.get("text", "") or ""
        lst.append(
            {
                "title": (p.get("title") or "").strip(),
                "year": (p.get("year") or p.get("book") or "").strip(),
                "text": text,
                "norm": normalize(text),
            }
        )
    profile = (data.get("profile") or "").strip() or None
    return lst, profile


def match_fragment(candidates, frag):
    """Empareja un fragmento con el primer poema cuyo texto normalizado empiece
    por el prefijo de 80 caracteres (con fallback a 50). Devuelve el índice del
    poema o None."""
    core = normalize(fragment_core(frag))
    if not core:
        return None
    prefix = core[:80]
    for i, pm in enumerate(candidates):
        if pm["norm"].startswith(prefix):
            return i
    prefix50 = core[:50]
    for i, pm in enumerate(candidates):
        if pm["norm"].startswith(prefix50):
            return i
    return None


def build_dataset(csv_path):
    """Lee el CSV, cruza con pintores.json / poetas.json / poets/*.json y
    devuelve el dataset completo."""
    print(f"Leyendo CSV: {csv_path.name}")

    with open(CORPUS / "pintores.json", "r", encoding="utf-8-sig") as fh:
        pintores_raw = json.load(fh)
    with open(CORPUS / "poetas.json", "r", encoding="utf-8-sig") as fh:
        poetas_raw = json.load(fh)

    pintores = {}
    for p in pintores_raw:
        pintores[p["directory"]] = {
            "dir": p["directory"],
            "name": p["name"],
            "gender": p["gender"],
            "period": p["period"],
            "region": p["region"],
            "works": [w["file"] for w in p["works"]],
        }

    poetas = {}
    for p in poetas_raw:
        poetas[p["name"]] = {
            "dir": p["directory"],
            "name": p["name"],
            "gender": p["gender"],
            "period": p["period"],
            "region": p["region"],
            "profile": p.get("profile"),
        }

    # --- CSV de afinidades ---------------------------------------------------
    rows = []
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as fh:
        for r in csv.DictReader(fh):
            rows.append(
                {
                    "pintor": (r.get("Pintor") or "").strip(),
                    "obra": (r.get("Obra") or "").strip(),
                    "poeta": (r.get("Poeta") or "").strip(),
                    "fragmento": r.get("Poema_Fragmento") or "",
                    "sim": float(r.get("Similitud_Coseno") or 0),
                }
            )
    print(f"Filas CSV: {len(rows)}")

    # --- Textos de poemas (cargados a demanda, cacheados por poeta) ----------
    poemas_cache = {}  # poet_name -> (poems, profile) | (None, None)

    def load_poems(poet_name):
        if poet_name not in poemas_cache:
            poems, profile = load_poet_poems(poetas_raw, poet_name)
            poemas_cache[poet_name] = (poems, profile)
            print(f"  Poemas cargados para {poet_name}: {len(poems) if poems else 0}")
        return poemas_cache[poet_name][0]

    # --- Emparejado fragmento -> poema (cacheado por poeta+fragmento) ---------
    match_cache = {}  # (poet_name, fragmento) -> idx | None
    afinidades = []
    matched = 0
    unmatched = {}
    missing_poets = set()

    for r in rows:
        key = (r["poeta"], r["fragmento"])
        if key not in match_cache:
            candidates = load_poems(r["poeta"])
            if candidates is None:
                missing_poets.add(r["poeta"])
                match_cache[key] = None
            else:
                match_cache[key] = match_fragment(candidates, r["fragmento"])
        idx = match_cache[key]
        if idx is None:
            unmatched[r["poeta"]] = unmatched.get(r["poeta"], 0) + 1
            continue
        matched += 1
        afinidades.append(
            {
                "pintor": r["pintor"],
                "obra": r["obra"],
                "poeta": r["poeta"],
                "sim": round(r["sim"], 6),
                "p": idx,
            }
        )

    if missing_poets:
        print("  ! Poetas sin poemas cargados:", sorted(missing_poets))
    print(f"Filas emparejadas a poema: {matched} / {len(rows)}")
    if unmatched:
        print("  ! Sin emparejar:", unmatched)

    # --- Construcción del dataset -------------------------------------------
    used_pintores = sorted({a["pintor"] for a in afinidades})
    used_poetas = sorted({a["poeta"] for a in afinidades})

    return {
        "meta": {
            "csv": csv_path.name,
            "rows": len(rows),
            "rows_matched": matched,
        },
        "pintores": [pintores[d] for d in used_pintores],
        "poetas": [
            {
                "name": p["name"],
                "gender": p["gender"],
                "period": p["period"],
                "region": p["region"],
                "profile": (poemas_cache[p["name"]][1] or p.get("profile")),
                "poems": [
                    {"title": pm["title"], "year": pm["year"], "text": pm["text"]}
                    for pm in (poemas_cache[p["name"]][0] or [])
                ],
            }
            for p in (poetas[po] for po in used_poetas)
        ],
        "afinidades": afinidades,
    }


def build_home_dataset(dataset):
    """Deriva del dataset completo el dataset de inicio: metadatos + poemas +
    top-3 de pintores/poetas (media) y de parejas, y estadísticas de similitud."""
    pintores = dataset["pintores"]
    poetas = dataset["poetas"]
    afinidades = dataset["afinidades"]

    sims = sorted(a["sim"] for a in afinidades)
    n = len(sims)
    q = lambda f: sims[min(n - 1, int(f * (n - 1)))]
    sim_stats = {"max": sims[-1], "min": sims[0], "q1": q(0.25), "q2": q(0.5), "q3": q(0.75)}

    sums = defaultdict(float)
    cnts = defaultdict(int)
    poem_best = {}  # (poeta, pintor, poema) -> afinidad máxima (sentido poeta)
    work_best = {}  # (poeta, pintor, obra) -> afinidad máxima (sentido pintor)
    best_of_poem = {}  # (poeta, poema) -> afinidad máxima entre todo el corpus
    for a in afinidades:
        key = (a["poeta"], a["pintor"])
        sums[key] += a["sim"]
        cnts[key] += 1
        kp = (key[0], key[1], a["p"])
        if a["sim"] > poem_best.get(kp, -1.0):
            poem_best[kp] = a["sim"]
        kw = (key[0], key[1], a["obra"])
        if a["sim"] > work_best.get(kw, -1.0):
            work_best[kw] = a["sim"]
        kb = (a["poeta"], a["p"])
        cur = best_of_poem.get(kb)
        if cur is None or a["sim"] > cur["sim"]:
            best_of_poem[kb] = a

    # Media "mejor caso" por pareja: por poema con su obra más afín (poeta) y
    # por obra con su poema más afín (pintor).
    best_poet_sum = defaultdict(float)
    best_poet_cnt = defaultdict(int)
    best_painter_sum = defaultdict(float)
    best_painter_cnt = defaultdict(int)
    for (poeta, pintor, _p), sim in poem_best.items():
        key = (poeta, pintor)
        best_poet_sum[key] += sim
        best_poet_cnt[key] += 1
    for (poeta, pintor, _o), sim in work_best.items():
        key = (poeta, pintor)
        best_painter_sum[key] += sim
        best_painter_cnt[key] += 1

    best_pairs = {}
    for a in afinidades:
        key = (a["poeta"], a["pintor"], a["obra"])
        cur = best_pairs.get(key)
        if cur is None or a["sim"] > cur["sim"]:
            best_pairs[key] = a

    for poeta in poetas:
        rows = []
        for pintor in pintores:
            key = (poeta["name"], pintor["dir"])
            if not cnts[key]:
                continue
            value = sums[key] / cnts[key]
            if value <= 0:
                continue
            best_poet = best_poet_sum[key] / best_poet_cnt[key] if best_poet_cnt[key] else 0
            rows.append(
                {"dir": pintor["dir"], "name": pintor["name"], "value": round(value, 6), "best": round(best_poet, 6)}
            )
        rows.sort(key=lambda r: r["best"], reverse=True)
        poeta["topPainters"] = rows[:3]
        pp = [best_pairs[k] for k in best_pairs if k[0] == poeta["name"]]
        pp.sort(key=lambda a: a["sim"], reverse=True)
        poeta["topPairs"] = pp[:3]

        # Obra más afín de cada poema, alineada con el índice de poeta["poems"]:
        # es lo que alimenta la galería inmersiva sin descargar el corpus completo.
        best = []
        for i in range(len(poeta["poems"])):
            a = best_of_poem.get((poeta["name"], i))
            best.append(None if a is None else {"pintor": a["pintor"], "obra": a["obra"], "sim": a["sim"]})
        poeta["best"] = best

    for pintor in pintores:
        rows = []
        for poeta in poetas:
            key = (poeta["name"], pintor["dir"])
            if not cnts[key]:
                continue
            value = sums[key] / cnts[key]
            if value <= 0:
                continue
            best_painter = best_painter_sum[key] / best_painter_cnt[key] if best_painter_cnt[key] else 0
            rows.append({"name": poeta["name"], "value": round(value, 6), "best": round(best_painter, 6)})
        rows.sort(key=lambda r: r["best"], reverse=True)
        pintor["topPoets"] = rows[:3]
        pp = [best_pairs[k] for k in best_pairs if k[1] == pintor["dir"]]
        pp.sort(key=lambda a: a["sim"], reverse=True)
        pintor["topPairs"] = pp[:3]

    return {
        "meta": {
            **dataset["meta"],
            "pintores": len(pintores),
            "poetas": len(poetas),
            "afinidades": len(afinidades),
        },
        "simStats": sim_stats,
        "pintores": pintores,
        "poetas": poetas,
    }


def write_js(path, obj, wrapper):
    """Escribe <archivo>.js y su versión <archivo>.js.gz comprimida."""
    js = wrapper + json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + ";\n"
    blob = js.encode("utf-8")
    path.write_text(js, encoding="utf-8")
    gz_path = Path(str(path) + ".gz")
    gz_path.write_bytes(gzip.compress(blob, 6))
    print(
        f"  {path.name}: {len(blob):,} bytes"
        f" -> {gz_path.name}: {gz_path.stat().st_size:,} bytes"
    )


def resolve_csv(csv_path):
    """Devuelve (csv_plano, limpiar). Si el archivo está comprimido (gzip o
    zip, detectado por magic bytes, no por extensión) lo descomprime a un .csv
    junto al original; limpiar() borra ese temporal tras generar los datos."""
    with open(csv_path, "rb") as fh:
        magic = fh.read(4)
    if magic[:2] != b"\x1f\x8b" and magic[:4] != b"PK\x03\x04":
        return csv_path, lambda: None
    tmp = csv_path
    while tmp.suffix.lower() in (".gz", ".gzip", ".zip", ".z"):
        tmp = tmp.with_suffix("")
    if tmp.suffix.lower() != ".csv":
        tmp = tmp.with_name(tmp.name + ".csv")
    if magic[:2] == b"\x1f\x8b":
        with gzip.open(csv_path, "rb") as fin, open(tmp, "wb") as fout:
            shutil.copyfileobj(fin, fout, 1024 * 1024)
    else:
        with zipfile.ZipFile(csv_path) as z:
            entries = [n for n in z.namelist() if not n.endswith("/")]
            if not entries:
                raise ValueError(f"El zip {csv_path.name} no contiene archivos")
            with z.open(entries[0]) as fin, open(tmp, "wb") as fout:
                shutil.copyfileobj(fin, fout, 1024 * 1024)
    return tmp, lambda: tmp.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "csv",
        nargs="?",
        default=str(DEFAULT_CSV),
        help="Ruta al CSV de afinidades (por defecto: " + DEFAULT_CSV.name + ")",
    )
    parser.add_argument(
        "--out",
        default="data",
        help="Prefijo de los archivos de salida (por defecto: data)",
    )
    args = parser.parse_args()
    csv_path = Path(args.csv)
    prefix = args.out

    flat, limpiar = resolve_csv(csv_path)
    try:
        dataset = build_dataset(flat)
    finally:
        limpiar()
    print(
        f"Dataset: {len(dataset['pintores'])} pintores, "
        f"{len(dataset['poetas'])} poetas, "
        f"{sum(len(p['poems']) for p in dataset['poetas'])} poemas, "
        f"{len(dataset['afinidades'])} afinidades."
    )

    print("Escribiendo dataset completo:")
    write_js(WEB / f"{prefix}.js", dataset, "window.APP_DATA = ")

    print("Escribiendo resúmenes de inicio (home):")
    home = build_home_dataset(dataset)
    write_js(WEB / f"{prefix}_home.js", home, "window.APP_DATA_HOME = ")

    print("Listo.")


if __name__ == "__main__":
    main()
