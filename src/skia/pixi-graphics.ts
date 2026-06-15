import * as PIXI from 'pixi.js-legacy';
// здесь работа с внутренними типами pixi, чтобы быстро и удобно доставать данные фигур из контейнера
export interface ExtractedShapeData { // интерфейс данных для фигур
  shape: PIXI.Rectangle | PIXI.Circle | PIXI.Ellipse | PIXI.Polygon | PIXI.RoundedRectangle;
  fill: PIXI.FillStyle;
  line: PIXI.LineStyle;
  matrix: PIXI.Matrix | null;
}

export type SupportedShape = ExtractedShapeData['shape']; // отдельный тип для всех фигур главного контейнера

type PixiInternalGeometry = { // это тип для доступа к внутренней структуре PIXI.Graphics, которая содержит массив graphicsData с данными о каждой нарисованной фигуре
  graphicsData?: PIXI.GraphicsData[];
};

function getInternalGeometry(graphics: PIXI.Graphics): PixiInternalGeometry | undefined { // достаем данные с помощью приведения типов
  return (graphics as unknown as { geometry?: PixiInternalGeometry }).geometry;
}


// возвращает список фигур, которые были нарисованы внутри одного контейнера grapichs
export function getPixiGraphicsData(graphics: PIXI.Graphics): PIXI.GraphicsData[] { 
  graphics.finishPoly(); // сохраняем переданные объекты

  const geometry = getInternalGeometry(graphics);
  const data = geometry?.graphicsData;

  return Array.isArray(data) ? data : []; // возвращаем массив если таковой имеется, иначе передаем пустой
}

export function getShapeData(data: PIXI.GraphicsData): ExtractedShapeData { // берем из фигуры нужные параметры
  return {
    shape: data.shape as SupportedShape,
    fill: data.fillStyle,
    line: data.lineStyle,
    matrix: data.matrix ?? null,
  };
}

export function getShapeType(shape: SupportedShape): number { // достает числовой тип фигуры: RECT, 
  return (shape as { type: number }).type;
}
// для линии достаем уникальные для нее данные, так как она отличается от фомрата данных других фигур
export function getLineDash(line: PIXI.LineStyle): number[] | null { 
  // если линия существует, то она возвращает массив, в противном случае ее нету, тогда возвращаем пустой массив
  const dash = (line as { dash?: number[] }).dash;
  return Array.isArray(dash) ? dash : null;
}

export function getPolygonPoints(shape: SupportedShape): number[] | null { // для фигур отличных от линии получаем координвты точек в массиве
  if (getShapeType(shape) === PIXI.SHAPES.POLY) {
    return (shape as PIXI.Polygon).points;
  }
  return null; // в противном случае фигуры нету
}