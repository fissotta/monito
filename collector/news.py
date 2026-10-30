#!/usr/bin/env python3
"""Lector de noticias de MONITO: baja titulares de fuentes RSS confiables (mundo y Chile)
y los publica como news.json en la rama `news` del repo (commit sin padre, force-push).

Corre en un servidor con salida a internet (cron cada 20 min) y usa la misma
configuracion que collector.py (~/.config/monito.env con MONITO_REPO y MONITO_TOKEN).
Solo libreria estandar. Uso:  news.py            # baja y publica
                              news.py --dry-run  # baja e imprime, sin publicar
"""
import email.utils
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

from collector import gh, load_conf   # misma carpeta

FEEDS = [   # (nombre corto, url)  -- mundo y Chile, medios con trayectoria
    ("BBC Mundo", "https://feeds.bbci.co.uk/mundo/rss.xml"),
    ("DW Español", "https://rss.dw.com/rdf/rss-sp-all"),
    ("France 24", "https://www.france24.com/es/rss"),
    ("Noticias ONU", "https://news.un.org/feed/subscribe/es/news/all/rss.xml"),
    ("El País", "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada"),
    ("Euronews", "https://es.euronews.com/rss"),
    ("La Tercera", "https://www.latercera.com/arc/outboundfeeds/rss/category/nacional/?outputType=xml"),
    ("Cooperativa", "https://www.cooperativa.cl/noticias/site/tax/port/all/rss_1___1.xml"),
    ("Radio U. de Chile", "https://radio.uchile.cl/feed/"),
]
PER_FEED, TOTAL, BRANCH, FILE = 7, 54, "news", "news.json"
UA = "Mozilla/5.0 (compatible; monito-news/1.0)"


def local(tag):
    return tag.rsplit("}", 1)[-1]


def parse_date(txt):
    if not txt:
        return None
    txt = txt.strip()
    try:
        return email.utils.parsedate_to_datetime(txt).timestamp()
    except (TypeError, ValueError):
        pass
    try:
        return datetime.fromisoformat(txt.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def parse_feed(data):
    root = ET.fromstring(data)
    out = []
    for it in root.iter():
        if local(it.tag) not in ("item", "entry"):
            continue
        title = link = date = None
        for c in it:
            n = local(c.tag)
            if n == "title" and c.text:
                title = " ".join(c.text.split())
            elif n == "link":
                link = (c.text or "").strip() or c.get("href")
            elif n in ("pubDate", "date", "updated", "published") and date is None:
                date = parse_date(c.text)
        if title and link:
            out.append({"t": title[:190], "u": link, "ts": int(date or time.time())})
    out.sort(key=lambda x: -x["ts"])
    return out[:PER_FEED]


def fetch(name, url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/rss+xml, application/xml, */*"})
        with urllib.request.urlopen(req, timeout=20) as r:
            return [dict(i, s=name) for i in parse_feed(r.read())]
    except (urllib.error.URLError, OSError, ET.ParseError, ValueError) as e:
        print("sin datos de %s: %s" % (name, e), file=sys.stderr)
        return []


def build():
    lists = [fetch(n, u) for n, u in FEEDS]
    items = []
    for i in range(PER_FEED):   # intercala las fuentes para que ninguna domine
        for lst in lists:
            if i < len(lst):
                items.append(lst[i])
    seen, uniq = set(), []
    for it in items:
        if it["u"] not in seen:
            seen.add(it["u"]); uniq.append(it)
    return {"updated": int(time.time()), "items": uniq[:TOTAL]}


def publish(cfg, data):
    tree = gh(cfg, "POST", "/git/trees", {"tree": [{"path": FILE, "mode": "100644", "type": "blob",
                                                    "content": json.dumps(data, ensure_ascii=False, separators=(",", ":"))}]})
    commit = gh(cfg, "POST", "/git/commits", {"message": "noticias", "tree": tree["sha"], "parents": []})
    try:
        gh(cfg, "PATCH", "/git/refs/heads/" + BRANCH, {"sha": commit["sha"], "force": True})
    except urllib.error.HTTPError as e:
        if e.code not in (404, 422):
            raise
        gh(cfg, "POST", "/git/refs", {"ref": "refs/heads/" + BRANCH, "sha": commit["sha"]})


STAMP = os.path.expanduser("~/.cache/monito-papers.ts")   # cuando se publicaron papers por ultima vez (el equipo puede estar apagado a las 7)


def papers_due(force):
    if force:
        return True
    if time.localtime().tm_hour < 7:
        return False
    try:
        last = float(open(STAMP).read())
    except (OSError, ValueError):
        last = 0
    return time.time() - last > 20 * 3600


def stamp_papers():
    os.makedirs(os.path.dirname(STAMP), exist_ok=True)
    open(STAMP, "w").write(str(time.time()))


def main():
    data = build()
    if not data["items"]:
        sys.exit("no se pudo bajar ninguna noticia")
    if "--dry-run" in sys.argv:
        print(json.dumps(data, ensure_ascii=False, indent=1)[:3000])
        print("total:", len(data["items"]), "de", len(FEEDS), "fuentes")
        return
    cfg = load_conf()
    for k in ("MONITO_REPO", "MONITO_TOKEN"):
        if not cfg.get(k):
            sys.exit("falta %s" % k)
    time.sleep(random.uniform(0, 8))
    publish(cfg, data)
    try:   # el feed de papers viaja en el mismo cron, pero se consulta una vez al dia: la primera vez que corra despues de las 07:00 y hayan pasado >20 h
        import papers
        if papers_due("--papers" in sys.argv) and papers.run(cfg):
            stamp_papers()
    except Exception as e:   # noqa: BLE001 - que un fallo de papers no tumbe las noticias
        print("papers: %s" % e, file=sys.stderr)


if __name__ == "__main__":
    main()
