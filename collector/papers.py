#!/usr/bin/env python3
"""Feed de papers de MONITO: busca en PubMed (NCBI) y en Europe PMC (preprints de bioRxiv, etc.)
trabajos recientes sobre los temas del laboratorio y los publica como papers.json en la rama
`papers` del repo (commit sin padre, force-push).

Los temas salen de los abstracts de los trabajos de R. Quatrini (acidofilos, Acidithiobacillus,
biominería, genomica comparada, metagenomica, elementos geneticos moviles...). Lo ejecuta news.py
(mismo cron) o se puede correr a mano. Solo libreria estandar. Uso:
  papers.py            # baja y publica
  papers.py --dry-run  # baja e imprime, sin publicar
"""
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

from collector import gh, load_conf

EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
EPMC = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
BRANCH, FILE = "papers", "papers.json"
UA = "monito-papers/1.0 (lab feed)"
DAYS, PER_TOPIC, TOTAL = 365, 14, 70

# (etiqueta, consulta PubMed)
TOPICS = [
    ("Quatrini", '"Quatrini R"[Author]'),
    ("Acidófilos", "(acidophil*[tiab] OR Acidithiobacill*[tiab] OR Acidithiobacillia[tiab] OR Leptospirillum[tiab] OR Sulfobacillus[tiab] OR Ferroplasma[tiab] OR acidophilic[tiab])"),
    ("Biominería", "(bioleaching[tiab] OR biomining[tiab] OR \"acid mine drainage\"[tiab] OR \"acid rock drainage\"[tiab] OR biohydrometallurgy[tiab])"),
    ("Hierro y azufre", "(\"iron-oxidizing bacteria\"[tiab] OR \"sulfur-oxidizing bacteria\"[tiab] OR \"iron-oxidising\"[tiab] OR \"Fe(II) oxidation\"[tiab] OR \"sulfur oxidation\"[tiab] OR \"iron oxidation\"[tiab]) AND (bacteri*[tiab] OR archaea*[tiab] OR microb*[tiab])"),
    ("Metagenómica", "(metagenom*[tiab] AND (acidophil*[tiab] OR extremophil*[tiab] OR \"mine drainage\"[tiab] OR bioleaching[tiab] OR \"hot spring\"[tiab] OR Atacama[tiab] OR \"acidic\"[tiab] OR thermophil*[tiab]))"),
    ("Genómica", "((comparative genomics[tiab] OR phylogenomic*[tiab] OR pangenome*[tiab] OR \"metagenome-assembled genome*\"[tiab]) AND (extremophil*[tiab] OR acidophil*[tiab] OR Acidithiobacill*[tiab] OR thermophil*[tiab] OR Archaea[tiab] OR Proteobacteria[tiab]))"),
    ("Extremófilos", "(extremophil*[tiab] AND (microb*[tiab] OR bacteri*[tiab] OR archaea*[tiab]) AND (genom*[tiab] OR ecology[tiab] OR evolution[tiab] OR metabol*[tiab]))"),
    ("Elementos móviles", "((mobile genetic element*[tiab] OR CRISPR[tiab] OR plasmid*[tiab] OR \"horizontal gene transfer\"[tiab]) AND (acidophil*[tiab] OR Acidithiobacill*[tiab] OR extremophil*[tiab]))"),
]
EPMC_TOPICS = [
    ("Acidófilos", '(Acidithiobacill* OR "acidophilic bacteria" OR "acidophilic archaea" OR "acidophilic microorganisms" OR acidophiles OR "acid mine drainage" OR bioleaching OR biomining)'),
    ("Metagenómica", '(metagenom* AND (acidophil* OR extremophil* OR "mine drainage" OR bioleaching OR "hot spring" OR thermophil*))'),
    ("Genómica", '(("comparative genomics" OR phylogenomic* OR "metagenome-assembled genomes") AND (extremophil* OR acidophil* OR Acidithiobacill* OR thermophil*))'),
]
# palabras clave del laboratorio (sacadas de los abstracts de R. Quatrini); un trabajo entra si junta KEY_MIN o mas
KEYWORDS = ["acidophil", "acidithiobacill", "ferrooxidans", "bioleach", "biomining", "mine drainage", "iron-oxid", "sulfur-oxid", "sulphur-oxid", "extremophil",
            "metagenom", "metagenome-assembled", "genom", "phylogen", "pangenom", "mobile genetic", "crispr", "horizontal gene transfer", "thermophil", "archaea",
            "microbial", "bacteri", "16s", "extreme environment", "acidic", "sulfur", "iron"]
