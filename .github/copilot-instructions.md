# GitHub Copilot – Instrucciones del repositorio

## Propósito del proyecto

- Este repositorio contiene una aplicación **personal**, de uso local, llamada **SeasonSummarizer**.
- Objetivo: generar **videos resumen de temporadas completas** de series de TV a partir de:
  - Archivos **.srt** (subtítulos/closed captions) de todos los capítulos de la temporada.
  - Archivos de **video** de todos los capítulos de la temporada.
- La app tiene dos modos principales:
  1. **Modo A – Clips + subtítulo original**  
     - El LLM selecciona momentos clave de toda la temporada.  
     - Se generan **clips de video** concatenados en un único video resumen.  
     - Se genera un archivo **.srt** que contiene los subtítulos correspondientes a los clips seleccionados, con tiempos re-mapeados al nuevo video.
  2. **Modo B – Clips silenciados + narrativa + voz en off**  
     - Se usan los mismos clips de video (sin audio original).  
     - El LLM genera una **narrativa en texto** que cuenta la temporada.  
     - Se genera un **.srt narrativo** (no necesariamente igual al original).  
     - Se usa **Azure Cognitive Services Speech** para generar la voz en off de la narrativa y se mezcla el audio con el video resumen.

## Alcance y restricciones

- La app es **solo para uso personal/local**:
  - No asumas multi-tenant, ni usuarios, ni autenticación.
  - No implementes ningún tipo de analítica externa, tracking ni telemetría de terceros.
- El código **no debe subir video ni audio a servicios externos**.
  - Los LLMs solo reciben **texto** (subtítulos, resúmenes, metadatos).
- No implementes un sistema de subida a la nube ni distribución pública de los videos generados.

## Stack técnico preferido

- **Backend**
  - Node.js (versión LTS reciente) con **TypeScript** estricto.
  - Framework HTTP: **Express** o **Fastify**.
  - Uso de **FFmpeg** vía CLI para cortar y unir videos.
  - Organización en módulos:
    - `src/llm/` para interacción con modelos.
    - `src/pipelines/` para la lógica de resumen y generación de video.
    - `src/api/` para endpoints HTTP.
    - `src/config/` para configuración y tipos.
- **Frontend**
  - **React + Vite + TypeScript**.
  - UI sencilla pero clara para:
    - Cargar archivos `.srt` y videos.
    - Elegir serie, temporada, idioma, modo (A/B) y parámetros de resumen (short/medium/long).
    - Ver el progreso del job y descargar el video y los `.srt` generados.

## Integración con LLMs

- Prepara una capa de abstracción tipo `LLMProvider` para soportar múltiples modelos:
  - **OpenAI**: GPT-5.1.
  - **Anthropic**: Claude Sonnet 4.5 y Claude Opus 4.5.
- No pongas API keys en el código. Usa variables de entorno:
  - `OPENAI_API_KEY`, `OPENAI_API_BASE`, `OPENAI_MODEL=...`
  - `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL_SONNET=...`, `ANTHROPIC_MODEL_OPUS=...`
- La lógica de negocio debe trabajar siempre con:
  - Texto de subtítulos ya parseado (`start`, `end`, `text`, `episodeId`).
  - Metadatos de serie/temporada (nombre, número de episodio, duración aproximada, etc.).
- Implementa al menos una estrategia sencilla por defecto:
  - Un modelo principal (por ejemplo GPT-5.1) que produce:
    - Lista de momentos clave con `episodeId`, `startTime`, `endTime`, `justificación`, `rol en la narrativa`.
    - Outline narrativo por bloques (inicio, desarrollo, clímax, cierre).
  - Deja preparado el código para soportar más adelante la combinación de múltiples modelos (OpenAI + Anthropic) a través de un módulo de “agregador de resultados”, pero la versión inicial puede usar uno solo.

## Azure Cognitive Services – Voz en off

- Crea un módulo `src/tts/azureSpeech.ts` que:
  - Use el SDK oficial de Azure Speech.
  - Lea configuración desde variables de entorno:
    - `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, `AZURE_SPEECH_VOICE`.
  - Reciba como input un **script narrativo** (texto completo o bloques) y devuelva:
    - Un archivo de audio WAV/MP3 listo para pegar sobre el video.
- El pipeline de modo B debe:
  - Silenciar el audio del video resumen (o no incluirlo).
  - Mezclar la pista de voz con el video final usando FFmpeg.
  - Mantener la coherencia entre tiempos del .srt narrativo y la voz generada.

## Procesamiento de subtítulos y video

- Parsear archivos `.srt` a una estructura interna clara:
  - `episodeId`, `absoluteEpisodeIndex`, `startTime`, `endTime`, `text`.
- Implementar una función para:
  - Unificar todos los subtítulos de la temporada en una línea de tiempo lógica para el LLM (como si fuera un “guion de la temporada”).
  - Permitir que el LLM devuelva momentos clave con referencia al `episodeId` + tiempos originales.
- Implementar utilidades para:
  - Generar una lista de clips (`episodeVideoPath`, `startTime`, `endTime`) en un archivo JSON intermedio.
  - Cortar y unir esos clips con FFmpeg.
  - Re-mappear los tiempos para generar un `.srt` de salida alineado al nuevo video.
- Si hay que decidir parámetros, prefiere configurarlos vía JSON/`.env` (ej. longitud objetivo del resumen, número máximo de clips, etc.).

## Estructura de carpetas sugerida

- `backend/`
  - `src/llm/`
  - `src/pipelines/`
  - `src/api/`
  - `src/tts/`
  - `src/config/`
  - `tests/`
- `frontend/`
  - `src/` (React + Vite)
- `data/`
  - `uploads/` (videos y .srt de entrada)
  - `outputs/` (videos resumen, .srt generados, logs)
- `scripts/` (utilidades CLI para ejecutar pipelines sin UI)
- `docs/` (diagramas y documentación adicional)

## Calidad, testing y DX

- Configura:
  - TypeScript con `strict: true`.
  - ESLint + Prettier con scripts en `package.json`.
- Implementa al menos:
  - Tests unitarios básicos para parsing de `.srt` y para el re-mapeo de tiempos.
  - Tests de integración ligeros para el pipeline de generación de clips (sin llamar a LLM ni TTS, usando datos de ejemplo).
- Añade un `README.md` claro con:
  - Cómo instalar dependencias.
  - Cómo configurar variables de entorno.
  - Cómo ejecutar el frontend y el backend.
  - Cómo correr un ejemplo de generación de resumen.

## Instrucciones para Copilot / agentes

- Antes de hacer cambios grandes, **genera un plan** (task list) y luego ejecútalo paso a paso.
- Prioriza crear primero:
  1. Parsing de `.srt` y representación interna.
  2. Pipeline de generación de clips sin LLM (hardcodeado) para probar FFmpeg.
  3. Integración con LLM para selección de momentos.
  4. Integración con Azure Speech.
  5. Interfaz web básica para lanzar jobs y ver resultados.
- Haz commits frecuentes y pequeños con mensajes claros.
- No agregues dependencias nuevas innecesarias si existe una alternativa estándar en el stack seleccionado.
