# MONITO

Monitor en tiempo real de **akaza**, **ymir** e **inozuke** (página estática en GitHub Pages).

```
 cada equipo (cron, cada 5 min)            GitHub                      navegador
 collector.py  ── API git ──►  rama data  ◄── fetch ──  index.html (Pages)
```

Los equipos publican en un solo `data.json` de la rama `data` (un solo commit, se
sobrescribe, el historial no crece). La página lo lee con una sola llamada a la API de GitHub (caché de 1 min; si se agota el cupo de 60/h, usa raw.githubusercontent.com con caché de 5 min) y se refresca cada
1 hora / 15 min / 5 min (botón arriba a la derecha).

## 1. Repo y Pages

1. Crea un repo **público** (p. ej. `monito`) y sube `index.html`, `collector/` y este README.
2. En `index.html` edita `const REPO = "fissotta/monito";`
3. Settings → Pages → Deploy from branch → `main` / root.
4. URL: `https://fissotta.github.io/monito/`
   (sin `REPO` configurado, o con `?demo` en la URL, se ve con datos simulados).

> El repo es público, así que cualquiera con la URL puede ver uso, uptime y
> temperatura de los equipos (no hay datos sensibles, pero ten presente eso).

## 2. Token

GitHub → Settings → Developer settings → Fine-grained tokens → solo el repo `monito`,
permiso **Contents: Read and write**. Puedes usar un token distinto por equipo.

## 3. En cada equipo (akaza, ymir, inozuke)

```bash
mkdir -p ~/monito ~/.config
cp collector.py ~/monito/
cat > ~/.config/monito.env <<'EOF'
MONITO_REPO=fissotta/monito
MONITO_TOKEN=github_pat_xxxxx
MONITO_NAME=akaza        # ymir | inozuke
EOF
chmod 600 ~/.config/monito.env

python3 ~/monito/collector.py --dry-run   # prueba: imprime el JSON
python3 ~/monito/collector.py              # publica una vez
crontab -e   # agregar:
*/5 * * * * /usr/bin/python3 $HOME/monito/collector.py
```

## Notas

- Color de cada hilo / CPU total / RAM: verde < 50 %, naranja 50–80 %, rojo ≥ 80 %.
- Monos (`zoo.js`): 5 por equipo, 9 especies (capuchino, tití león, mono ardilla, mandril, mono araña, orangután, macaco de nieve, uacarí y de colores de fantasía). Caminan por la barra de RAM, saltan de hilo en hilo en el anillo de CPU, comen, descansan y cruzan de un anillo a otro; con más carga de CPU corren más. Botón "Monos: sí/no" (se recuerda por navegador; por defecto encendidos).
- Modo automático de tema: oscuro de 19:00 a 07:00; el botón alterna Auto → Claro → Oscuro.
- Un equipo sin datos nuevos por más de 8 min (13 si usa raw) aparece atenuado como "sin conexión".
- Los equipos se turnan para escribir `data.json` con `MONITO_OFFSET` (0, 20 y 40 s) y verifican que su dato quedó; sin ese desfase se pisaban y uno quedaba desactualizado.
- La temperatura es el promedio de los cores (`coretemp` / `k10temp`); si el equipo no la expone, muestra `—`.
- El CPU % es el promedio de 1 s al momento de medir (cada 5 min), no un promedio del intervalo completo.
- Retraso típico del dato: hasta ~6 min con la API (hasta ~11 min si se agota su cupo y cae a raw).
