# START: читать первым (короткая память проекта)
Обновлено: 18 октября 2026 (вечер). После каждой задачи Claude сам обновляет этот файл (что изменилось, что ждёт владельца). Не больше 60 строк. Длинное идёт в `docs/`.

## Что работает сейчас
- Сайт hotelsviewer.com (Astro), код в GitHub `alexbogota/hotelsviewer`. Push в `main` сам скачивает недостающие фото, собирает сайт, проверяет его и выкладывает на хостинг по FTPS.
- Страницы: главная, `/views/` (список), три вида (`/views/eiffel-tower/`, `/views/bellagio-fountains/`, `/views/niagara-falls/`), About с методикой проверки, Contact, Disclosure, Privacy, Terms, 404, `sitemap.xml`, `robots.txt`.
- 17 отелей, 48 категорий номеров с видом. Данные в `src/data/views/*.json`: точные названия номеров, что брать, что не брать, уровень доверия (pictured / listed / reported), источники. Собрано 17–18 октября 2026, ссылки в `docs/research-2026-10.md`.
- Кнопки «Check prices on Booking.com» ведут через наш адрес `/go/<отель>/` на поиск Booking.com, пока без партнёрки. Сменить на партнёрские ссылки = поправить `src/data/links.json`.
- Фото: при деплое GitHub сам берёт по одному фото на вид с Wikimedia Commons (только свободные лицензии, автор подписан под фото) и сохраняет их в репозиторий. Фото скачаны 18 октября; ночное Bellagio тёмное, при случае заменить кандидата в JSON. Если фото нет, на его месте рисунок «окно с небом».
- Страны и города (18 октября): страницы `/destinations/`, страна, город строятся сами из полей `country`, `city`, `region`, `coords` в JSON вида. Пустых стран и городов нет: страница появляется, когда в ней есть хотя бы один вид. В меню и подвале «Destinations». На странице города карта отелей Stay22: включена 18 октября, `stay22Aid` = `hotelsviewer` в `site.ts`, на живом сайте проверено.
- Stay22 (18 октября): скрипт LinkSwap стоит на всех страницах, ID в `src/data/site.ts` (`stay22Id`), в панели DeepStruct `/go/`. Privacy и Disclosure обновлены. Статус Active. Работает ли подмена наших `/go/` ссылок, видно только по кликам в панели Stay22 (ещё не проверено). Аналитики нет. Шрифты свои, не Google.

## Что ждёт владельца
1. Деплой сделан и работает (18 октября, сайт открывается, фото на месте). Переменная `FTP_SERVER_DIR=./` оставлена: защита `scripts/ftp-target.mjs` сама выбирает пустую или нашу папку, saveandplay.com не затронут.
2. Stay22: скрипт Active, карта включена (aid `hotelsviewer`). Осталось посмотреть клики в панели hub.stay22.com: подменяются ли наши `/go/` ссылки.
3. Почта `contact@hotelsviewer.com`: создать ящик или пересылку в cPanel (Email Accounts или Forwarders). Адрес указан на сайте и нужен для заявок.
4. Заявки в партнёрки, порядок в `docs/partners.md`: сразу Stay22 и Travelpayouts; после выкладки Agoda, Expedia Travel Creator Program (напрямую), GetYourGuide. Booking через CJ позже.
5. Когда будут соцсети и подписка: ссылки в `src/data/site.ts` (`social`), адрес формы Brevo в `subscribeFormUrl`. Пустые поля на сайте скрыты.

## Список кандидатов в новые виды (сделано 18 октября)
- `data/view-candidates.json`: 202 места (достопримечательности из Wikidata, по просмотрам английской Википедии за 12 месяцев). Страны, города и административные единицы отсеяны. Статусы: new / drafted / published / rejected; у rejected есть причина в `note`. Рядом с готовым видом (до 3 км) стоит пометка `near`.
- Обновляется сам каждый понедельник (GitHub → Actions → «Update view candidates», можно запустить вручную, около 5 минут). Статусы и заметки между запусками сохраняются. Коммит `[skip ci]`, сайт не выкладывается заново.
- Скрипты: `build-candidates.mjs`, `check-candidates.mjs`, `test-candidates.mjs`; команды `npm run candidates | check:candidates | test:candidates`. Из чата Wikidata недоступна: запускать только на GitHub.
- Охват пока около 330 мест, в списке 200 «новых». Хватит примерно на 100 дней по 2 вида. Позже снизить пороги `min` в `CLASSES` скрипта, чтобы список вырос.

## План дальше (подробно `docs/next-steps.md`)
1. Ежедневный автор видов на GitHub (как автор статей в saveandplay): берёт следующего кандидата со статусом new, пишет черновик JSON вида на ветку `drafts`, проверка программой, владелец говорит «ок», Claude публикует. Нужен секрет `CLAUDE_CODE_OAUTH_TOKEN` (как в saveandplay, см. там `docs/article-writer.md`).
2. Потом: Pinterest-пины по видам, страница «Coming next», партнёрские ссылки вместо поиска Booking.

## Где главное
- `src/data/views/*.json`: все виды и отели. Новый вид = новый файл по образцу.
- `data/view-candidates.json`: список мест для будущих видов (см. выше).
- `src/data/links.json`: куда ведут кнопки цен. `src/data/site.ts`: почта, соцсети, подписка.
- `scripts/`: `build-go.mjs` (переходы `/go/`), `fetch-photos.mjs` (фото), `check-site.mjs` (проверка), `make-og.py` (картинка для соцсетей).
- `CLAUDE.md`: правила и дизайн. `docs/decisions.md`: решения. `docs/partners.md`: партнёрки.

## Как запускать
- `npm install`, потом `npm run build` и `npm run check:site`. Посмотреть локально: `npm run dev`.
- На GitHub: Actions → «Deploy to hosting» → Run workflow (запустить выкладку вручную).
