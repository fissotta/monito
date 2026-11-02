#!/usr/bin/env python3
"""Feed MEL de MONITO: los papers del laboratorio (Microbial Ecophysiology Lab), es decir los de R. Quatrini en PubMed
(la busqueda con la que se armaron los temas del feed de papers). Se publican como mel.json en la rama `mel`
(commit sin padre, force-push), con abstract, para que la pagina los muestre en su cinta «MEL».

Lo ejecuta news.py (mismo cron) una vez por semana. Solo libreria estandar. Uso:
  mel.py            # baja y publica
  mel.py --dry-run  # baja e imprime, sin publicar
"""
import json
import sys
import time
import urllib.error
import xml.etree.ElementTree as ET

from collector import gh, load_conf
from papers import EUTILS, get

BRANCH, FILE = "mel", "mel.json"
TERM = '"Quatrini R"[Author]'   # todos los resultados son de Raquel Quatrini (revisado a mano el 2026-11)
MESES = {"Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6, "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12}


def build():
    ids = get(EUTILS + "esearch.fcgi", {"db": "pubmed", "term": TERM, "retmax": 200, "sort": "pub_date", "retmode": "json"})["esearchresult"]["idlist"]
    root = ET.fromstring(get(EUTILS + "efetch.fcgi", {"db": "pubmed", "id": ",".join(ids), "retmode": "xml"}, False))
    items = []
    for a in root.iter("PubmedArticle"):
        pmid = a.findtext(".//PMID")
        title = " ".join("".join(a.find(".//ArticleTitle").itertext()).split())
        abstract = " ".join((x.get("Label") + ": " if x.get("Label") else "") + "".join(x.itertext()) for x in a.iter("AbstractText"))
        authors = [au.findtext("LastName") for au in a.iter("Author") if au.findtext("LastName")]
        full = ", ".join((au.findtext("LastName") + " " + (au.findtext("Initials") or "")).strip() for au in a.iter("Author") if au.findtext("LastName"))
        y = a.findtext(".//ArticleDate/Year") or a.findtext(".//PubDate/Year") or (a.findtext(".//PubDate/MedlineDate") or "")[:4]
        mo = a.findtext(".//ArticleDate/Month") or a.findtext(".//PubDate/Month") or "1"
        d = a.findtext(".//ArticleDate/Day") or a.findtext(".//PubDate/Day") or "1"
        mo = MESES.get(mo, mo)
        try:
            ts = int(time.mktime((int(y), int(mo), int(d), 12, 0, 0, 0, 0, -1)))
        except (TypeError, ValueError):
            ts = int(time.time())
        items.append({"t": title[:220], "u": "https://pubmed.ncbi.nlm.nih.gov/%s/" % pmid, "ts": ts, "y": y, "k": "MEL",
                      "s": (a.findtext(".//Journal/ISOAbbreviation") or "PubMed")[:40],
                      "a": (authors[0] + (" et al." if len(authors) > 1 else "")) if authors else "", "al": full[:1500], "ab": " ".join(abstract.split())[:1800]})
    items.sort(key=lambda x: -x["ts"])
    return {"updated": int(time.time()), "items": items}


def publish(cfg, data):
    tree = gh(cfg, "POST", "/git/trees", {"tree": [{"path": FILE, "mode": "100644", "type": "blob", "content": json.dumps(data, ensure_ascii=False, separators=(",", ":"))}]})
    commit = gh(cfg, "POST", "/git/commits", {"message": "mel", "tree": tree["sha"], "parents": []})
    try:
        gh(cfg, "PATCH", "/git/refs/heads/" + BRANCH, {"sha": commit["sha"], "force": True})
    except urllib.error.HTTPError as e:
        if e.code not in (404, 422):
            raise
        gh(cfg, "POST", "/git/refs", {"ref": "refs/heads/" + BRANCH, "sha": commit["sha"]})


def run(cfg=None, dry=False):
    try:
        data = build()
    except (urllib.error.URLError, OSError, ET.ParseError, ValueError, KeyError) as e:
        print("sin datos de PubMed (MEL): %s" % e, file=sys.stderr)
        return False
    if not data["items"]:
        return False
    if dry:
        for i in data["items"][:8]:
            print(i["y"], i["a"], "|", i["s"], "|", i["t"][:90])
        print("total:", len(data["items"]), "con abstract:", sum(1 for i in data["items"] if i["ab"]))
        return False
    publish(cfg, data)
    return True


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    run(None if dry else load_conf(), dry)
