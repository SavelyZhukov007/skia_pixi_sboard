// этот файл создает содержимое сцены

import * as PIXI from 'pixi.js-legacy';

export async function buildScene(): Promise<PIXI.Container> {
  const mainContainer = new PIXI.Container(); // инициализируем главный контейнер, который будет содержать все объекты сцены
  const subContainer = new PIXI.Container(); // инициализируем вспомогательный контейнер, который будет содержать только линии. его смысл в том, чтобы организовать объекты иерархически и применять трансформации глобально и связно между разными элементами

  // инициализируем графические объекты
  const g1 = new PIXI.Graphics();
  const g2 = new PIXI.Graphics();
  const g3 = new PIXI.Graphics();
  const g4 = new PIXI.Graphics();
  // задаем парамтеры граф объектам
  g1.beginFill('#ff0000').drawEllipse(0, 0, 200, 100).endFill();
  g1.position.set(200, 100);
  g1.angle = 30;
  g1.name = 'red-ellipse';
  enablePointer(g1); // эта функция нужно чтобы элемент мог реагировать на мышь

  g2.beginFill('#0000ff').drawRect(-50, -75, 100, 150).endFill();
  g2.position.set(120, 60);
  g2.angle = 15;
  g2.scale.set(1.5, 1.7);
  g2.name = 'blue-rectangle';
  enablePointer(g2);

  g3.lineStyle(10, '#ffffff', 1).moveTo(0, 0).lineTo(150, 100);
  g3.angle = -20;
  g3.name = 'white-line';
  enablePointer(g3);
  setLineHitArea(g3, 0, 0, 150, 100, 10); // задаем область нажатия вдоль всего отрезка

  g4.lineStyle(10, '#ffff00', 1).moveTo(0, 70).lineTo(150, -30);
  g4.angle = 20;
  g4.name = 'yellow-line';
  enablePointer(g4);
  setLineHitArea(g4, 0, 70, 150, -30, 10); // область шире видимой линии

  subContainer.position.set(75, 50); // задаем координаты вложенного контейнера
  subContainer.name = 'lines-container';
  subContainer.addChild(g3, g4); // вкладываем в контейнер дочерние элементы - 2 линии
  mainContainer.addChild(subContainer, g1, g2); // вкладываем в контейнер прямоугольник, эллипс + субконтейнер

  function square() {
    const tmp = document.createElement('canvas') as HTMLCanvasElement;
    tmp.width = 64;
    tmp.height = 64;
    const ctx = tmp.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, tmp.width, tmp.height);
    }
    return PIXI.Texture.from(tmp);
  }
  // готовимся загрузить лого как текстуру для спрайта
  let texture: PIXI.Texture;
  if (typeof window !== 'undefined' && PIXI.Assets && typeof PIXI.Assets.load === 'function') { //проверяем что мы в браузере, что есть поддержка загрузки ассетов + проверка что эта поддержка является функцией
    try {
      texture = await PIXI.Assets.load<PIXI.Texture>(`${import.meta.env.BASE_URL}assets/logo.png`); // загружаем лого и срзу интерпретируем его как элемент класса <PIXI.Texture>. await не позволяет возвращать вместо него promise
    } catch { // если картинка не нашлась заменяем ее белым квадратом 64х64 пикселя
      texture = square();
    }
  } else {
    texture = square();
  }
  const sprite = new PIXI.Sprite(texture); // создаем спрайт на основе текстуры, которая может быть либо загруженной картинкой, либо белым квадратом
  sprite.anchor.set(0.5); // выравниваем по центру
  sprite.position.set(450, 310); // задаем координату центра сцены
  sprite.angle = -12;
  sprite.scale.set(0.9);
  sprite.name = 'logo-sprite';
  enablePointer(sprite);
  mainContainer.addChild(sprite);

  return mainContainer;
}

