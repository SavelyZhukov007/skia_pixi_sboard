#include "include/core/SkCanvas.h"
#include "include/core/SkData.h"
#include "include/core/SkStream.h"
#include "include/docs/SkPDFDocument.h"

#include <emscripten/bind.h>
#include <emscripten/val.h>

using namespace emscripten;

// этот файл играет роль моста между нативным PDF api Skia и TypeScript через Emscripten
// он нужен только во время отдельной сборки кастомного CanvasKit и не компилируется командами npm run build или vite build
namespace
{
    class PDFDocument
    {
    public:
        PDFDocument()
        { // создаем новый pdf документ skia и присваиваем ему метаданные
            SkPDF::Metadata meta;
            meta.fTitle = "scene";
            meta.fCreator = "sboard-pixi-skia";
            document = SkPDF::MakeDocument(&stream, meta); // создаем pdf документ, который записывает данные в его поток
        }

        SkCanvas *beginPage(float width, float height)
        { // создаем pdf страницу
            return document ? document->beginPage(width, height) : nullptr;
        }

        void endPage()
        { // указываем конец страницы
            if (document)
                document->endPage();
        }

        void close()
        { // прекращаем запись, закрываем документ
            if (!document)
                return;
            document->close();
            data = stream.detachAsData();
            document.reset();
        }

        val getBytes() const
        { // возвращает байты готового PDF в JavaScript как Uint8Array-подобное представление
            if (!data)
                return val::null();
            return val(typed_memory_view(data->size(), data->bytes()));
        }

    private:
        SkDynamicMemoryWStream stream; // поток, куда последовательно записываем содержимое pdf
        sk_sp<SkDocument> document; // храним создаваемый документ до вызова close
        sk_sp<SkData> data; // сохраняем готовые байты pdf после закрытия документа
    };

}

// используем emscripten, чтобы экспортировать класс PDFDocument из wasm в JavaScript и затем вызвать его из TypeScript
EMSCRIPTEN_BINDINGS(skia_pdf_backend)
{
    class_<PDFDocument>("PDFDocument")
        .constructor<>() // инициализируем
        // экспортируем функции
        .function("beginPage", &PDFDocument::beginPage, allow_raw_pointers())
        .function("endPage", &PDFDocument::endPage)
        .function("close", &PDFDocument::close)
        .function("getBytes", &PDFDocument::getBytes);
}