KEY_MIN = 4


def score(text):
    t = text.lower()
    return sum(1 for k in KEYWORDS if k in t)


TAGS = [   # para etiquetar segun el texto
    ("Acidithiobacillus", r"acidithiobacill"), ("Acidófilos", r"acidophil"), ("Biominería", r"bioleach|biomining|mine drainage|biohydromet"),
    ("Hierro y azufre", r"iron.oxid|sulfur.oxid|iron-sulfur|sulphur"), ("Metagenómica", r"metagenom"), ("Genómica", r"genomic|pangenom|phylogenom"),
    ("Extremófilos", r"extremophil"), ("Elementos móviles", r"mobile genetic|crispr|plasmid"),
]


def get(url, params, as_json=True):
    req = urllib.request.Request(url + "?" + urllib.parse.urlencode(params), headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
    return json.loads(data) if as_json else data


def tag_of(text, default):
    for name, rx in TAGS:
        if re.search(rx, text, re.I):
            return name
    return default


def pubmed(label, term):
    try:
        ids = get(EUTILS + "esearch.fcgi", {"db": "pubmed", "term": term, "retmax": PER_TOPIC, "sort": "pub_date", "retmode": "json",
                                            "datetype": "pdat", "reldate": DAYS if label != "Quatrini" else 3650})["esearchresult"]["idlist"]
        if not ids:
            return []
        root = ET.fromstring(get(EUTILS + "efetch.fcgi", {"db": "pubmed", "id": ",".join(ids), "retmode": "xml"}, False))
    except (urllib.error.URLError, OSError, ET.ParseError, ValueError, KeyError) as e:
        print("sin datos de PubMed (%s): %s" % (label, e), file=sys.stderr)
        return []
    out = []
    for a in root.iter("PubmedArticle"):
        pmid = a.findtext(".//PMID")
        title = " ".join("".join(a.find(".//ArticleTitle").itertext()).split())
        abstract = " ".join("".join(x.itertext()) for x in a.iter("AbstractText"))
        authors = [au.findtext("LastName") for au in a.iter("Author") if au.findtext("LastName")]
        y = a.findtext(".//ArticleDate/Year") or a.findtext(".//PubDate/Year") or (a.findtext(".//PubDate/MedlineDate") or "")[:4]
        mo = a.findtext(".//ArticleDate/Month") or a.findtext(".//PubDate/Month") or "1"
        d = a.findtext(".//ArticleDate/Day") or a.findtext(".//PubDate/Day") or "1"
        mo = {"Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6, "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12}.get(mo, mo)
        try:
            ts = int(time.mktime((int(y), int(mo), int(d), 12, 0, 0, 0, 0, -1)))
        except (TypeError, ValueError):
            ts = int(time.time())
        out.append({"t": title[:200], "u": "https://pubmed.ncbi.nlm.nih.gov/%s/" % pmid, "ts": ts, "s": (a.findtext(".//Journal/ISOAbbreviation") or "PubMed")[:40],
                    "a": (authors[0] + (" et al." if len(authors) > 1 else "")) if authors else "", "k": "Quatrini" if label == "Quatrini" else tag_of(title + " " + abstract, label),
                    "q": "Quatrini" in authors, "n": score(title + " " + abstract)})
    return out


def europepmc():   # preprints (bioRxiv, etc.)
    out = []
    since = time.strftime("%Y-%m-%d", time.gmtime(time.time() - DAYS * 86400))
    for label, q in EPMC_TOPICS:
        try:
            d = get(EPMC, {"query": "%s AND SRC:PPR AND FIRST_PDATE:[%s TO 2100-01-01]" % (q, since), "format": "json", "pageSize": 8, "sort": "P_PDATE_D desc", "resultType": "lite"})
        except (urllib.error.URLError, OSError, ValueError) as e:
            print("sin datos de Europe PMC (%s): %s" % (label, e), file=sys.stderr)
            continue
        for r in d.get("resultList", {}).get("result", []):
            if not r.get("title"):
                continue
            link = "https://doi.org/" + r["doi"] if r.get("doi") else "https://europepmc.org/article/%s/%s" % (r.get("source", "PPR"), r.get("id"))
            try:
                ts = int(time.mktime(time.strptime(r.get("firstPublicationDate", "")[:10], "%Y-%m-%d")))
            except ValueError:
                ts = int(time.time())
            au = (r.get("authorString") or "").split(",")[0].strip().rstrip(".")
            out.append({"t": " ".join(re.sub(r"<[^>]+>", "", r["title"]).split())[:200], "u": link, "ts": ts, "s": (r.get("bookOrReportDetails") or {}).get("publisher") or "Preprint",
                        "a": au + (" et al." if "," in (r.get("authorString") or "") else ""), "k": tag_of(r["title"], label), "q": "Quatrini" in (r.get("authorString") or ""), "p": 1, "n": score(r["title"]) + 3})
        time.sleep(.4)
    return out


def build():
    items = []
    for label, term in TOPICS:
        items += pubmed(label, term)
        time.sleep(.5)   # NCBI pide <= 3 consultas por segundo sin clave
    items += europepmc()
    seen, uniq = set(), []
    for it in sorted([i for i in items if i["q"] or i["n"] >= KEY_MIN], key=lambda x: -x["ts"]):
        key = re.sub(r"\W+", "", it["t"].lower())[:80]
        if key in seen:
            continue
        seen.add(key); uniq.append(it)
    # los de Quatrini se muestran siempre (los 6 mas recientes); el resto, por fecha
    q = [i for i in uniq if i["q"]][:6]
    rest = [i for i in uniq if i not in q][:TOTAL - len(q)]
    final = sorted(q + rest, key=lambda x: -x["ts"])
    return {"updated": int(time.time()), "items": final}


def publish(cfg, data):
    tree = gh(cfg, "POST", "/git/trees", {"tree": [{"path": FILE, "mode": "100644", "type": "blob", "content": json.dumps(data, ensure_ascii=False, separators=(",", ":"))}]})
    commit = gh(cfg, "POST", "/git/commits", {"message": "papers", "tree": tree["sha"], "parents": []})
    try:
        gh(cfg, "PATCH", "/git/refs/heads/" + BRANCH, {"sha": commit["sha"], "force": True})
    except urllib.error.HTTPError as e:
        if e.code not in (404, 422):
            raise
        gh(cfg, "POST", "/git/refs", {"ref": "refs/heads/" + BRANCH, "sha": commit["sha"]})


def run(cfg=None, dry=False):
    data = build()
    if not data["items"]:
        print("no se pudo bajar ningun paper", file=sys.stderr)
        return
    if dry:
        for i in data["items"][:25]:
            print(time.strftime("%Y-%m-%d", time.localtime(i["ts"])), "[%s]%s" % (i["k"], "★" if i["q"] else ""), i["a"], "|", i["s"], "|", i["t"][:90])
        print("total:", len(data["items"]))
        return
    publish(cfg, data)


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    cfg = None if dry else load_conf()
    run(cfg, dry)
