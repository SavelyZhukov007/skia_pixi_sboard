import type { Canvas, CanvasKit, Image as SkImage, Paint } from 'canvaskit-wasm';
import * as PIXI from 'pixi.js-legacy';
import { pixiColorToRgba, pixiMatrixToSkia } from './utils';
import { getPixiGraphicsData, getShapeData, ExtractedShapeData, getLineDash, getShapeType } from './pixi-graphics';

// этот файл переводит структуру PIXI.Container в команды CanvasKit, чтобы одна сцена одинаково отображалась на PIXI и SKIA canvas
type SkiaPdfDocument = { // описываем минимальный набор методов PDFDocument, который нужен для экспорта сцены в PDF
  beginPage(width: number, height: number): Canvas | null;
  endPage(): void;
  close(): Uint8Array | ArrayBuffer | void;
  getBytes?(): Uint8Array | ArrayBuffer | null;
  delete(): void;
};

type CanvasKitWithPdf = CanvasKit & { // расширяем стандартный CanvasKit поддержкой PDF, потому что она есть только в кастомной сборке
  PDFDocument?: new (metadata?: unknown) => SkiaPdfDocument;
  PDFMetadata?: new () => { delete(): void };
};

// интерфейс TypeScript-обертки для рендера PIXI.Container через CanvasKit
export interface PixiSkiaRendererApi {
  render(container: PIXI.Container, canvas: Canvas): number; // рендерит контейнер на Skia Canvas и возвращает количество обработанных объектов

  exportPdf(container: PIXI.Container, width: number, height: number): Uint8Array; // экспортирует сцену в PDF и возвращает байты файла

  destroy(): void; // освобождает ресурсы Skia, которые нельзя оставлять в памяти
}

// основной класс, который переводит PIXI-сцену в команды Skia
export class PixiSkiaRenderer implements PixiSkiaRendererApi {
  private imageCache = new Map<PIXI.BaseTexture, SkImage>(); // кэшируем картинки, чтобы не пересоздавать SkImage при каждом рендере

  constructor(private readonly ck: CanvasKitWithPdf) { }

  render(container: PIXI.Container, canvas: Canvas): number {
    const stats = { count: 0 };

    this.drawNode(container, canvas, 1, stats); // запускаем рекурсивный обход сцены с корневого контейнера

    return stats.count;
  }

  exportPdf(container: PIXI.Container, width: number, height: number, backgroundColor: number = 0x000000): Uint8Array {
    if (!this.ck.PDFDocument) {
      throw new Error('Error: PDF недоступен');
    }

    const metadata = this.ck.PDFMetadata ? new this.ck.PDFMetadata() : null;
    const doc = new this.ck.PDFDocument(metadata ?? undefined);
    const pageCanvas = doc.beginPage(width, height);

    if (!pageCanvas) {
      doc.delete();
      metadata?.delete();
      throw new Error('Не удалось создать PDF-страницу.');
    }

    this.drawBackground(pageCanvas, width, height, backgroundColor); // рисуем фон PDF-страницы
    this.render(container, pageCanvas); // рисуем ту же PIXI-сцену, но уже не на экран, а в PDF canvas

    doc.endPage();

    const closedBytes = doc.close();
    const view = closedBytes ?? doc.getBytes?.() ?? null;

    if (!view) {
      doc.delete();
      metadata?.delete();
      throw new Error('Не удалось получить байты PDF.');
    }

    const bytes = view instanceof Uint8Array ? new Uint8Array(view) : new Uint8Array(view);

    doc.delete();
    metadata?.delete();

    return bytes;
  }

  destroy(): void {
    for (const image of this.imageCache.values()) {
      image.delete(); // Skia-объекты нужно удалять вручную, иначе может быть утечка памяти
    }

    this.imageCache.clear();
  }