export function buildAlternativeScene(): PIXI.Container { // создаем второй заранее подготовленный контейнер, между которым можно переключаться без повторной генерации содержимого
  const alternativeContainer = new PIXI.Container();
  alternativeContainer.name = 'alternative-container';

  const circlesContainer = new PIXI.Container(); // отдельный вложенный контейнер объединяет круги, чтобы показать работу иерархии PIXI.Container во второй сцене
  circlesContainer.position.set(60, 35);
  circlesContainer.name = 'circles-container';

  const greenCircle = new PIXI.Graphics();
  greenCircle.beginFill('#00c853').drawCircle(100, 105, 65).endFill();
  greenCircle.name = 'green-circle';
  enablePointer(greenCircle);

  const orangeCircle = new PIXI.Graphics();
  orangeCircle.beginFill('#ff6d00').drawCircle(235, 190, 85).endFill();
  orangeCircle.name = 'orange-circle';
  enablePointer(orangeCircle);

  const cyanRectangle = new PIXI.Graphics();
  cyanRectangle.beginFill('#00b8d4').drawRoundedRect(-80, -55, 160, 110, 18).endFill();
  cyanRectangle.position.set(430, 105);
  cyanRectangle.angle = -18;
  cyanRectangle.name = 'cyan-rectangle';
  enablePointer(cyanRectangle);

  const pinkLine = new PIXI.Graphics();
  pinkLine.lineStyle(14, '#ff4081', 1).moveTo(0, 0).lineTo(250, -65);
  pinkLine.position.set(230, 335);
  pinkLine.name = 'pink-line';
  enablePointer(pinkLine);
  setLineHitArea(pinkLine, 0, 0, 250, -65, 14); // добавляем такую же интерактивную область линии во втором заранее подготовленном контейнере

  circlesContainer.addChild(greenCircle, orangeCircle); // сначала собираем связанные круги во вложенном контейнере, после чего добавляем все группы в основную альтернативную сцену
  alternativeContainer.addChild(circlesContainer, cyanRectangle, pinkLine);

  return alternativeContainer;
}

const PALETTE = [0xff5252, 0x40c4ff, 0x69f0ae, 0xffd740, 0xff4081, 0xb388ff, 0xff6e40, 0x18ffff, 0xeeff41, 0x7c4dff, 0x00e676, 0xffab40, 0xea80fc, 0x448aff, 0xccff90, 0xffff00, 0xff1744, 0x00b0ff, 0x1de9b6, 0xf50057, 0xd500f9, 0x651fff, 0x2979ff, 0x00e5ff, 0x76ff03, 0xc6ff00, 0xffea00, 0xff9100, 0xff3d00, 0x64ffda];


const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]; // возвращаем случайный элемент из массива. попутно мы сохраняем тип элемента

export function addRandomShape(container: PIXI.Container): PIXI.Graphics { // добавляем рандомный графический объект в контейнер
  const g = new PIXI.Graphics(); //фигура
  const color = pick(PALETTE); // получаем рандомный цвет
  const kind = pick(['rect', 'ellipse', 'line'] as const); // получаем рандомный тип фигуры

  // далее для каждого типа фигуры заполняем ее цветом, инициализируем выбранную форму с параметрами, которые не позволяют ей быть слишком маленькой или слишком большой
  if (kind === 'rect') {
    g.beginFill(color, 0.9).drawRect(-rand(20, 60), -rand(15, 45), rand(40, 120), rand(30, 90)).endFill();
  }

  if (kind === 'ellipse') {
    g.beginFill(color, 0.9).drawEllipse(0, 0, rand(20, 70), rand(15, 50)).endFill();
  }

  if (kind === 'line') {
    const lineWidth = rand(3, 10);
    const x1 = -rand(30, 80);
    const y1 = -rand(20, 60);
    const x2 = rand(30, 80);
    const y2 = rand(20, 60);

    g.lineStyle(lineWidth, color, 1).moveTo(x1, y1).lineTo(x2, y2);
    setLineHitArea(g, x1, y1, x2, y2, lineWidth); // на случайные линии тоже надо навесить события
  }
  // задаем рандомную позицию, угол поворота, имя и навешиваем события мыши
  g.position.set(rand(60, 500), rand(60, 340));
  g.angle = rand(0, 360);
  g.name = `random-${kind}`;
  enablePointer(g);

  container.addChild(g); // созданный элемент добавляем в контейнер
  return g;
}

// функция для указателя мыши
function enablePointer(obj: PIXI.DisplayObject): void {
  obj.eventMode = 'static';
}

function setLineHitArea(line: PIXI.Graphics, x1: number, y1: number, x2: number, y2: number, lineWidth: number): void { // создает вокруг отрезка невидимый четырехугольник для событий мыши
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  const halfHitWidth = Math.max(lineWidth / 2, 8); // запас хода для курса, 8 пикселей от центра

  if (length === 0) { // если так получилось что линия является точкой, то создаем вокруг нее круг для событий мыши
    line.hitArea = new PIXI.Circle(x1, y1, halfHitWidth);
    return;
  }

  const unitX = dx / length;
  const unitY = dy / length;
  const normalX = -unitY * halfHitWidth;
  const normalY = unitX * halfHitWidth;
  const startX = x1 - unitX * halfHitWidth;
  const startY = y1 - unitY * halfHitWidth;
  const endX = x2 + unitX * halfHitWidth;
  const endY = y2 + unitY * halfHitWidth;

  line.hitArea = new PIXI.Polygon([ // продлеваем на концах линии, чтобы события срабатывали и рядом с краями тоже
    startX + normalX, startY + normalY,
    endX + normalX, endY + normalY,
    endX - normalX, endY - normalY,
    startX - normalX, startY - normalY,
  ]);
}
