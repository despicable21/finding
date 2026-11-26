/**
 * Публичная конфигурация анкеты (этот файл попадает на GitHub Pages).
 *
 * ВАЖНО: здесь НЕ должно быть правильных ответов блица — они хранятся
 * только на сервере (backend/Code.gs). Демо-вопросы для локальной проверки
 * лежат в demo-questions.js, который в репозиторий не загружается.
 *
 * Когда настроишь Google Apps Script (см. SETUP.md), вставь URL веб-приложения
 * в API_URL — сайт перейдёт в боевой режим.
 */
window.APP_CONFIG = {
  // Вставь сюда URL веб-приложения Google Apps Script, например:
  // "https://script.google.com/macros/s/AKfycb.../exec"
  API_URL: "https://script.google.com/macros/s/AKfycbwLVEexDLYXFtWtXqHGCSR01oxwQt-e9thfJaHxz1ptA3FNnMhdTpJD5xTz8Ej-6PB8Uw/exec",

  // Секунд на каждый вопрос блица
  BLITZ_SECONDS_PER_QUESTION: 10,

  // Словарь локаций для параметра ?src=... в QR-кодах (Калининград и область)
  LOCATIONS: {
    amalienau: "Амалиенау",
    verhnee: "Верхнее озеро",
    zarya: "Кинотеатр «Заря»",
    bc: "Бизнес-центры",
    center: "Центр / Кофейни",
    sea: "Побережье (Светлогорск / Зеленоградск)",
    svetlogorsk: "Светлогорск",
    zelenogradsk: "Зеленоградск",
    barber: "Барбершоп / Детейлинг",
    book: "Книга / Буккроссинг",
    direct: "Прямой переход"
  }
};