  private drawNode(obj: PIXI.DisplayObject, canvas: Canvas, parentAlpha: number, stats: { count: number }): void {
    if (!obj.visible || !obj.renderable || obj.alpha <= 0) return;

    stats.count++;

    const alpha = parentAlpha * obj.alpha; // итоговая прозрачность учитывает прозрачность родителя и самого объекта

    canvas.save(); // сохраняем состояние canvas, чтобы трансформации объекта не влияли на следующие объекты

    obj.transform.updateLocalTransform();
    canvas.concat(pixiMatrixToSkia(obj.localTransform)); // применяем позицию, масштаб и поворот PIXI-объекта к Skia canvas

    if (obj instanceof PIXI.Graphics) {
      this.drawGraphics(obj, canvas, alpha);
    } else if (obj instanceof PIXI.Sprite) {
      this.drawSprite(obj, canvas, alpha);
    }

    if (obj instanceof PIXI.Container) { // если объект является контейнером, рекурсивно рисуем всех его детей
      for (const child of obj.children) {
        this.drawNode(child, canvas, alpha, stats);
      }
    }

    canvas.restore(); // возвращаем canvas к предыдущему состоянию после отрисовки текущего объекта
  }

  private drawGraphics(g: PIXI.Graphics, canvas: Canvas, alpha: number): void {
    const graphicsData = getPixiGraphicsData(g);

    for (const data of graphicsData) {
      this.drawShape(data, canvas, alpha); // один PIXI.Graphics может содержать несколько фигур, поэтому рисуем каждую отдельно
    }
  }

  private drawShape(data: PIXI.GraphicsData, canvas: Canvas, alpha: number): void {
    const extracted: ExtractedShapeData = getShapeData(data);
    const { shape, fill, line, matrix } = extracted;

    const path = this.shapeToPath(shape, matrix); // переводим фигуру PIXI в путь Skia

    if (fill.visible) { // если у фигуры есть заливка, рисуем ее через PaintStyle.Fill
      const paint = new this.ck.Paint();

      paint.setAntiAlias(true);
      paint.setStyle(this.ck.PaintStyle.Fill);
      paint.setColor(this.ck.Color4f(...pixiColorToRgba(fill.color, fill.alpha * alpha)));

      canvas.drawPath(path, paint);

      paint.delete();
    }

    if (line.visible && line.width > 0) { // если у фигуры есть обводка, рисуем ее отдельным Paint в режиме Stroke
      const paint = new this.ck.Paint();

      paint.setAntiAlias(true);
      paint.setStyle(this.ck.PaintStyle.Stroke);
      paint.setStrokeWidth(line.width);
      this.applyStrokeOptions(paint, line);
      paint.setColor(this.ck.Color4f(...pixiColorToRgba(line.color, line.alpha * alpha)));

      canvas.drawPath(path, paint);

      paint.delete();
    }

    path.delete();
  }

  private shapeToPath(
    shape: PIXI.Rectangle | PIXI.Circle | PIXI.Ellipse | PIXI.Polygon | PIXI.RoundedRectangle,
    matrix: PIXI.Matrix | null,
  ) {
    if (typeof this.ck.PathBuilder !== 'function') {
      throw new Error('CanvasKit.PathBuilder недоступен в этой сборке. Используй кастомную сборку из skia-build/.');
    }

    const path = new this.ck.PathBuilder();
    const type = getShapeType(shape);

    // в зависимости от типа PIXI-фигуры создаем соответствующий Skia path
    switch (type) {
      case PIXI.SHAPES.RECT: {
        const r = shape as PIXI.Rectangle;
        path.addRect(this.ck.XYWHRect(r.x, r.y, r.width, r.height));
        break;
      }

      case PIXI.SHAPES.RREC: {
        const r = shape as PIXI.RoundedRectangle;
        path.addRRect(this.ck.RRectXY(this.ck.XYWHRect(r.x, r.y, r.width, r.height), r.radius, r.radius));
        break;
      }

      case PIXI.SHAPES.CIRC: {
        const c = shape as PIXI.Circle;
        path.addCircle(c.x, c.y, c.radius);
        break;
      }

      case PIXI.SHAPES.ELIP: {
        const e = shape as PIXI.Ellipse;
        path.addOval(this.ck.XYWHRect(e.x - e.width, e.y - e.height, e.width * 2, e.height * 2));
        break;
      }

      case PIXI.SHAPES.POLY: {
        const p = shape as PIXI.Polygon;
        const pts = p.points;

        if (pts.length >= 2) {
          path.moveTo(pts[0], pts[1]);

          for (let i = 2; i + 1 < pts.length; i += 2) {
            path.lineTo(pts[i], pts[i + 1]);
          }

          if (p.closeStroke) path.close();
        }

        break;
      }

      default:
        path.delete();
        throw new Error(`Unsupported PIXI shape type: ${type}`);
    }

    if (matrix) path.transform(pixiMatrixToSkia(matrix)); // если у фигуры есть своя матрица, применяем ее к path

    return path.detachAndDelete(); // забираем готовый path из PathBuilder и удаляем builder
  }

