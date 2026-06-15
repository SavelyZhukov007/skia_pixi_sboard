# sBoard (Pixi + Skia)

## Запуск

```bash
npm ci
npm run dev
```

## Сборка

```bash
npm run build
```

## Тесты

```bash
npm test
```

## Проверка PDF

После экспорта сохраните файл как `scene.pdf` в корне проекта и выполните эту команду, она покажет является pdf векторынм или растровым:

```bash
npm run verify:pdf
```

## Кастомная сборка CanvasKit

Для поддержки PDF-экспорта используется сборка CanvasKit

`public/canvaskit/`

`skia-build/pdf_bindings.cpp`

---

Репозиторий: https://github.com/SavelyZhukov007/sBoard  
Демо: https://savelyzhukov007.github.io/sBoard/
