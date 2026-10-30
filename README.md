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

## Reloj y calendario de seminarios

- Arriba a la izquierda hay un reloj con la hora (`hh:mm`) y la fecha (`dd/mm`). Al tocarlo se abre el calendario del mes (semana desde el lunes, sábado y domingo en naranja, hoy marcado), con flechas para cambiar de mes y botón **Hoy**.
- Los seminarios salen de **`seminarios.txt`** (en la raíz del repo, junto a `index.html`). Una fecha por línea; las fechas con seminario llevan un punto verde (hueco gris si dice «No hay») y al tocar un día se ve quién presenta. Sin tocar nada, el calendario muestra el próximo seminario.

  ```
  02/nov Celia
  09/nov Abraham
  16/nov No hay
  23/nov Issotta
  ```

  También se entienden `2026-11-09 Abraham 15:00`, `09/11/2026; Abraham`, `9 de noviembre: Abraham`, líneas con `#` (comentarios) y líneas sin fecha (se agregan como nota a la anterior). Si no hay año, se toma el que deje la fecha más cerca de hoy.
- Para actualizarlo: editar `seminarios.txt` → rama → pull request → merge (el archivo es público, igual que el resto del repo).

## Feriados y congresos en el calendario

- Los **feriados de Chile** salen marcados en rojo (se calculan por año: Semana Santa, traslados a lunes de San Pedro y San Pablo y Encuentro de Dos Mundos, Iglesias Evangélicas, Fiestas Patrias, etc.). Es referencial: no incluye jornadas electorales ni feriados decretados aparte.
- Los **congresos y eventos de varios días** se leen de `eventos.txt` (`AAAA-MM-DD a AAAA-MM-DD | NOMBRE | descripción`) y pintan todo el rango de días, con leyenda de colores. Al tocar un día, el cuadro de abajo dice qué es.

## Feed de papers

Segunda cinta junto al indicador de época, con papers nuevos de los temas del laboratorio (acidófilos, *Acidithiobacillus*, biominería, hierro y azufre, metagenómica, genómica, extremófilos, elementos móviles) más los trabajos de R. Quatrini (marcados con ★). Cada paper abre su página (PubMed, DOI o Europe PMC).

- `collector/papers.py` consulta PubMed (E-utilities de NCBI) y los preprints de Europe PMC (bioRxiv y otros), filtra por una lista de palabras clave sacada de los abstracts de Quatrini y publica `papers.json` en la rama `papers`. Lo ejecuta el mismo cron de `news.py`. Prueba: `python3 papers.py --dry-run`.
- Las palabras clave y las consultas están al comienzo de `papers.py` (`TOPICS`, `EPMC_TOPICS`, `KEYWORDS`, `KEY_MIN`); se pueden editar.

## Mensajes de pantalla completa y clima

- A ciertas horas aparece, en una franja en la parte superior, un mensaje con un mono grande haciendo lo que dice. A la hora del evento sale 5 veces durante 1 minuto (8 s cada vez); si lo tocas se va y no vuelve: 12:00 «¡A almorzar!» (comiendo), jueves 9:20 «¡Seminario FCV!» (caminando), jueves 9:30 «¿Qué hacen acá? ¿No deberían estar en el seminario???» (saltando enojado), 16:00 café y 18:00 recordatorio de jobs/respaldo. Prueba: `?big=almuerzo|seminario|tarde|cafe|casa`.
- El mono del clima cambia de ropa: capucha y paraguas con lluvia, gorro y abrigo con nieve o frío, bufanda y abrigo con fresco, gafas o sombrero de paja con sol y calor.
- La época y el año quedan en una pastilla bajo los monitores, fuera de la civilización; al tocarla se abre un cuadro al centro (población, crónica, estadísticas) que se esconde solo al minuto o al tocarlo otra vez.
- Cabecera: MONITO, las noticias y el botón de color en una sola línea. Reloj y tiempo tienen el mismo ancho que cada monitor, y la leyenda queda bajo akaza.

## Era nuclear y era digital

La antigua «era moderna» ahora tiene dos fases: **Era nuclear** (centrales, silos, búnkeres, pruebas atómicas con hongo en el horizonte, simulacros con sirena, accidentes con radiación, Guerra Fría, crisis de misiles) y luego **Era digital** (computadores, internet, genomas, CRISPR, redes, nube, IA), antes de la era espacial.

Además, el cielo muestra ~130 mensajes aleatorios más sobre bioinformática (ensamblaje, anotación, filogenia, clusters), laboratorio húmedo, tesis/papers y datos curiosos.

## Planetas y más sucesos

- Al tocar un planeta del cielo se abre un cuadro con su información: datos reales para Marte, la Luna, Europa y Titán, y datos inventados (tipo, diámetro, gravedad, temperatura, atmósfera, distancia, colonos) para los demás.
- Sucesos medievales y de guerra: asedios con catapultas, torneos de justas, cruzadas, invasores y piratas por mar, Peste Negra, un dragón, feria medieval, revueltas campesinas, batalla naval y la Guerra de los Cien Años; y en la época moderna, guerra mundial con bombarderos y guerra fría. Aparecen castillos.
- Si un mono cae encima de otro, los dos quedan inconscientes unos segundos y el aplastado reclama al despertar.
- Más pruebas: `?do=asedio|justas|cruzada|invasores|pestenegra|dragon|naval|guerramundial|guerrafria|choque`, `?planet=N` abre el cuadro del planeta N, `?cal` abre el calendario.