  private drawSprite(sprite: PIXI.Sprite, canvas: Canvas, alpha: number): void {
    const texture = sprite.texture;
    if (!texture.valid) return;

    const image = this.skImageFor(texture.baseTexture);
    if (!image) return;

    const frame = texture.frame;

    const src = this.ck.XYWHRect(frame.x, frame.y, frame.width, frame.height); // область внутри исходной текстуры
    const dst = this.ck.XYWHRect(
      -sprite.anchor.x * frame.width,
      -sprite.anchor.y * frame.height,
      frame.width,
      frame.height,
    ); // область отрисовки с учетом anchor спрайта

    const paint = new this.ck.Paint();

    paint.setAlphaf(alpha);
    canvas.drawImageRect(image, src, dst, paint); // рисуем спрайт как изображение внутри Skia canvas

    paint.delete();
  }

  private skImageFor(base: PIXI.BaseTexture): SkImage | null {
    const cached = this.imageCache.get(base);
    if (cached) return cached;

    const source = (base.resource as { source?: CanvasImageSource } | null | undefined)?.source;
    if (!source || base.realWidth <= 0 || base.realHeight <= 0) return null;

    const tmp = document.createElement('canvas'); // временный canvas нужен, чтобы достать пиксели изображения из PIXI BaseTexture
    tmp.width = base.realWidth;
    tmp.height = base.realHeight;

    const ctx = tmp.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(source, 0, 0);

    const pixels = ctx.getImageData(0, 0, base.realWidth, base.realHeight);
    const image = this.ck.MakeImage(
      {
        width: base.realWidth,
        height: base.realHeight,
        colorType: this.ck.ColorType.RGBA_8888,
        alphaType: this.ck.AlphaType.Unpremul,
        colorSpace: this.ck.ColorSpace.SRGB,
      },
      new Uint8Array(pixels.data.buffer),
      4 * base.realWidth,
    );

    if (image) this.imageCache.set(base, image); // сохраняем созданное SkImage в кэш, чтобы не создавать его повторно

    return image;
  }

  private applyStrokeOptions(paint: Paint, line: PIXI.LineStyle): void {
    // переносим настройки концов линии из PIXI в Skia
    if (line.cap === PIXI.LINE_CAP.ROUND) paint.setStrokeCap(this.ck.StrokeCap.Round);
    else if (line.cap === PIXI.LINE_CAP.SQUARE) paint.setStrokeCap(this.ck.StrokeCap.Square);
    else paint.setStrokeCap(this.ck.StrokeCap.Butt);

    // переносим настройки соединения линий из PIXI в Skia
    if (line.join === PIXI.LINE_JOIN.ROUND) paint.setStrokeJoin(this.ck.StrokeJoin.Round);
    else if (line.join === PIXI.LINE_JOIN.BEVEL) paint.setStrokeJoin(this.ck.StrokeJoin.Bevel);
    else paint.setStrokeJoin(this.ck.StrokeJoin.Miter);

    paint.setStrokeMiter(line.miterLimit);

    const dash = getLineDash(line); // поддержка пунктирных линий, если dash указан в lineStyle
    if (dash && dash.length > 0 && typeof this.ck.PathEffect?.MakeDash === 'function') {
      const effect = this.ck.PathEffect.MakeDash(dash, 0);

      if (effect) {
        paint.setPathEffect(effect);
        effect.delete();
      }
    }
  }

  private drawBackground(canvas: Canvas, width: number, height: number, color: number = 0x000000): void {
    const r = ((color >> 16) & 0xff) / 255;
    const g = ((color >> 8) & 0xff) / 255;
    const b = (color & 0xff) / 255;

    const paint = new this.ck.Paint();

    paint.setStyle(this.ck.PaintStyle.Fill);
    paint.setColor(this.ck.Color4f(r, g, b, 1));
    canvas.drawRect(this.ck.XYWHRect(0, 0, width, height), paint); // рисуем прямоугольник фона на весь размер страницы или canvas

    paint.delete();
  }
}
