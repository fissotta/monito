# MONITO

Monitor en tiempo real de **akaza**, **ymir** e **inozuke** (página estática en GitHub Pages).

```
 cada equipo (cron, cada 5 min)            GitHub                      navegador
 collector.py  ── API git ──►  rama data  ◄── fetch ──  index.html (Pages)
```

Los equipos publican en un solo `data.json` de la rama `data` (un solo commit, se
sobrescribe, el historial no crece). La página lo lee con una sola llamada a la API de GitHub (caché de 1 min; si se agota el cupo de 60/h, usa raw.githubusercontent.com con caché de 5 min) y se refresca cada 5 min.

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
- Monos (`zoo.js`): 5 por equipo, 9 especies (capuchino, tití león, mono ardilla, mandril, mono araña, orangután, macaco de nieve, uacarí y de colores de fantasía). Caminan por la barra de RAM, saltan de hilo en hilo en el anillo de CPU, comen, descansan y cruzan de un anillo a otro; su ánimo sigue el CPU de cada equipo: bajo (< ~30 %) duermen con "zzz", caminan lento y se estiran bostezando; medio, todos hacen algo (caminan, algunos saltan, comen, café tranquilo); alto (> ~70 %) corren, saltan y toman café temblando. Con `?demo&cpu=NN` en la URL se fuerza la carga para probarlo. Siempre activos. Al hacer clic o tocar un mono salta (a veces con voltereta) y dice algo en un globo; si dormía se sobresalta y se estira; si lo tocas muchas veces seguidas se enoja. Tres monos por equipo llevan un accesorio (gafas, sombreros, corona, audífonos, bigote, flor, parche pirata, bufanda, corbatín…) de 13 posibles, con colores al azar; no se repiten entre equipos.
- Modo automático de tema: oscuro de 19:00 a 07:00; un botón pequeño (arriba a la derecha) alterna ◐ Auto → ☀ Día → ☾ Noche y se recuerda por navegador.
- Un equipo sin datos nuevos por más de 8 min (13 si usa raw) aparece atenuado como "sin conexión".
- Los equipos se turnan para escribir `data.json` con `MONITO_OFFSET` (0, 20 y 40 s) y verifican que su dato quedó; sin ese desfase se pisaban y uno quedaba desactualizado.
- La temperatura es el promedio de los cores (`coretemp` / `k10temp`); si el equipo no la expone, muestra `—`.
- El CPU % es el promedio de 1 s al momento de medir (cada 5 min), no un promedio del intervalo completo.
- Retraso típico del dato: hasta ~6 min con la API (hasta ~11 min si se agota su cupo y cae a raw).

## Sociedad de monos (`world.js`)

- Cada 10 s nace un mono en un equipo al azar. Cada tarjeta aguanta 9 monos en sus anillos; los que sobran se desbordan, caminan tapando los textos y caen al "suelo" (borde inferior de la pantalla).
- Abajo arman una civilización que avanza por 8 eras: piedra, fuego, nómadas, sedentarios (aldeas y cultivos), colonial, industrial, moderna y espacial. Al colonizar otro mundo entran en la **era galáctica**, donde vive una saga de ciencia ficción que termina en un cataclismo; los pocos sobrevivientes empiezan de nuevo (**Ciclo 2, 3…**). Al recargar la página todo vuelve a cero.
- **Nunca es la misma historia:** en cada carga (y en cada ciclo) se sortean el temperamento de la tribu (guerrera o pacífica), los nombres de la tribu y la ciudad, la paleta de las casas, la variante de cada era, el destino espacial (Marte, la Luna, Europa o Titán) y la duración de cada época. Los hitos salen en orden aleatorio: más de cien, de **religión** (tótems, pirámides, templos, catedrales, reformas y cismas, fe cósmica), **filosofía** (el primer filósofo, la academia, la ilustración), **ciencia** (astronomía, gravedad, evolución, relatividad, ADN, fusión), arte, política, medicina e industria. Cada época tiene su religión y su templo (tótem, pirámide, templo, catedral, esfera luminosa).
- **Sucesos al azar:** guerras y paces, guerras santas, cacerías, fiestas, olimpiadas y conciertos, peregrinaciones y milagros, **pandemias con nombre** (los contagiados se ponen verdes; vacunas y antibióticos las acortan), langostas, sequías, hambrunas, incendios, inundaciones y tsunamis, tormentas con rayos, terremotos, volcanes, meteoritos, eclipses, auroras, lluvias de estrellas, glaciaciones, edad dorada u oscura, huelgas, crisis y booms económicos, genios, héroes, profetas, ruinas, inmigración y hasta un ovni.
- **Planetas:** el telescopio va descubriendo planetas (a veces con anillos) y los cohetes llevan colonos a cada uno.
- **Sagas de la era galáctica** (una al azar por ciclo, sin repetir la anterior): *Guerra de las galaxias* (imperio, rebeldes y estación de combate), *El planeta de arena* (gusanos gigantes y especia), *La Fundación* (el imperio cae y el conocimiento sobrevive: renacen desde la era colonial), *El octavo pasajero* (un xenomorfo devorando monos), *El cazador* (un cazador interestelar con camuflaje), *La rebelión de las máquinas*, *La guerra de los mundos* (trípodes y platillos) y *Horizonte de sucesos* (un agujero negro).
- Su ánimo en los anillos sigue el CPU de cada equipo. Panel de crónica abajo a la izquierda: tócalo para ver el historial, la religión y las estadísticas.
- Pruebas: `?demo&turbo=20` acelera el tiempo, `?era=N` (0–8) empieza en esa era, `?era=8&saga=imperio|arrakis|fundacion|alien|predator|maquinas|invasion|agujero` fuerza una saga, `?warp=300` adelanta 300 s, `?hud` abre el panel, `?do=guerra|cohete|meteorito|ovni|pandemia|incendio|inundacion|tormenta|aurora|olimpiadas|peregrinacion|milagro|cisma|huelga|crisis|langostas|sequia|genio|concierto|cataclismo|plaga|terremoto|volcan|festival|eclipse|lluvia|cometa|caceria` dispara un suceso, `?debug` muestra contadores.
