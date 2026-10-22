#!/usr/bin/env python3
"""Colector de MONITO: mide CPU/RAM/uptime/load/temp y lo publica en GitHub.

Solo usa la libreria estandar. Los equipos comparten el archivo data.json de la rama
`data` (un commit sin padre, force-push), asi la pagina lee todo con una sola
llamada a la API y el historial del repo no crece.

Config (variables de entorno o archivo KEY=VALUE, por defecto
~/.config/monito.env):
  MONITO_REPO   owner/repo
  MONITO_TOKEN  token fine-grained con permiso Contents: read/write sobre el repo
  MONITO_NAME   akaza | ymir | inozuke   (por defecto: hostname)
  MONITO_OFFSET segundos de espera antes de publicar (escalonar equipos: 0, 20, 40)

Uso:  collector.py            # mide y publica
      collector.py --dry-run  # mide e imprime el JSON, sin publicar
"""
import glob
import json
import os
import random
import socket
import sys
import time
import urllib.error
import urllib.request

CONF = os.path.expanduser(os.environ.get("MONITO_CONF", "~/.config/monito.env"))
SAMPLE_SECONDS = 1.0
JITTER_SECONDS = 10
BRANCH, FILE = "data", "data.json"


def load_conf():
    cfg = {}
    if os.path.exists(CONF):
        for line in open(CONF):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                cfg[k.strip()] = v.strip().strip("'\"")
    for k in ("MONITO_REPO", "MONITO_TOKEN", "MONITO_NAME", "MONITO_OFFSET"):
        if k in os.environ:
            cfg[k] = os.environ[k]
    cfg.setdefault("MONITO_NAME", socket.gethostname().split(".")[0].lower())
    return cfg


def read_cpu():
    """Devuelve {'cpu': (idle, total), 'cpu0': (...), ...}."""
    out = {}
    with open("/proc/stat") as f:
        for line in f:
            if not line.startswith("cpu"):
                break
            p = line.split()
            v = list(map(int, p[1:9]))  # user nice system idle iowait irq softirq steal
            out[p[0]] = (v[3] + v[4], sum(v))
    return out


def cpu_usage():
    a = read_cpu()
    time.sleep(SAMPLE_SECONDS)
    b = read_cpu()
    pct = {}
    for k in a:
        di, dt = b[k][0] - a[k][0], b[k][1] - a[k][1]
        pct[k] = round(100.0 * (1 - di / dt), 1) if dt > 0 else 0.0
    cores = [pct[k] for k in sorted((k for k in pct if k != "cpu"), key=lambda s: int(s[3:]))]
    return pct["cpu"], cores


def mem_usage():
    m = {}
    with open("/proc/meminfo") as f:
        for line in f:
            k, v = line.split(":")
            m[k] = int(v.split()[0])  # kB
    total, avail = m["MemTotal"], m["MemAvailable"]
    return round(100.0 * (total - avail) / total, 1), round(total / 1048576, 1)


def read_temp_file(path):
    try:
        return int(open(path).read()) / 1000.0
    except (OSError, ValueError):
        return None


def cpu_temp():
    """Promedio de la temperatura de los cores (Intel coretemp / AMD k10temp)."""
    core, pkg = [], []
    for hw in glob.glob("/sys/class/hwmon/hwmon*"):
        try:
            name = open(hw + "/name").read().strip()
        except OSError:
            continue
        if name not in ("coretemp", "k10temp", "zenpower", "cpu_thermal"):
            continue
        for inp in glob.glob(hw + "/temp*_input"):
            try:
                label = open(inp.replace("_input", "_label")).read().strip()
            except OSError:
                label = ""
            t = read_temp_file(inp)
            if t is None:
                continue
            (core if label.startswith("Core") else pkg).append(t)
    vals = core or pkg
    if not vals:
        for z in glob.glob("/sys/class/thermal/thermal_zone*"):
            try:
                if open(z + "/type").read().strip() in ("x86_pkg_temp", "cpu-thermal"):
                    t = read_temp_file(z + "/temp")
                    if t is not None:
                        vals.append(t)
            except OSError:
                pass
    return round(sum(vals) / len(vals), 1) if vals else None


def measure(name):
    cpu, cores = cpu_usage()
    ram, ram_gb = mem_usage()
    load = open("/proc/loadavg").read().split()
    return {
        "name": name,
        "ts": int(time.time()),
        "uptime": int(float(open("/proc/uptime").read().split()[0])),
        "cpu": cpu,
        "cores": cores,
        "ram": ram,
        "ram_gb": ram_gb,
        "load": [float(x) for x in load[:3]],
        "temp": cpu_temp(),
    }


def gh(cfg, method, path, body=None):
    req = urllib.request.Request(
        "https://api.github.com/repos/%s%s" % (cfg["MONITO_REPO"], path),
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={
            "Authorization": "Bearer " + cfg["MONITO_TOKEN"],
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "monito-collector",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def read_all(cfg):
    """Lee el data.json actual de la rama `data` (todos los equipos)."""
    req = urllib.request.Request(
        "https://api.github.com/repos/%s/contents/%s?ref=%s" % (cfg["MONITO_REPO"], FILE, BRANCH),
        headers={"Authorization": "Bearer " + cfg["MONITO_TOKEN"],
                 "Accept": "application/vnd.github.raw+json", "User-Agent": "monito-collector"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {}
        raise
    except ValueError:
        return {}


def write_all(cfg, allm):
    tree = gh(cfg, "POST", "/git/trees", {"tree": [
        {"path": FILE, "mode": "100644", "type": "blob",
         "content": json.dumps(allm, separators=(",", ":"))}]})
    commit = gh(cfg, "POST", "/git/commits",
                {"message": "datos", "tree": tree["sha"], "parents": []})
    try:
        gh(cfg, "PATCH", "/git/refs/heads/" + BRANCH, {"sha": commit["sha"], "force": True})
    except urllib.error.HTTPError as e:
        if e.code not in (404, 422):
            raise
        try:
            gh(cfg, "POST", "/git/refs", {"ref": "refs/heads/" + BRANCH, "sha": commit["sha"]})
        except urllib.error.HTTPError as e2:
            if e2.code != 422:   # otro equipo creo la rama justo antes
                raise
            gh(cfg, "PATCH", "/git/refs/heads/" + BRANCH, {"sha": commit["sha"], "force": True})


def publish(cfg, data):
    # Los equipos comparten data.json (leer, agregar lo propio, escribir). Para no
    # pisarse cada uno espera un desfase fijo (MONITO_OFFSET) y luego verifica que
    # su dato quedo; si otro escribio justo antes, reintenta.
    time.sleep(float(cfg.get("MONITO_OFFSET", random.uniform(0, JITTER_SECONDS))))
    for attempt in range(4):
        allm = read_all(cfg)
        allm[data["name"]] = data
        write_all(cfg, allm)
        time.sleep(2)
        if read_all(cfg).get(data["name"], {}).get("ts") == data["ts"]:
            return
        time.sleep(random.uniform(1, 6))
    sys.exit("el dato de %s no quedo publicado tras reintentos" % data["name"])


def main():
    cfg = load_conf()
    data = measure(cfg["MONITO_NAME"])
    if "--dry-run" in sys.argv:
        print(json.dumps(data, indent=2))
        return
    for k in ("MONITO_REPO", "MONITO_TOKEN"):
        if not cfg.get(k):
            sys.exit("falta %s (ver %s)" % (k, CONF))
    try:
        publish(cfg, data)
    except (urllib.error.URLError, OSError) as e:
        sys.exit("no se pudo publicar: %s" % e)


if __name__ == "__main__":
    main()