## Pantalla de laboratorio (TV)

- El reloj (hora, fecha y día de la semana) está a la izquierda de las tarjetas y en grande, para verlo de lejos; al tocarlo se abre el calendario de seminarios. En pantallas angostas pasa a una franja sobre las tarjetas.
- **Mensajes en el cielo:** de vez en cuando cruza una cinta con un recordatorio para el laboratorio («¡Dejen de ver monos y vayan a trabajar!», «¿Cómo están tus bacterias?», «¿Ya ensamblaste ese genoma?», «Tesis, tesis, tesis…»). La lista está en `SKY_MSGS` (`world.js`).
- **Mensajes para Sofi:** tocar 4 veces seguidas a un animal hace que empiece a molestarla con su escrito («Sofi, ¿cómo va tu escrito?», «¿Y si avanzas en el paper, mejor?»…). Lista en `SOFI` (`zoo.js`).
- Los animales del suelo **piensan en voz alta** (globos punteados) según la época y la especie.

## Un animal por equipo, famosos y pueblos

- **akaza = monos, ymir = jirafas, inozuke = focas** (anillos y suelo). El mapa está en `MACHINES` (`index.html`).
- **Famosos disfrazados de animal:** aparecen de vez en cuando (científicos, actores, músicos y escritores: Einstein, Curie, Darwin, Newton, Chaplin, Freddie Mercury, Frida Kahlo, Neruda, Mistral, Violeta Parra…). Al tocarlos dicen «¡Hola, soy …!» y una frase conocida; el nombre sale al dejar el cursor encima. Lista en `CELEBS` (`zoo.js`).
- **Cada animal forma su propio pueblo** en su zona de la pantalla, con bandera, casas, religión y cultura propias. Entre ellos hay exploradores, caravanas de comercio, misioneros, tratados de paz, bodas reales, ayuda en las pandemias, y también guerras (con conquistas o treguas). Las relaciones se acumulan: pueblos enemistados pelean más.
- **En la era espacial se funden en un solo pueblo.**
- **Antigüedad y Edad Media** (la segunda parte de la era sedentaria, ahora más larga): cada pueblo adopta una cultura del mundo —romana, egipcia, vikinga, china, japonesa, azteca, árabe, mongola, europea o india— con sus construcciones grandes y altas (coliseo, acueducto, obeliscos, esfinge, pagodas, gran muralla, torii, pirámides escalonadas, palacios con minaretes, yurtas, mausoleo…) y sus sucesos (gladiadores, legiones, hordas a caballo).
- Pruebas nuevas: `?celebs` (todos famosos), `?hola` (un toque), `?sofi` (cinco toques), `?era=3&medieval&cult=romana,china,vikinga`, `?do=exploradores|comercio|misioneros|tratado|ayuda|bodareal|gladiadores|legion|horda|cielo`.

## Pantalla dividida: información arriba, civilización abajo

- **Mitad de arriba (información):** una cinta de **noticias** arriba de todo (mundo y Chile), el reloj con el **próximo seminario y su cuenta regresiva** (días, horas y minutos), el cuadro del **tiempo** (temperatura actual, mínima y máxima, y un monito vestido según el clima) y las tarjetas de los equipos.
- **Mitad de abajo (civilización):** su propio cielo con planetas y lunas, el suelo, las construcciones y los animales. En la noche (tema oscuro) el cielo tiene estrellas. Si la pantalla es angosta (celular) no se divide y todo queda como antes.
- **Noticias:** el script `collector/news.py` baja titulares de BBC Mundo, DW Español, France 24, Noticias ONU, El País, Euronews, La Tercera, Cooperativa y Radio U. de Chile, y los publica en la rama `news` del repo (`news.json`). La página los lee cada 15 min; al pasar el cursor por encima la cinta se detiene y al tocar un titular se abre la noticia. Para que se actualicen solas hay que instalar `news.py` con una tarea programada cada 20 min en un equipo con internet (junto a `collector.py` y su `~/.config/monito.env`):
  ```bash
  cd ~/monito && python3 news.py          # prueba: publica una vez
  crontab -e                               # agregar:
  */20 * * * * cd $HOME/monito && /usr/bin/python3 news.py
  ```
- **El tiempo:** usa Open-Meteo (gratis, sin clave) para Santiago (cambiar `WX_PLACE` en `index.html` si el laboratorio está en otra ciudad). Al tocar el cuadro se abre el pronóstico de 7 días con la probabilidad de lluvia y un mapa de **Windy**, con un enlace para abrirlo completo.
- **Almuerzo:** a las **12:00** (hora del computador) aparece «¡A almorzar!» y todos los animales, los de los anillos y los del suelo, paran a comer; durante esa hora cruzan mensajes al azar sobre el almuerzo. A las 13:00 vuelven al trabajo. Se ajusta con `LUNCH_FROM` y `LUNCH_LEN` en `world.js`.
- Pruebas: `?lunch` fuerza la hora de almuerzo, `?wx` abre el tiempo, `?theme=dark` fuerza el tema oscuro.
