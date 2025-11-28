# Plan de Implementación - SeasonSummarizer v0.1

## Resumen del Proyecto

SeasonSummarizer es una aplicación web personal (solo local) para generar videos resumen de temporadas completas de series de TV.

### Modos de Operación
- **Modo A**: Video resumen con clips seleccionados + .srt remapeado de los originales
- **Modo B**: Video resumen (sin audio original) + narrativa LLM + voz en off Azure TTS

---

## Fases de Implementación

### FASE 1: Estructura Base y Configuración (✓ En progreso)

- [x] 1.1 Crear estructura de carpetas del proyecto
- [x] 1.2 Inicializar proyecto backend (Node.js + TypeScript + Express)
- [x] 1.3 Inicializar proyecto frontend (React + Vite + TypeScript)
- [x] 1.4 Configurar TypeScript strict, ESLint y Prettier
- [x] 1.5 Crear archivos de configuración (.env.example, .gitignore)
- [x] 1.6 Configurar scripts de package.json (dev, test, build)

### FASE 2: Backend - Módulos Core

- [ ] 2.1 Parser de subtítulos (.srt)
  - Implementar `src/subtitles/srtParser.ts`
  - Parsear archivos .srt a estructura interna
  - Funciones de conversión de tiempos (HH:MM:SS,mmm ↔ segundos)
  - Tests unitarios

- [ ] 2.2 Utilidades de subtítulos
  - Implementar `src/subtitles/subtitleUtils.ts`
  - Unificar subtítulos de temporada en timeline lógico
  - Remapear tiempos para nuevo video
  - Generar .srt de salida

- [ ] 2.3 Módulo FFmpeg
  - Implementar `src/video/ffmpeg.ts`
  - Validar disponibilidad de FFmpeg
  - Cortar clips según especificación JSON
  - Concatenar clips en video único
  - Mezclar audio con video (modo B)

### FASE 3: Backend - Capa LLM

- [ ] 3.1 Interfaz LLMProvider
  - Definir `src/llm/types.ts` con interfaces
  - Definir métodos: summarizeSeasonFromSubtitles, selectKeyMoments, generateNarrativeForSummary

- [ ] 3.2 OpenAI Provider
  - Implementar `src/llm/openaiProvider.ts`
  - Integración con GPT-5.1
  - Prompts optimizados para selección de momentos clave

- [ ] 3.3 Anthropic Provider
  - Implementar `src/llm/anthropicProvider.ts`
  - Integración con Claude (Sonnet/Opus configurable)

- [ ] 3.4 Factory de LLM
  - Implementar `src/llm/llmFactory.ts`
  - Selección de proveedor por configuración de job

### FASE 4: Backend - Azure TTS

- [ ] 4.1 Módulo Azure Speech
  - Implementar `src/tts/azureSpeech.ts`
  - Generación de audio desde texto narrativo
  - Configuración por variables de entorno

### FASE 5: Backend - Pipeline de Jobs

- [ ] 5.1 Modelo de Job
  - Definir `src/jobs/types.ts` (estados, configuración)
  - Implementar `src/jobs/jobStore.ts` (persistencia JSON local)

- [ ] 5.2 Pipeline de procesamiento
  - Implementar `src/pipelines/summaryPipeline.ts`
  - Etapas:
    1. Validar inputs
    2. Parsear .srt
    3. Unificar subtítulos
    4. Llamar LLM para selección de momentos
    5. Generar JSON de clips
    6. Cortar y unir con FFmpeg
    7. Generar .srt de salida
    8. (Modo B) Generar narrativa y TTS
    9. (Modo B) Mezclar audio con video

- [ ] 5.3 Job Runner
  - Implementar `src/jobs/jobRunner.ts`
  - Ejecución asíncrona de pipelines
  - Actualización de estado por etapa

### FASE 6: Backend - API REST

- [ ] 6.1 Endpoints de Jobs
  - POST /api/jobs - Crear job
  - GET /api/jobs/:id - Consultar estado
  - GET /api/jobs/:id/download/:type - Descargar resultados

