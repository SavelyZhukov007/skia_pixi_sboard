import * as PIXI from 'pixi.js-legacy';
import { distToSegment } from './utils';
import { getPixiGraphicsData, getShapeData, getShapeType, getPolygonPoints } from './pixi-graphics';

// подключает события мыши к skia canvas, чтобы клики работали на обоих холстах
export function attachSkiaPointerEvents(canvas: HTMLCanvasElement, root: PIXI.Container): () => void {
  const pointFromEvent = (e: PointerEvent): PIXI.Point => { // переводим  браузерные координаты мыши в координаты холста
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    return new PIXI.Point(x, y);
  };

  const emit = (target: PIXI.DisplayObject, type: 'pointerdown' | 'pointerup', global: PIXI.Point) => { // вызываем событие мыши у найденного объекта
    target.emit(type, { type, global, target } as unknown as PIXI.FederatedPointerEvent);
  };

  const handle = (type: 'pointerdown' | 'pointerup') => (e: PointerEvent) => { // общая функция-обработчик для pointerdown и pointerup
    const global = pointFromEvent(e);
    const target = hitTest(root, global);
    if (!target) return;

    emit(target, type, global);
  };

  const down = handle('pointerdown');
  const up = handle('pointerup');

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointerup', up);

  return () => { // функция очистки, чтобы снять обработчики 
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointerup', up);
  };
}

// проверка попадания по объекту - пересчитывает трансформации и ищет объект под курсором
export function hitTest(node: PIXI.DisplayObject, global: PIXI.Point): PIXI.DisplayObject | null {
  updateWorldTransforms(node, node.parent?.worldTransform ?? new PIXI.Matrix()); // элементы хранятся иерархически и сдвиги внутри влияют на сцену, поэтому нужно пересчитать все трансформации, чтобы получить правильные координаты для проверки попадания
  return findHit(node, global);
}

function findHit(node: PIXI.DisplayObject, global: PIXI.Point): PIXI.DisplayObject | null { // эта функция обходит сцену по слоям и ищет объект под курсором
  if (!node.visible || !node.renderable) return null;

  // если объект является контейнером, сначала проверяем его дочерние элементы
  if (node instanceof PIXI.Container) {
    for (let i = 0; i < node.children.length; i++) {
      const hit = findHit(node.children[i], global);
      if (hit) return hit;
    }
  }

  if (!isInteractive(node)) return null; // чтобы не считать попадания по фону, проверяем, может ли объект вообще реагировать на pointer-события, так как уверены в том, что на все нужные эллементы висит событие мыши

  // если у объекта задана своя hitArea, проверяем попадание через нее
  if (node.hitArea) {
    const local = node.worldTransform.applyInverse(global);
    if (node.hitArea.contains(local.x, local.y)) return node;
  }

  // отдельно проверяем Graphics и Sprite, потому что у них разные способы проверки попадания
  if (node instanceof PIXI.Graphics && hitGraphics(node, global)) return node;
  if (node instanceof PIXI.Sprite && node.containsPoint(global)) return node;

  return null;
}

// пересчитывает worldTransform для объекта и всех его детей, чтобы hitTest работал с учетом координат
function updateWorldTransforms(node: PIXI.DisplayObject, parentWorld: PIXI.Matrix): void {
  node.transform.updateLocalTransform();
  node.worldTransform.copyFrom(node.localTransform);
  node.worldTransform.prepend(parentWorld);

  if (node instanceof PIXI.Container) {
    for (const child of node.children) {
      updateWorldTransforms(child, node.worldTransform);
    }
  }
}

function isInteractive(node: PIXI.DisplayObject): boolean { // проверяем, может ли объект вообще реагировать на pointer-события
  return node.eventMode === 'static' || node.eventMode === 'dynamic' || node.interactive === true;
}

// проверяет попадание по PIXI.Graphics, включая не только заливки, но и линии, так как оные добавляются в субконтейнер, им нужна своя функция проверки
function hitGraphics(g: PIXI.Graphics, global: PIXI.Point): boolean {
  if (g.containsPoint(global)) return true; // сначала пробуем стандартную проверку pixi

  const local = g.worldTransform.applyInverse(global);
  const graphicsData = getPixiGraphicsData(g);
  const halfWidth = (lineWidth: number) => Math.max(0, lineWidth / 2);

  for (const data of graphicsData) {
    const { shape, line } = getShapeData(data);
    if (!line.visible || line.width <= 0) continue;

    const type = getShapeType(shape);
    const w = halfWidth(line.width);

    if (type === PIXI.SHAPES.POLY) { // для линий проверяем расстояние от точки до каждого сегмента
      const pts = getPolygonPoints(shape);
      if (pts && pts.length >= 4) { // каждая фигура имеет минимум 4 точки и проходим по каждой паре точек, координату идут парами x1, y1, x2, y2 и тд
        for (let i = 0; i + 3 < pts.length; i += 2) {
          if (distToSegment(local.x, local.y, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]) <= w) { // считает расстояние до отрезка для линий и возвращает значение в пикселях
            return true;
          }
        }
      }
      continue;
    }

    if (type === PIXI.SHAPES.CIRC) { // для окружности проверяем, находится ли точка рядом с границей обводки
      const c = shape as PIXI.Circle;
      const dx = local.x - c.x;
      const dy = local.y - c.y;
      const dist = Math.hypot(dx, dy);
      if (Math.abs(dist - c.radius) <= w)
        return true;
      continue;
    }

    if (type === PIXI.SHAPES.ELIP) { // для эллипса используем приближенную проверку расстояния до его границы
      const e = shape as PIXI.Ellipse;
      const dx = (local.x - e.x) / Math.max(1, e.width);
      const dy = (local.y - e.y) / Math.max(1, e.height);
      const dist = Math.hypot(dx, dy);
      if (Math.abs(dist - 1) <= w / Math.max(e.width, e.height))
        return true;
      continue;
    }

    if (type === PIXI.SHAPES.RECT || type === PIXI.SHAPES.RREC) { // для прямоугольников проверяем попадание именно в область обводки
      const r = shape as PIXI.Rectangle | PIXI.RoundedRectangle;

      const minX = r.x - w;
      const maxX = r.x + r.width + w;
      const minY = r.y - w;
      const maxY = r.y + r.height + w;

      if (local.x >= minX && local.x <= maxX && local.y >= minY && local.y <= maxY) {
        const innerMinX = r.x + w;
        const innerMaxX = r.x + r.width - w;
        const innerMinY = r.y + w;
        const innerMaxY = r.y + r.height - w;
        const insideFill = local.x > innerMinX && local.x < innerMaxX && local.y > innerMinY && local.y < innerMaxY;

        if (!insideFill) return true;
      }
    }
  }

  return false;
}