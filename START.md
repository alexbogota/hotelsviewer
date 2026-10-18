# START: читать первым (короткая память проекта)
Обновлено: 18 октября 2026. После каждой задачи Claude сам обновляет этот файл (что изменилось, что ждёт владельца). Не больше 60 строк. Длинное идёт в `docs/`.

## Что работает сейчас
- Сайт hotelsviewer.com (Astro), код в GitHub `alexbogota/hotelsviewer`. Push в `main` сам скачивает недостающие фото, собирает сайт, проверяет его и выкладывает на хостинг по FTPS.
- Страницы: главная, `/views/` (список), три вида (`/views/eiffel-tower/`, `/views/bellagio-fountains/`, `/views/niagara-falls/`), About с методикой проверки, Contact, Disclosure, Privacy, Terms, 404, `sitemap.xml`, `robots.txt`.
- 17 отелей, 48 категорий номеров с видом. Данные в `src/data/views/*.json`: точные названия номеров, что брать, что не брать, уровень доверия (pictured / listed / reported), источники. Собрано 17–18 октября 2026, ссылки в `docs/research-2026-10.md`.
- Кнопки «Check prices on Booking.com» ведут через наш адрес `/go/<отель>/` на поиск Booking.com, пока без партнёрки. Сменить на партнёрские ссылки = поправить `src/data/links.json`.
- Фото: при деплое GitHub сам берёт по одному фото на вид с Wikimedia Commons (только свободные лицензии, автор подписан под фото) и сохраняет их в репозиторий. Фото скачаны 18 октября; ночное Bellagio тёмное, при случае заменить кандидата в JSON. Если фото нет, на его месте рисунок «окно с небом».
- Страны и города (18 октября): страницы `/destinations/`, страна, город строятся сами из полей `country`, `city`, `region`, `coords` в JSON вида. Пустых стран и городов нет: страница появляется, когда в ней есть хотя бы один вид. В меню и подвале «Destinations». На странице города карта отелей Stay22, она включится, когда в `site.ts` будет `stay22Aid`.
- Stay22 (18 октября): скрипт LinkSwap стоит на всех страницах, ID в `src/data/site.ts` (`stay22Id`), в панели DeepStruct `/go/`. Privacy и Disclosure обновлены. Проверить в панели Stay22, что статус стал Active и что наши `/go/` ссылки подменяются. Аналитики нет. Шрифты свои, не Google.

## Что ждёт владельца
1. Деплой сделан и работает (18 октября, сайт открывается, фото на месте). Переменная `FTP_SERVER_DIR=./` оставлена: защита `scripts/ftp-target.mjs` сама выбирает пустую или нашу папку, saveandplay.com не затронут.
2. Stay22: скрипт Active (18 октября). Нужен партнёрский ID для карты (`aid`): найти в панели hub.stay22.com и прислать Claude.
3. Почта `contact@hotelsviewer.com`: создать ящик или пересылку в cPanel (Email Accounts или Forwarders). Адрес указан на сайте и нужен для заявок.
4. Заявки в партнёрки, порядок в `docs/partners.md`: сразу Stay22 и Travelpayouts; после выкладки Agoda, Expedia Travel Creator Program (напрямую), GetYourGuide. Booking через CJ позже.
5. Когда будут соцсети и подписка: ссылки в `src/data/site.ts` (`social`), адрес формы Brevo в `subscribeFormUrl`. Пустые поля на сайте скрыты.

## Где главное
- `src/data/views/*.json`: все виды и отели. Новый вид = новый файл по образцу.
- `src/data/links.json`: куда ведут кнопки цен. `src/data/site.ts`: почта, соцсети, подписка.
- `scripts/`: `build-go.mjs` (переходы `/go/`), `fetch-photos.mjs` (фото), `check-site.mjs` (проверка), `make-og.py` (картинка для соцсетей).
- `CLAUDE.md`: правила и дизайн. `docs/decisions.md`: решения. `docs/partners.md`: партнёрки.

## Как запускать
- `npm install`, потом `npm run build` и `npm run check:site`. Посмотреть локально: `npm run dev`.
- На GitHub: Actions → «Deploy to hosting» → Run workflow (запустить выкладку вручную).
