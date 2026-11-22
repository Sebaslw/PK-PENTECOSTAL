# Tamaño parejo en las canciones y OBS en otro equipo — diseño

Fecha: 2026-11-22 · Aprobado por el usuario · Antes de publicar la 2.0.5

## Por qué

- Las canciones salen con tamaños distintos: hoy cada canción usa el tamaño que le sirve a su estrofa más
  larga y cada línea va completa en un renglón (`white-space: nowrap`). Hay estrofas de hasta 98 líneas y
  líneas de hasta 143 letras, así que unas canciones salen enormes y otras diminutas. El usuario quiere
  **todas las canciones con el mismo tamaño**.
- La letra tiene espacios al inicio de las líneas (533 canciones del Corario) y marcas `//` de repetición
  (~860 canciones) que se ven en pantalla. Hay que quitarlos.
- La iglesia tiene OBS en **otro computador**. El panel conecta escribiendo IP/puerto/contraseña, pero las
  capas que crea en OBS apuntan a `http://pkipuc.localhost/...`, que en el equipo de OBS es él mismo → capa vacía.

## Enfoques considerados

1. **Partir las estrofas en el panel (elegido).** El panel reparte cada estrofa en diapositivas de máximo N
   renglones antes de enviarlas; todas las salidas (proyector, OBS, celulares) ven las mismas diapositivas y
   cada salida usa un tamaño fijo calculado para N renglones.
2. Partir midiendo en cada salida: el proyector y el tercio de OBS tienen tamaños distintos → número de
   diapositivas distinto por salida y la navegación se desordena. Descartado.
3. Tamaño fijo y achicar solo la diapositiva que no cabe (opción B): el usuario eligió la A (partir).

## Diseño

### Canciones
- Ajuste nuevo en *Estilo*: **Líneas por diapositiva** (`lineasMax`, por defecto 6, rango 2–12).
- `estrofas()` del panel: limpia cada línea (espacios al inicio/fin, marcas `//` y `/` de repetición sueltas,
  espacios dobles) y luego parte cada estrofa en partes **parejas** cuando pasa de N renglones (8 → 4+4,
  13 con N=6 → 5+4+4). Una línea larga cuenta como varios renglones (≈ 42 letras por renglón).
- Limpieza solo al mostrar (no se reescriben los cancioneros): sirve también para canciones nuevas.
- Salida (`salida.html`): en canciones, el tamaño es **uno solo**: el que le sirve a una diapositiva de
  referencia de N renglones de ≈ 42 letras en esa salida (respeta `tamMax`). Las líneas largas pasan al
  renglón siguiente (sin `nowrap`, con `text-wrap: balance`). Red de seguridad: si una diapositiva aún no
  cabe, se achica solo ella. La casilla "Mismo tamaño de letra" sigue controlando la Biblia como hoy.
- El celular y los monitores usan las mismas diapositivas (vienen del panel).

### OBS en otro equipo
- Si el host de OBS no es este computador, las fuentes de navegador que crea el panel (capa y stinger) usan
  `http://<IP de este equipo en la red de OBS>:<puerto>/capa` (IP de `/api/info`, eligiendo la de la misma
  subred que OBS). Si la fuente ya existe con otra dirección, se actualiza (`SetInputSettings`).
- Botón **Buscar OBS en la red** en la ventana ⚙: el servidor prueba el puerto 4455 en las redes locales
  (/24) con tiempo corto y devuelve las IP que responden; un clic rellena la IP.
- Mensaje de error para OBS remoto que no responde: revisar que OBS esté abierto, el servidor WebSocket
  habilitado y permitido en el Firewall de Windows de ese equipo.

## Fuera de alcance
- No se reescriben los archivos de cancioneros. No cambia la Biblia. No cambia el arreglo de OBS local (2.0.4).

## Decisiones del constructor
- 42 letras por renglón como referencia (p50 de la línea más larga en los cancioneros: 37–48).
- Escaneo de red: solo /24 de las IP propias, 4455, 300 ms por intento, en paralelo.