- [ ] 6.2 Endpoints de Upload
  - POST /api/upload/:jobId/srt - Subir archivos .srt
  - POST /api/upload/:jobId/video - Subir archivos de video

- [ ] 6.3 Middleware y manejo de errores
  - Validación de requests
  - Manejo centralizado de errores

### FASE 7: Frontend

- [ ] 7.1 Configuración y estructura
  - Layout principal
  - Routing (React Router)
  - Estado global (Context o Zustand)

- [ ] 7.2 Pantalla de crear job
  - Formulario con campos requeridos
  - Selector de archivos .srt y video
  - Validaciones de UI

- [ ] 7.3 Pantalla de estado de job
  - Visualización de progreso por etapas
  - Polling de estado
  - Enlaces de descarga

- [ ] 7.4 Componentes de UI
  - FileUploader
  - ProgressBar
  - ErrorDisplay

### FASE 8: Testing e Integración

- [ ] 8.1 Tests unitarios
  - Parser de .srt
  - Utilidades de tiempos
  - Remapeo de subtítulos

- [ ] 8.2 Tests de integración
  - Pipeline sin LLM (datos mock)
  - API endpoints

- [ ] 8.3 Datos de ejemplo
  - Crear .srt de prueba sintéticos
  - Script de generación de ejemplo

### FASE 9: Documentación y Finalización

- [ ] 9.1 README.md completo
  - Instalación
  - Configuración de .env
  - Ejecución
  - Ejemplo de uso

- [ ] 9.2 Scripts de utilidad
  - generate-summary:example

- [ ] 9.3 Validación final
  - Compilación sin errores
  - Tests pasando
  - Flujo completo funcional

---

## Decisiones de Diseño

### Persistencia
- Estado de jobs: JSON local en `data/jobs/`
- Archivos subidos: `data/uploads/<jobId>/`
- Resultados: `data/outputs/<jobId>/`

### Estructura de Datos

```typescript
// Subtítulo parseado
interface SubtitleEntry {
  episodeId: string;
  index: number;
  startTime: number;  // segundos
  endTime: number;    // segundos
  text: string;
}

// Clip seleccionado
interface ClipSelection {
  episodeId: string;
  videoPath: string;
  startTime: number;
  endTime: number;
  narrativeRole: 'intro' | 'development' | 'climax' | 'resolution';
  justification: string;
}

// Job
interface Job {
  id: string;
  seriesName: string;
  season: number;
  language: string;
  mode: 'A' | 'B';
  targetLength: 'short' | 'medium' | 'long' | number;
  llmProvider: 'openai' | 'anthropic';
  status: JobStatus;
  progress: JobProgress;
  createdAt: Date;
  updatedAt: Date;
}
```

### FFmpeg
- Usar concat demuxer para unir clips sin recodificar cuando sea posible
- Fallback a recodificación si los formatos no son compatibles

### Manejo de Errores
- Errores de validación: código 400 con mensaje descriptivo
- Errores de procesamiento: guardar en log del job, estado 'failed'
- Errores de LLM/TTS: retry con backoff exponencial (3 intentos)

---

## Dependencias Principales

### Backend
- express / @types/express
- typescript
- dotenv
- multer (upload de archivos)
- uuid (generación de IDs)
- openai (SDK oficial)
- @anthropic-ai/sdk
- microsoft-cognitiveservices-speech-sdk

### Frontend
- react / react-dom
- vite
- typescript
- react-router-dom
- axios

### Dev
- eslint + @typescript-eslint/*
- prettier
- vitest (testing)
- nodemon / ts-node-dev

---

## Próximos Pasos Inmediatos

1. Crear estructura de carpetas
2. Inicializar package.json para backend y frontend
3. Configurar TypeScript y herramientas de desarrollo
4. Implementar parser de .srt con tests
5. Implementar módulo FFmpeg básico
