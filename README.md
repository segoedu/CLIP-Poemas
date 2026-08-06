# 🎨📜 Poemas & Pinturas · Afinidades

> Explorador visual de afinidades entre **poemas** y **obras de arte**, calculadas con el modelo multimodal **[Jina-CLIP v2](https://huggingface.co/jinaai/jina-clip-v2)**.

Una aplicación web *single-page* (SPA) sin dependencias que permite descubrir, navegar y comparar las conexiones semánticas que un modelo de *vision-language* encuentra entre la poesía 🪶 y la pintura 🖌️ de un corpus curado de **50 pintoras y pintores**, **23 poetas** y miles de parejas poema↔obra.

![Explorador](https://img.shields.io/badge/explorador-SPA-green) ![Modelo](https://img.shields.io/badge/modelo-Jina--CLIP%20v2-blue) ![Datos](https://img.shields.io/badge/filas-7M-important)

---

## ✨ ¿Qué hace?

Partiendo de los vectores calculados con **Jina-CLIP v2** (un modelo capaz de incrustar en un mismo espacio textos e imágenes), el proyecto cruza **fragmentos de poemas** con **obras pictóricas** y cuantifica su semejanza mediante **similitud de coseno** 🌉.

La web permite:

- 🪶 **Explorar poetas**: perfil, época, región y sus afinidades con los pintores del corpus.
- 🎨 **Explorar pintores**: catálogo de obras y qué poetas "resuenan" más con cada una.
- 📜 **Explorar poemas**: texto completo de cada poema con sus mejores parejas pictóricas.
- 🔍 **Búsqueda global** en el corpus de poemas.
- 🧮 **Métricas configurables**: mejores parejas, media, suma… y niveles de afinidad (baja / media / alta / muy alta) según cuartiles de la distribución.
- 💾 **Preferencias persistentes** (orden, filtros, tope de resultados) en `localStorage`.
- ⚡ **Carga perezosa**: la portada usa un dataset ligero (`data_home.js`) y el corpus completo de afinidades se carga bajo demanda (`data.js`), siempre con **gzip precomprimido**.

## 🧠 El modelo y el origen de los datos

Los CSV del directorio [`data/`](data/) **se han obtenido del cuaderno de Colab [pintura_poesía_jina_clip_v2](https://colab.research.google.com/drive/1_CzU3s9Dn-6qeMSf-rmqF7rr1KpOlhkX#scrollTo=RzAPHd_eEtMZ)**, que incrusta los textos de los poemas y las imágenes de las obras, y cruza todos los fragmentos contra todas las obras para emitir las puntuaciones de afinidad.

Los CSV están **vinculados con la estructura física (directorios) del corpus**: cada fila referencia el pintor por el **nombre del directorio** (`corpus/paintings/<pintor>/`) y la obra por el **nombre de archivo** de la imagen dentro de ese directorio; el poeta se resuelve mediante `poetas.json` y el fragmento se **re-empareja** con el poema completo (recuperado de `corpus/poets/<poeta>.json`) durante la construcción de los datos.

### Archivos de datos

| Archivo | Contenido | Filas |
| --- | --- | ---: |
| `data/afinidades_jinaclipv2_obrapoema.zip` | Corpus completo de afinidades poema↔obra | **7.171.416** |
| `data/afinidades_jinaclipv2_obrapoema_ligero.zip` | Subconjunto ligero (muestra) | 47.250 |

Estructura de cada CSV:

```csv
Pintor,Obra,Poeta,Poema_Fragmento,Similitud_Coseno,Clave_Referencia
kusama,09_yellow-pumpkin-1992.jpg,Walt Whitman,"I celebrate myself, and sing myself, …",0.812345,…
```

## 📂 Estructura del corpus

```
corpus/
├── paintings/               # 🖌️ 50 pintoras/es, una carpeta por autor/a
│   ├── van-gogh/            #    → pintores.json mapea directorio ⇄ autor
│   │   ├── 01_starry_night.jpg
│   │   └── …
│   └── …
├── poets/                   # 🪶 23 poetas, un JSON por autor/a
│   ├── cernuda_luis.json    #    → poetas.json mapea directorio ⇄ autor
│   └── …
├── pintores.json            # catálogo de pintores y sus obras
├── poetas.json              # catálogo de poetas y sus poemas
├── PINTORES.md              # tabla resumen de pintores
└── POETAS.md                # tabla resumen de poetas
```

> 🔗 **Clave del vínculo**: las columnas `Pintor` y `Obra` de los CSV apuntan directamente a rutas reales del corpus (`paintings/<directorio>/<archivo>`), de modo que cualquier fila de los datos se puede resolver físicamente sobre el repositorio.

## 🗂️ Estructura del proyecto

```
CLIP-Poemas/
├── corpus/        # 📚 corpus físico: pinturas, poemas y catálogos (JSON + MD)
├── data/          # 📊 CSV de afinidades generados con el cuaderno de Colab
├── scripts/
│   ├── build_data.py   # 🔧 genera data.js / data_home.js (+ .gz) desde el CSV
│   └── serve.py        # 🚀 servidor estático local con gzip precomprimido
└── web/
    ├── index.html      # 🏠 entrada de la SPA
    ├── app.js          # ⚙️ lógica de la aplicación (render por hash)
    ├── styles.css      # 🎨 estilos
    └── data*.js(.gz)   # 📦 datasets generados (completo, ligero y versiones "home")
```

## 🚀 Puesta en marcha

### 1) Servir la web

```bash
python scripts/serve.py 8000
```

Abre **http://localhost:8000/web/** en el navegador. El servidor expone tanto la web como el corpus (`corpus/paintings/`) y sirve automáticamente las versiones `.gz` con `Content-Encoding: gzip`.

### 2) Regenerar los datos (opcional)

Para reconstruir `web/data.js`, `web/data_home.js` y sus versiones comprimidas a partir de un CSV de afinidades:

```bash
python scripts/build_data.py data/afinidades_jinaclipv2_obrapoema.zip
```

También admite el CSV ligero para pruebas y `--out` para cambiar el prefijo de salida:

```bash
python scripts/build_data.py data/afinidades_jinaclipv2_obrapoema_ligero.zip --out data_ligero
```

## 📊 El corpus en cifras

| Concepto | Cantidad |
| --- | ---: |
| 🖌️ Pintoras y pintores | 50 |
| 🖼️ Obras | 511 |
| 🪶 Poetas | 23 |
| 📜 Poemas | 1.786 |
| 🌉 Afinidades poema↔obra (CSV completo) | 7.171.416 |

## ⚙️ Requisitos

- 🐍 **Python 3** (solo para los scripts de construcción/servido).
- 🌐 Un navegador moderno (la web no requiere ningún framework ni instalación).

## 🙌 Créditos

- Modelo de embeddings: **[Jina-CLIP v2](https://huggingface.co/jinaai/jina-clip-v2)**.
- Datos de afinidades generados con el cuaderno de Colab **[pintura_poesía_jina_clip_v2](https://colab.research.google.com/drive/1_CzU3s9Dn-6qeMSf-rmqF7rr1KpOlhkX#scrollTo=RzAPHd_eEtMZ)**, vinculado con la estructura física (directorios) del corpus.
- Poemas y pinturas pertenecen a sus respectivos autores/as y se usan con fines de investigación y divulgación cultural.
