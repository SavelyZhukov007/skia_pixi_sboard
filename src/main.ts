import * as PIXI from 'pixi.js-legacy';
import { initCanvasKit } from './skia/loader';
import { PixiSkiaRenderer } from './skia/renderer';
import { attachSkiaPointerEvents } from './skia/events';
import { addRandomShape, buildScene } from './scene';

const WIDTH = 560;
const HEIGHT = 400;

type CanvasKitMaybePdf = { PDFDocument?: unknown }; // тип для проверки, есть ли в CanvasKit поддержка PDF

declare global { // расширяем window, чтобы в режиме разработки можно было сохранить байты PDF для тестов
  interface Window {
    __scenePdfBytes?: Uint8Array;
  }
}

// инициализируем элементы страницы
const statusEl = document.getElementById('status') as HTMLDivElement;
const skiaInfoEl = document.getElementById('skia-info') as HTMLDivElement;
const btnRandom = document.getElementById('btn-random') as HTMLButtonElement;
const btnReset = document.getElementById('btn-reset') as HTMLButtonElement;
const btnPdf = document.getElementById('btn-pdf') as HTMLButtonElement;
const skiaCanvas = document.getElementById('skia-canvas') as HTMLCanvasElement;

const setStatus = (text: string) => { // маленькая функция для вывода статуса на страницу
  statusEl.textContent = text;
};

// главная асинхронная функция приложения: внутри загружается сцена, CanvasKit и настраиваются все кнопки
async function main(): Promise<void> {
  const app = new PIXI.Application({ // создаем PIXI-приложение с ручной отрисовкой через canvas
    width: WIDTH,
    height: HEIGHT,
    forceCanvas: true,
    background: 0x000000,
    antialias: true,
    autoStart: false,
  });

  document.getElementById('pixi-host')?.appendChild(app.view as HTMLCanvasElement); // добавляем PIXI canvas на страницу

  const scene = await buildScene(); // создаем основную сцену с фигурами, линиями и логотипом
  app.stage.addChild(scene); // добавляем сцену в главный stage, чтобы PIXI мог ее отрисовать

  const ck = await initCanvasKit(); // загружаем CanvasKit, то есть Skia для браузера
  const surface = ck.MakeCanvasSurface('skia-canvas'); // создаем Skia-поверхность на HTML canvas

  if (!surface) {
    setStatus('Не удалось создать Skia canvas.');
    return;
  }

  const renderer = new PixiSkiaRenderer(ck); // создаем рендерер, который переводит PIXI-сцену в Skia-отрисовку
  const canExportPdf = typeof (ck as CanvasKitMaybePdf).PDFDocument === 'function'; // проверяем, доступен ли экспорт PDF

  btnPdf.disabled = !canExportPdf;

  const renderScene = () => { // полная перерисовка сцены: сначала PIXI, потом Skia
    app.renderer.render(app.stage);

    const canvas = surface.getCanvas();
    canvas.clear(ck.Color(0, 0, 0, 1)); // очищаем Skia canvas перед новой отрисовкой

    try {
      const renderedNodes = renderer.render(scene, canvas); // рисуем текущую PIXI-сцену через Skia
      surface.flush(); // выводим накопленные команды Skia на экран
      skiaCanvas.dataset.renderedNodes = String(renderedNodes); // сохраняем число отрисованных объектов для проверки

      if (skiaInfoEl) skiaInfoEl.textContent = null;
      setStatus('');
    } catch (err) {
      delete skiaCanvas.dataset.renderedNodes; // если рендер сломался, удаляем старое неактуальное значение

      if (skiaInfoEl) skiaInfoEl.textContent = '';
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  renderScene(); // первая отрисовка сцены после загрузки

  const detachEvents = attachSkiaPointerEvents(skiaCanvas, scene); // подключаем клики по Skia canvas к объектам сцены
  attachSceneStatus(scene); // подключаем pointer-события к интерактивным объектам PIXI

  btnRandom.addEventListener('click', () => { // кнопка добавления случайной фигуры
    const shape = addRandomShape(scene);
    renderScene();

    const kind = (shape.name ?? 'random-shape').replace('random-', '');
    setStatus(`${kind}`);
    attachPointerStatus(shape); // новая фигура появилась после первичной настройки, поэтому события подключаем отдельно
  });

  btnReset.addEventListener('click', async () => { // кнопка сброса сцены к начальному состоянию
    scene.removeChildren(); // очищаем текущую сцену от всех объектов

    const fresh = await buildScene(); // создаем новую базовую сцену

    // переносим детей из свежей сцены в текущий контейнер, который уже подключен к app.stage
    const childrenToMove = [...fresh.children];

    childrenToMove.forEach(child => {
      fresh.removeChild(child);
      scene.addChild(child);
    });

    attachSceneStatus(scene); // заново подключаем события, потому что объекты сцены были пересозданы
    renderScene();
    setStatus('Сцена сброшена');
  });

  btnPdf.addEventListener('click', () => { // кнопка экспорта текущей сцены в PDF
    try {
      const bytes = renderer.exportPdf(scene, WIDTH, HEIGHT, 0x000000);

      if (import.meta.env.DEV) window.__scenePdfBytes = bytes; // сохраняем PDF в window

      const pdfBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer; // получаем чистый буфер из uint8, чтобы создать Blob и скачать PDF
      const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = 'scene.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => URL.revokeObjectURL(url), 0); // освобождаем временную ссылку после скачивания

      setStatus(`PDF сохранён: ${(bytes.length / 1024).toFixed(1)} КБ.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  });

  window.addEventListener('beforeunload', () => { // перед закрытием страницы освобождаем ресурсы, важно чтобы не использовать старые кешированные файлы
    detachEvents();
    renderer.destroy();
    surface.delete();
    app.destroy(true, { children: true, texture: false, baseTexture: false });
  });
}

function attachSceneStatus(root: PIXI.Container): void { // проходит по сцене и подключает события к объектам
  const bind = (obj: PIXI.DisplayObject) => {
    if (obj.eventMode === 'static' || obj.eventMode === 'dynamic') attachPointerStatus(obj);

    if (obj instanceof PIXI.Container) {
      for (const child of obj.children) bind(child); // обходим дочерние элементы контейнера, чтобы ничего не пропустить
    }
  };

  bind(root);
}

function attachPointerStatus(obj: PIXI.DisplayObject): void { // выводит pointerdown или pointerup при клике по объекту
  obj.on('pointerdown', () => setStatus('pointerdown'));
  obj.on('pointerup', () => setStatus('pointerup'));
}

main().catch((err: unknown) => { // запускаем приложение
  setStatus('Ошибка - ' + (err instanceof Error ? err.message : String(err)));
});