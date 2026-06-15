import CanvasKitInit, { type CanvasKit } from 'canvaskit-wasm';
import wasmUrl from 'canvaskit-wasm/bin/canvaskit.wasm?url';

type CanvasKitFactory = typeof CanvasKitInit; //  загружает и возвращает CanvasKit api

declare global { // расширяем window, потому что кастомный canvaskit.js кладет CanvasKitInit именно туда
  interface Window {
    CanvasKitInit?: CanvasKitFactory;
  }
}

// использует кастомную сборку для pdf экспорта
export async function initCanvasKit(): Promise<CanvasKit> {
  const baseUrl = import.meta.env.BASE_URL;
  const customFactory = await loadCustomCanvasKit(baseUrl);

  if (customFactory) { // если кастомная сборка найдена, загружаем wasm файлы из папки canvaskit
    return customFactory({ locateFile: (file: string) => `${baseUrl}canvaskit/${file}` });
  }

  return CanvasKitInit({ locateFile: () => wasmUrl });
}

async function loadCustomCanvasKit(baseUrl: string): Promise<CanvasKitFactory | null> {
  const scriptUrl = `${baseUrl}canvaskit/canvaskit.js`;
  const moduleLoaderUrl = `${baseUrl}canvaskit/canvaskit-loader.js`;

  try {
    const response = await fetch(scriptUrl, { method: 'HEAD' }); // проверяем, существует ли кастомный canvaskit.js
    if (!response.ok) return null;

    const moduleLoader = await fetch(moduleLoaderUrl, { method: 'HEAD' }); // проверяем, есть ли отдельный модуль загрузки для кастомной сборки
    if (moduleLoader.ok) {
      await appendScript(moduleLoaderUrl, 'module');
      return window.CanvasKitInit ?? null;
    }

    await appendScript(scriptUrl); // если модуля загрузки нет используем по умолчанию

    return window.CanvasKitInit ?? null;
  } catch {
    return null; // если сборка не загрузилась возвращаемся к npm-варианту
  }
}

function appendScript(src: string, type?: 'module'): Promise<void> { // добавляет скрипт на страницу и ждет его загрузки, пока promise не заменится
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');

    script.src = src;
    if (type) script.type = type;

    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Не удалось загрузить ${src}.`));

    document.head.appendChild(script);
  });
}