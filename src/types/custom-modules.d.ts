declare module '*.wasm?url' {
    const url: string;
    export default url;
}
// декларируем этот модуль чтобы typescript понимал что при импортировании этот модуль воспринимать как строку-url