# Nocturna

Planificador personal de fotografía con Sol, Luna y Vía Láctea (web app instalable).

**Dirección:** https://pepeperez14.github.io/nocturna/

## Instalar en el iPhone

1. Abre la dirección en **Safari**.
2. Compartir › **Añadir a pantalla de inicio**.
3. Ábrela desde el icono. Pedirá ubicación; la realidad aumentada pedirá movimiento y cámara.

Tras abrirla una vez con conexión funciona sin cobertura (la app, los cálculos y las zonas de mapa ya vistas). Buscador, relieve, alturas del terreno y órbita de la ISS necesitan conexión.

## Uso rápido

- **Planificar**: mantén pulsado el mapa para mover la cámara (C); la diana coloca el objetivo (O), toca dos veces el objetivo para quitarlo. Arrastra la barra del día para cambiar la hora; toca la hora para elegir fecha. Discontinuas: salida y puesta. Continuas: posición en ese momento. Amarillo Sol, blanco Luna, violeta núcleo galáctico, naranja objetivo.
- **Calcular horizonte con relieve**: terreno a 60 km; horas reales a las que el Sol o la Luna asoman tras los montes.
- **Alinear**: cuándo la Luna, el Sol o el núcleo quedan justo sobre el objetivo. Indica la altura sobre el objetivo (torre, cima, árbol).
- **Vía Láctea**: noches con núcleo visible, oscuridad astronómica y sin Luna.
- **RA**: trayectorias sobre la cámara. Apunta a la Luna o al Sol y pulsa «Fijar en…» para corregir la brújula.
- **Eventos**: fases, superlunas, conjunciones, lluvias de meteoros, eclipses y pasos de la ISS.
- **Cámara**: estrellas puntuales (NPF), hiperfocal, campo de visión, tamaño de la Luna, rastros y time lapse. Ajustes: modo noche rojo.

## Precisión y límites

- Efemérides: Astronomy Engine (error < 1′, con paralaje lunar y refracción estándar).
- Distancia y acimut: elipsoide WGS84 (Vincenty). Elevación con curvatura y refracción terrestre k = 0,13.
- Alturas del terreno: Copernicus 90 m vía Open-Meteo, ±5 m; corrígelas en Alinear si conoces la cota.
- Brújula del móvil: 5–10° de error sin calibrar. La precisión fina la da el mapa.
- Horas en la zona horaria del móvil.

## Actualizar

Sube los ficheros cambiados a este repositorio; la app los recoge la siguiente vez que se abra con conexión.
