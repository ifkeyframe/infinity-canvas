# Infinity Canvas для генерации пиксель-арта

## Task
Веб-приложение «бесконечный холст» (infinity canvas) для генерации пиксель-арта. Пользователь создаёт на холсте именованные области, задаёт им разрешение, кладёт внутрь изображения с подписями, затем выделяет область, пишет промпт и запускает генерацию — результат-картинка появляется в свободной области холста. Деплой на Hetzner (CX33, без GPU) через Coolify. Генерация — через внешний API (на CX33 модель не крутится).

## Business context

### Уточнённая задача
MVP бесконечного холста для пиксель-арта, для одного пользователя, без авторизации. Состояние холста (области, картинки, их позиции/подписи/разрешения) хранится на сервере. На холсте можно: панорамировать/зумить, создавать области, давать им имя, задавать разрешение выхода, добавлять в область изображения и подписывать их. Подпись = семантический ярлык («персонаж», «дерево»), который в MVP уходит в промпт как текст. Генерация запускается с выбранной области: промпт + подписи → внешний API (fal.ai/Replicate) с пиксель-арт моделью → результат рисуется в свободной области рядом.

### Пользователи и сценарии
- **Владелец (единственный юзер, без логина):** работает со своим холстом с любого устройства; холст один общий, живёт на сервере.
- **Золотой путь:** создать область → назвать → (опц.) добавить картинки и подписать → задать разрешение → написать промпт → «Старт» → дождаться → получить сгенерированную картинку в новой области.
- **Навигация:** pan (перетаскивание холста) + zoom (колесо/жесты).

### Edge cases (обсуждённые с пользователем)
- Генерация падает (ошибка API / timeout / 4xx-5xx) → показать ошибку на области-результате, холст не ломать, дать «повторить».
- Пустой промпт → кнопка «Старт» неактивна / подсказка.
- Несколько генераций подряд → индикатор загрузки на области + очередь/блокировка повторного старта той же области.
- Куда падает результат → новая область в свободном месте рядом с исходной (или у курсора), пользователь может подвинуть.
- Перезагрузка страницы во время генерации → состояние «генерируется» должно восстановиться или корректно сброситься.

### Ограничения и приоритеты
- **Приоритет:** быстро рабочий MVP, минимум сущностей, минимум кода.
- CX33 без GPU → генерация исключительно через внешний API.
- Деплой через Coolify (`git push` → webhook → деплой), как у прошлых проектов.
- i18n: **не требуется** (личный инструмент, один язык UI). Текст UI держать в одном месте, но без машинерии перевода.
- Авторизация: **не требуется** в MVP (но эндпоинт генерации не должен быть открыт для злоупотребления — хотя бы простой серверный ключ/нет публичного промоушена).

### Явно НЕ входит в scope (MVP)
- Визуальное кондиционирование (IP-Adapter / img2img) — пиксели добавленных картинок пока НЕ влияют на генерацию, только подписи как текст.
- Агент, обходящий все поля и собирающий глобальный промпт.
- Чат-интерфейс для итеративной генерации (здания, анимации и т.п.).
- ComfyUI-оркестратор.
- Мультиюзер, аккаунты, шаринг холстов.

### Приёмочные критерии
- [ ] Открывается бесконечный холст с pan/zoom.
- [ ] Можно создать область, дать имя, задать разрешение выхода.
- [ ] Можно добавить изображение(я) в область и подписать их.
- [ ] Состояние холста сохраняется на сервере и восстанавливается после перезагрузки.
- [ ] На выделенной области есть поле промпта и кнопка «Старт».
- [ ] Промпт + подписи уходят во внешний API, результат — пиксель-арт, появляется в новой области.
- [ ] Ошибки генерации показываются, не ломая холст.
- [ ] Задеплоено на Hetzner через Coolify.

### ⚠️ Открытые вопросы (для следующих агентов / research)
- Конкретный провайдер и модель (fal.ai vs Replicate; какая pixel-art модель) — выясняет research-агент.
- Нужно ли искать «свободное место» под результат автоматически, или класть по фикс-смещению от исходной области.
- Формат хранения состояния холста (tldraw snapshot JSON vs своя нормализованная модель).

## Research notes

**Провайдер/модель (итог research, 2026-06-22):**
- **Retro Diffusion (RD)** — единственное семейство, обученное на настоящий pixel-art. На **fal.ai отсутствует**. Доступно:
  - **Replicate:** `retro-diffusion/rd-fast` (быстрая, 64–384px, 15 стилей), `rd-plus` (качество), `rd-tile`, `rd-animation`. SDK `replicate`, env `REPLICATE_API_TOKEN`, sync `replicate.run("retro-diffusion/rd-fast",{input})`, ответ — FileOutput/URL на CDN.
  - **RD direct API:** `POST https://api.retrodiffusion.ai/v1/inferences`, header `X-RD-Token`, payload `{prompt,width,height,num_images,prompt_style,seed?,strength?,input_image?,remove_bg?,tile_x?,tile_y?,async_process?}`, ответ — массив base64 PNG (без `data:` префикса).
- **Рекомендация MVP:** Replicate + `rd-fast` (минимум кода). RD-direct — дешевле/предсказуемее (fixed-per-image), запасной вариант. → слой вызова делаем **провайдер-агностичным** (интерфейс `GenerationProvider`), чтобы переключаться без переписывания.
- ⚠️ RD **НЕ поддерживает** `negative_prompt` и `num_inference_steps` — стиль задаётся через `prompt_style` (enum). Не закладывать negative prompt в контракт.
- **Размеры:** rd_fast 64–384 (128/256 — ок); rd_plus — зависит от стиля (low-res 16–128).
- **Постобработка (Node, CPU-ok):** `sharp` — nearest downscale до сетки + `.png({palette:true, colours:N})` для палитры; опц. `rgbquant`. RD уже выдаёт grid-aligned, часто хватает только sharp.
- **Цены (ориентир/картинку):** RD-direct `rd_fast` ≈ $0.015 (256²), `rd_plus` ≈ $0.025; Replicate `rd-fast` ≈ $0.003–0.01 (секундный биллинг). Оба дёшевы.
- **Image input (будущее, не MVP):** RD нативный img2img (`input_image`+`strength`) + palette image — закроет визуальное кондиционирование позже.
- ⚠️ Точную JSON-схему параметров на Replicate research подтвердить не смог (JS-рендер страниц) — свериться в Playground/API-tab при кодинге.

## Architect diagram (v1)

### 1. Диаграмма условий и исключений

#### A. Жизненный цикл холста (загрузка / сохранение)
```
[Открытие страницы] → состояние холста есть на сервере?
  ├─ да → GET /api/canvas → JSON валиден?
  │        ├─ да → tldraw version совместима со snapshot?
  │        │        ├─ да → загрузить snapshot → рендер
  │        │        └─ нет → ⚠️ migrate (tldraw migrations) → ок? рендер / иначе пустой + бэкап старого
  │        └─ нет (corrupt) → лог + старт с пустого (старый файл не перезатирать вслепую)
  └─ нет (первый запуск) → пустой холст → первый автосейв создаёт файл

[Изменение холста] → debounce истёк?
  ├─ да → PUT /api/canvas → запись атомарна (tmp+rename)?
  │        ├─ да → 200
  │        └─ нет (ENOSPC/EACCES/IO) → ⚠️ 500 → тост, держать dirty-state, ретрай
  └─ нет → копить изменения в памяти
```

#### B. Действия над областью (custom shape «region»)
```
[Создать область] → region-shape с дефолтами (name="", resolution=256, status=idle) → автосейв
[Переименовать] → имя опционально; в промпт уходит только непустое
[Задать разрешение] → в диапазоне модели (rd-fast 64–384)?
  ├─ да → сохранить  └─ нет → ⚠️ clamp + подсказка
[Добавить картинку] → mime image/* и размер ≤ лимита?
  ├─ да → POST /api/upload → URL → image-shape привязан к region → автосейв
  └─ нет → ⚠️ отклонить + тост
[Подписать картинку] → caption в meta связанного image-shape (ярлык → в промпт текстом)
[Pan/Zoom] → обновить камеру (опц. персист отдельно)
```

#### C. Генерация — машина состояний области
```
Состояния: idle → generating → done | error  (повтор из error/done → generating)
[Старт] → выделена ровно одна область?
  ├─ нет → кнопка disabled
  └─ да → промпт непустой?
           ├─ нет → disabled + подсказка
           └─ да → область уже generating?
                    ├─ да → ⚠️ блок повторного старта (1 активная генерация на область)
                    └─ нет → payload {prompt + captions, width/height, prompt_style, seed?}
                             → status=generating, спиннер → POST /api/generate
```

#### D. Серверный /api/generate + Replicate
```
[POST /api/generate] → серверный ключ валиден?
  ├─ нет → 401/403
  └─ да → payload валиден (prompt, w/h ∈ диапазон, prompt_style ∈ enum)?
           ├─ нет → 400 → область error
           └─ да → REPLICATE_API_TOKEN в env?
                    ├─ нет → ⚠️ 500 config → error
                    └─ да → provider.generate() → replicate.run("retro-diffusion/rd-fast",{input}) (sync, секунды)
                            ├─ успех → ответ валиден (FileOutput/URL)?
                            │   ├─ да → скачать с CDN ок? → sharp postprocess ок? → сохранить ок?
                            │   │        каждый шаг: нет → ⚠️ 500 → область error
                            │   │        все да → 200 {imageUrl,w,h}
                            │   └─ нет → ⚠️ 500 «invalid response» → error
                            ├─ 4xx (невалидный input/токен) → проброс → error
                            ├─ 5xx/cold/429 → 502/503 → error + «повторить»
                            └─ HTTP timeout → 504 → error (см. проблему синхронного вызова)

[Ответ 200] → создать НОВУЮ область-результат рядом (свободное место? да→там / нет→фикс-смещение, overlap ок)
              → image-shape с результатом → исходную в idle → автосейв
[Ответ !=200] → область status=error + «Повторить»
[«Повторить» из error] → к шагу [Старт], переиспользуя payload
```

#### E. Race conditions
```
[Две генерации (разные области)] → ок, независимые FSM; ⚠️ sync-вызовы держат N соединений
[Повторный старт той же области] → блок на клиенте + idempotency-guard по regionId на сервере
[F5 во время generating] → статус в памяти клиента теряется → MVP: сбросить зависшие в idle/error;
                            ⚠️ результат после закрытия вкладки теряется (нет очереди/вебхука)
[Две вкладки] → PUT last-write-wins → ⚠️ потеря изменений (нет CRDT в MVP); опц. версия-токен → 409
[Удаление области во время генерации] → результат для несуществующего regionId → дропнуть + лог
```

### 2. Затрагиваемые места
**Фронт (Next.js + tldraw):** страница холста; `RegionShapeUtil` (props name/resolution/prompt/status/errorMessage); подписанная картинка (image-shape + meta.caption); панель выделенной области; автосейв (debounce) + загрузка; API-клиент (canvas/upload/generate); модуль UI-строк.
**Бэк (Fastify Node 22):** `GET/PUT /api/canvas`, `POST /api/upload`, `POST /api/generate`; раздача файлов; `GenerationProvider` интерфейс + `ReplicateProvider` (+ место под RD-direct/ComfyUI); postprocess (sharp); idempotency-guard.
**Хранение:** `DATA_DIR/canvas.json` (snapshot), `DATA_DIR/uploads/`, `DATA_DIR/generated/` на persistent volume; атомарная запись.
**Env:** `REPLICATE_API_TOKEN` (только бэк), `GENERATE_API_KEY`, `DATA_DIR`, `PORT`, `MAX_UPLOAD_BYTES`, `GENERATE_TIMEOUT_MS`, API base URL/CORS origin.
**Coolify (CX33):** сервис web (Next) + сервис api (Fastify); persistent volume под DATA_DIR; Traefik — таймаут запроса под sync-генерацию + client_max_body_size; git push → деплой.

### 3. Возможные проблемы (⚠️)
- Утечка `REPLICATE_API_TOKEN` на фронт → ключ только на бэке, генерация через `/api/generate`, не класть в `NEXT_PUBLIC_*`.
- Синхронный Replicate + HTTP-таймауты (Traefik/Fastify/fetch) рассогласованы → ложный 504 при живой генерации (за неё уже заплачено).
- tldraw persistence привязан к версии схемы → апгрейд требует миграции; хранить версию, бэкап перед миграцией, не перезатирать при parse error.
- Last-write-wins между вкладками → потеря изменений (MVP допустимо).
- Статус generating в памяти теряется при F5; результат после закрытия вкладки теряется (нет очереди).
- Рост диска (аплоады+результаты) на CX33 → лимит размера/числа; ENOSPC ломает сохранение snapshot и результата — обрабатывать.
- RD не поддерживает negative_prompt/steps; prompt_style — строгий enum; размер вне 64–384 → 4xx. Валидировать/клампить до вызова.
- Битый ответ провайдера / битый PNG → защита от пустого shape + try/catch вокруг sharp.
- «Поиск свободного места» на бесконечном холсте нетривиален → MVP фикс-смещение/у курсора, overlap ок.
- Anti-abuse без логина: `/api/generate` стоит денег → серверный ключ + не публиковать URL.
- Атомарность автосейва (tmp+rename), иначе полузаписанный JSON.
- CORS/базовый URL API через env при раздельных origin.

## Plan v1

### 1. Стек и архитектура
- **Фронт:** Next.js (App Router) + React + `tldraw` SDK. Один экран с холстом.
- **Бэк:** Fastify (Node 22, TypeScript). REST API + раздача статики картинок.
- **Генерация:** Replicate SDK, модель `retro-diffusion/rd-fast`. Слой `GenerationProvider` (интерфейс) + `ReplicateProvider`.
- **Постобработка:** `sharp` (nearest downscale + palette PNG).
- **Хранение:** JSON-файл (tldraw snapshot) + папки картинок на persistent volume. БД нет.
- **Деплой:** Coolify на Hetzner CX33, сервисы `canvas-web` + `canvas-api` + общий volume под `DATA_DIR`. `git push` → деплой.

### 2. Структура репозитория (pnpm monorepo)
```
infinity-canvas/
  apps/web/    # Next.js + tldraw
  apps/api/    # Fastify
  packages/shared/   # общие типы (RegionProps, контракты API) — при необходимости
  Dockerfile (на каждый app), README.md
```

### 3. Модель данных / хранение
- `DATA_DIR/canvas.json` — tldraw store snapshot (`getSnapshot`/`loadSnapshot`); версия схемы внутри snapshot.
- `DATA_DIR/uploads/<id>.<ext>` — загруженные юзером картинки.
- `DATA_DIR/generated/<id>.png` — результаты генерации.
- Запись snapshot атомарна: write tmp → rename.
- **Region** (custom tldraw shape) props: `{ name: string; resolution: number /*64..384*/; prompt: string; status: 'idle'|'generating'|'done'|'error'; errorMessage?: string }`.
- Картинки внутри области — нативные tldraw image-shapes; подпись в `shape.meta.caption`; принадлежность к области — по parentId/геометрии.

### 4. API (Fastify)
- `GET /api/canvas` → `{ snapshot }` | 204 если пусто.
- `PUT /api/canvas` body `{ snapshot }` → атомарная запись → 200.
- `POST /api/upload` (multipart) → валидация mime `image/*` + размер ≤ `MAX_UPLOAD_BYTES` → сохранить → `{ url, width, height }`.
- `POST /api/generate` header `X-Api-Key`, body `{ regionId, prompt, captions: string[], width, height, promptStyle?, seed? }`:
  1. guard ключа → иначе 401.
  2. валидация: prompt непустой, w/h ∈ [64,384], promptStyle ∈ enum.
  3. финальный prompt = `[prompt, ...captions].join(', ')`.
  4. `provider.generate(...)` → URL.
  5. download → sharp postprocess → save `generated/<id>.png`.
  6. → `{ url, width, height }`. Ошибки → 4xx/5xx + message.
- Статика: `@fastify/static` отдаёт `/files/*`. CORS: origin фронта из env.

### 5. Frontend
- `<Tldraw>` + кастомный `RegionShapeUtil` (рамка + заголовок-имя + бейдж статуса).
- Тулбар: инструмент «область», select/hand.
- Drag-n-drop/paste картинки → upload → image-shape; поле подписи (caption в meta).
- Панель выделенной области (ровно одна region): имя, селектор разрешения, textarea промпта, «Старт» (disabled при пустом промпте/generating), спиннер, блок ошибки + «Повторить».
- На «Старт»: собрать captions картинок внутри области → POST /api/generate → создать область-результат рядом (фикс-смещение справа) + image-shape результата; исходную → idle; на ошибке → error.
- Автосейв: подписка на store → debounce ~700мс → PUT /api/canvas. Загрузка snapshot при mount.
- При mount: «зависшие» generating → сбросить в idle.
- UI-строки в одном модуле `strings.ts` (без i18n-рантайма).

### 6. Generation layer
```ts
interface GenerationProvider {
  generate(input: { prompt: string; width: number; height: number; promptStyle?: string; seed?: number }): Promise<{ imageUrl: string }>
}
class ReplicateProvider implements GenerationProvider {} // replicate.run("retro-diffusion/rd-fast", { input })
```
- `REPLICATE_API_TOKEN` только на api-сервисе. Таймаут вызова `GENERATE_TIMEOUT_MS` (~120с).
- `postprocessPixelArt(buffer, { width, height, colours? })` — sharp, kernel nearest, опц. palette.

### 7. Обработка edge cases (из диаграммы)
- Пустой промпт / не одна область → «Старт» disabled.
- Повторный старт во время generating → блок на клиенте + in-memory guard по regionId.
- Replicate 4xx/5xx/timeout/битый ответ → область error + «Повторить».
- ENOSPC при сохранении → 500 + тост, dirty-state не теряем.
- Удаление области во время генерации → результат для несуществующего regionId → дропнуть + лог.
- Размер вне диапазона → clamp + подсказка. Аплоад не-картинки/большой → отклонить.
- Несколько вкладок → last-write-wins (README-предупреждение).
- tldraw snapshot parse error → не перезатирать, старт с пустого + бэкап.

### 8. Деплой (Coolify, CX33)
- Сервисы: `canvas-web` (Next, 3000), `canvas-api` (Fastify, 8080). Persistent volume → `DATA_DIR=/data` на api.
- Env: REPLICATE_API_TOKEN, GENERATE_API_KEY, DATA_DIR, MAX_UPLOAD_BYTES, GENERATE_TIMEOUT_MS, NEXT API base URL, CORS origin.
- Traefik: увеличить request timeout под sync-генерацию + client max body под аплоады.
- Домен напр. `canvas.spriteengine.net`; git push → webhook → деплой.

### 9. Порядок реализации (MVP)
1. Скелет monorepo: Fastify `/health` + Next пустой холст tldraw, локальный запуск.
2. Автосейв/загрузка snapshot (GET/PUT /api/canvas, файл на диске).
3. `RegionShapeUtil` + тулбар + панель (имя, разрешение, промпт).
4. Аплоад картинок + подпись (caption).
5. `/api/generate` со **заглушкой** (dummy PNG) → весь поток end-to-end.
6. `ReplicateProvider` (rd-fast) + sharp postprocess → реальная генерация.
7. Edge cases: ошибки, guard, clamp, сброс зависших.
8. Dockerfile'ы, Coolify, volume, env, прокси-таймауты → деплой.

### 10. Безопасность / прочее
- API-ключи только на бэке; `/api/generate` за `X-Api-Key`.
- Лимит размера аплоада и разрешения.
- (Опц.) basic-guard на весь сайт — он публичный и платит за генерацию.

## Agent feedback log

### v1 → v2 (Logic Flow Agent, 2026-06-22)
- ❌ Состояние `generating` без гарантированного выхода без F5 (зависший запрос в открытой вкладке) → **Исправлено:** клиентский `AbortController`-таймаут (`GENERATE_TIMEOUT_MS` + запас) → область в `error` + «Повторить» (Plan v2 §5, §7).
- ❌ Нет ветки сбоя клиентского `fetch` (сеть/CORS/разрыв прокси) → **Исправлено:** `POST /api/generate` в try/catch, любой reject → `error` + «Повторить» (§5).
- ❌ Нет сценария отмены генерации → **Исправлено:** кнопка «Отменить» — `abort()` клиентского запроса, область → `idle` локально; подсказка честно сообщает, что генерация на Replicate уже оплачена и не прерывается (§5).
- ❌ Клиент при удалении области во время `generating` не обработан → **Исправлено:** перед применением 200-ответа проверять, есть ли `regionId` в store; нет → отбросить результат (как серверный drop) (§7).
- ❌ Состояние `done` недостижимо (рассинхрон с потоком) → **Исправлено:** убрано из enum. `Region.status = 'idle'|'generating'|'error'`; исходная всегда → `idle`; результат — обычный image-shape без статуса (§3).
- ⚠️ Взаимодействие `generating` × LWW между вкладками → **Исправлено:** `status` — ephemeral клиентское состояние, НЕ персистится в `canvas.json`; автосейв сериализует только контент холста (§3, §5).
- ⚠️ Автосейв после успешной генерации может упасть (ENOSPC), результат потеряется → **Исправлено:** результат уже на диске (`generated/<id>.png`); единая retry-политика PUT покрывает и этот сейв (§7).
- ⚠️ `/api/upload` и `PUT /api/canvas` без ключа (вектор заполнения диска/перезатирания) → **Исправлено:** `X-Api-Key` на ВСЕ мутирующие эндпоинты; + т.к. домен публичный и платный, basic-auth на весь сайт делаем обязательным, не опцией (§4, §10).
- ⚠️ Нет rate-limit/cooldown на `/api/generate` (цикл «Повторить» = деньги) → **Исправлено:** in-memory cooldown/счётчик в минуту + дебаунс кнопок «Старт»/«Повторить» (§4, §7).
- ⚠️ Политика ретрая автосейва не специфицирована → **Исправлено:** 3 попытки с backoff, при исчерпании — стойкий тост «не сохранено» + держать dirty-state до следующего изменения (§5, §7).
- ⚠️ In-memory guard не общий между процессами → **Исправлено:** зафиксировано — один процесс `api` на CX33 (без горизонтального масштабирования в MVP) (§8).

## Architect diagram (v2)

**Изменённая FSM области (`done` удалён):**
```
Region.status: idle → generating → error
[Старт] idle → generating(ephemeral, НЕ в snapshot)
ВСЕ выходы из generating закрыты:
  ├─ успех (200) → исходная idle (+ результат как обычный image-shape, без статуса)
  ├─ сервер !=200 / битый ответ → error + «Повторить»
  ├─ клиентский fetch reject (сеть/CORS/разрыв) → error + «Повторить»
  ├─ клиентский таймаут (AbortController) → error + «Повторить»
  └─ юзер «Отменить» → idle (локально; Replicate уже оплачен, не прерывается)
F5/mount: статус не в snapshot → «зависших» generating не существует by design
```

**Изменённый поток генерации (клиентская сторона):**
```
[Старт] (дебаунс) → generating(ephemeral) → AbortController(timeout)
  → try { POST /api/generate (X-Api-Key) }
     catch (reject/abort/timeout) → область error + «Повторить»
     then 200 → regionId ещё в store?
        ├─ нет → отбросить результат (осиротел; по аналогии с серверным drop)
        └─ да → создать область-результат рядом + image-shape → исходная idle → автосейв(только контент)
  [«Отменить»] → abort() → idle
cooldown: серверный счётчик/мин + клиентский дебаунс «Старт»/«Повторить»
```

**Изменения безопасности:**
```
X-Api-Key обязателен: PUT /api/canvas, POST /api/upload, POST /api/generate
+ basic-auth на весь сайт (публичный домен + платная генерация) — ОБЯЗАТЕЛЬНО, не опция
```

## Plan v2
_(дельта от Plan v1 — меняются только перечисленные секции, остальное из v1 в силе)_

- **§3 Модель данных:** `Region.status: 'idle'|'generating'|'error'` (убран `'done'`). `status` и `errorMessage` — клиентское **ephemeral** состояние, в `canvas.json` НЕ сериализуются (автосейв пишет только контент холста: геометрию, картинки, имена, разрешения, промпты, подписи).
- **§4 API:** `X-Api-Key` требуется на `PUT /api/canvas`, `POST /api/upload`, `POST /api/generate`. На `/api/generate` — серверный cooldown (in-memory, N запросов/мин) до вызова провайдера.
- **§5 Frontend:** «Старт» оборачивает `fetch` в `AbortController` с таймаутом (`GENERATE_TIMEOUT_MS` + запас) и try/catch (любой reject → `error` + «Повторить»). Кнопка «Отменить» (abort → `idle`). Перед применением 200-ответа — проверка наличия `regionId` в store (нет → отбросить). Кнопки «Старт»/«Повторить» с дебаунсом. Автосейв сериализует контент без generating-статуса. Retry-политика автосейва: 3 попытки с backoff → при исчерпании стойкий тост + dirty-state до следующего изменения.
- **§7 Edge cases (добавлено):** клиентский таймаут генерации; сбой клиентского fetch; отмена пользователем; удаление области во время generating (клиентская проверка regionId); пост-генерационный автосейв покрыт общей retry-политикой.
- **§8 Деплой:** один процесс `api` на CX33 (без горизонтального масштабирования) — in-memory guard/cooldown консистентны.
- **§10 Безопасность:** basic-auth на весь сайт — **обязателен** (домен публичный, генерация платная), плюс `X-Api-Key` на мутирующих API.

### v2 → v3 (Integration Agent, 2026-06-22)
- 🔴 Утечка `X-Api-Key`: `/api/generate` из браузера → ключ виден всем → **Исправлено:** **BFF** — браузер ходит только на same-origin Next route handlers (`/api/generate`, `/api/canvas`, `/api/upload`); они на сервере добавляют `X-Api-Key` (НЕ `NEXT_PUBLIC_`) и проксируют на внутренний Fastify `http://api:8080`, который НЕ публикуется через Traefik. CORS убран, публичного api-домена нет (§1, §4, §5, §10).
- ❌ Контракт Replicate: поле называется `style` (не `prompt_style`), вывод — **массив** → **Исправлено:** `ReplicateProvider` мапит на input `{ prompt, style, width, height, num_images:1, seed? }` и читает `output[0]`; внешний контракт `/api/generate` оставляем `promptStyle`; финальный enum стилей/диапазоны размеров снять из Replicate model schema при кодинге, clamp 64–384 как MVP-дефолт (§6).
- 🔴 Traefik рвёт запрос на 60с (дефолт Coolify) → ложный 504 на холодном старте модели → **Исправлено:** поднять responding timeout до 180s (entrypoint-флаги Coolify); лесенка Traefik 180 ≥ браузер→Next 150 ≥ Fastify→Replicate `GENERATE_TIMEOUT_MS` 120. Прим.: `replicate.run` сам уходит в polling после 60с block — долгий канал именно браузер→Next, его и покрывает Traefik-таймаут (§8, диаграмма v3).
- ⚠️ Два «сервиса» в Coolify = один **Docker Compose** deployment (не два Application) → **Исправлено:** деплой как Docker Compose; `web` с Traefik-labels, `api` внутренний без labels, общая docker-сеть + общий named volume (§8).
- 🔴 Persistent volume должен пережить redeploy (иначе теряются `canvas.json` и картинки) → **Исправлено:** named volume `canvas-data:/data` + Coolify `is_directory: true`; tmp+rename в пределах `/data` (не `/tmp`, иначе cross-device rename) (§8).
- ⚠️ sharp на Alpine/musl флапает в проде → **Исправлено:** базовый образ `node:22-slim` (Debian/glibc), не alpine; multi-stage (§8).
- ⚠️ `client_max_body_size` — не Traefik-настройка → **Исправлено:** лимит аплоада через `@fastify/multipart` `limits.fileSize` (+ лимит в Next route); Traefik body не лимитирует (§4).
- ⚠️ Рассогласование имён: provider `{imageUrl}` vs `/api/generate` `{url,w,h}` vs Replicate массив → **Исправлено:** единый тип ответа в `packages/shared`; provider нормализует `output[0]` → `imageUrl`, route отдаёт `{ url, width, height }` (§6).
- 🔴 `status`/`errorMessage` в props `RegionShapeUtil` утекут в `canvas.json` (tldraw сериализует props) — противоречит ephemeral-решению v2 → **Исправлено:** persisted props области = `{ name, resolution, prompt }`; `status`/`errorMessage` держать в ОТДЕЛЬНОМ ephemeral-store (React state по `regionId`), не в shape props (§3).
- ✅ Память/CPU (8 ГБ / 2 vCPU) — два Node-сервиса + Coolify влезают; страховка на билд: `next output:'standalone'`, при OOM — swap + `NODE_OPTIONS=--max-old-space-size=2048` (§8).
- ✅ Домен/TLS (`canvas.spriteengine.net`), стек версий (Node22/Fastify5/Next/tldraw/sharp) — совместимо.

## Architect diagram (v3)

**Сетевая топология (BFF):**
```
Браузер ──(same-origin, basic-auth, без CORS)──► Next.js «web» (публичный, Traefik Host=canvas.spriteengine.net)
   Next route handler добавляет X-Api-Key (server env) ──(внутренняя docker-сеть, http://api:8080)──► Fastify «api» (НЕ публичный, без Traefik labels)
   Fastify ──(server-to-server, мимо Traefik)──► Replicate API → output[0]
Хранение: named volume canvas-data:/data на «api» (uploads/, generated/, canvas.json)
Таймауты: Traefik 180s ≥ Next→api fetch 150s ≥ api→Replicate 120s
Ключи: REPLICATE_API_TOKEN + X-Api-Key только на сервере; в браузер НЕ попадают
```

**Поток генерации (v3):**
```
[Старт] браузер → POST /api/generate (Next, БЕЗ ключа, basic-auth)
  → Next добавляет X-Api-Key → http://api:8080/api/generate
     → Fastify: guard ключа + cooldown + валидация (w/h clamp 64–384, style ∈ enum)
        → ReplicateProvider: replicate.run("retro-diffusion/rd-fast",{input:{prompt,style,width,height,num_images:1,seed?}}) → output[0]
           → download → sharp (nearest + palette) → save /data/generated/<id>.png
           → { url, width, height }
  → Next проксирует ответ браузеру
  → (клиентские ветки v2 в силе: AbortController-таймаут, try/catch, «Отменить», проверка regionId в store)
```

**Региональный shape:**
```
persisted props (в canvas.json): { name, resolution, prompt }
ephemeral (отдельный store, НЕ в snapshot): { status: idle|generating|error, errorMessage }
```

## Plan v3
_(дельта от v2 — меняются перечисленные секции; всё остальное из v1/v2 в силе)_

- **§1 Архитектура:** Next.js «web» — публичный BFF (basic-auth, Traefik). Fastify «api» — внутренний сервис (без Traefik labels, без публичного домена). Браузер общается только с Next same-origin. Деплой — единый Docker Compose в Coolify.
- **§3 Модель данных:** persisted props `RegionShapeUtil` = `{ name, resolution, prompt }`. `status`/`errorMessage` — в отдельном ephemeral-store по `regionId` (React state), НЕ в shape props и НЕ в `canvas.json`.
- **§4 API:** браузер → Next route handlers (`/api/generate`, `/api/canvas`, `/api/upload`) same-origin, без CORS. Next handlers добавляют `X-Api-Key` из server-env и проксируют на `http://api:8080`. Fastify-эндпоинты те же, но внутренние, проверяют `X-Api-Key`; `/api/generate` — cooldown. Лимит аплоада — `@fastify/multipart` `limits.fileSize` (+ Next route).
- **§6 Generation layer:** `ReplicateProvider` input `{ prompt, style, width, height, num_images:1, seed? }`, читает `output[0]` → нормализует в `{ imageUrl }`. Внешний контракт `/api/generate` отдаёт `{ url, width, height }` (тип в `packages/shared`). Enum стилей и диапазоны размеров финально снять из Replicate model schema при кодинге.
- **§8 Деплой:** Docker Compose в Coolify: сервис `web` (Next standalone, 3000, Traefik `Host(canvas.spriteengine.net)`), сервис `api` (Fastify, expose 8080, внутренний). Named volume `canvas-data:/data` + `is_directory: true`; `DATA_DIR=/data` (uploads/, generated/, canvas.json); tmp+rename внутри `/data`. Базовый образ `node:22-slim` (не alpine), multi-stage. `next output:'standalone'`. Traefik responding timeout → 180s (entrypoint-флаги). Лесенка таймаутов. На случай OOM при билде — swap + `--max-old-space-size`.
- **§10 Безопасность:** basic-auth на публичном Next (обязательно). `X-Api-Key` — только канал Next-server↔Fastify (внутренний). `REPLICATE_API_TOKEN` — только в env сервиса `api`. Ключи в браузер не попадают by design.

> ⚠️ Открытый вопрос для Simplifier: при схеме BFF Fastify становится внутренним сервисом, к которому Next и так проксирует. Стоит ли вообще держать отдельный Fastify, или свернуть всё в Next route handlers (один контейнер, меньше ops)? Пользователь ранее предпочёл Fastify-стек — оценить trade-off.

### v3 → Done (Simplifier Agent, 2026-06-22)
**Приняты сразу (не зависят от развилки):**
- ✅ `GenerationProvider` interface + класс → одна async-функция `generateImage(input): Promise<{imageUrl}>` (единая точка свопа на RD-direct/ComfyUI без OOP-церемонии; извлечь interface при реальной нужде во 2-м провайдере).
- ✅ Убрать серверный cooldown / rate-limiter / idempotency-guard по `regionId` → оставить только клиентский дебаунс «Старт»/«Повторить» + disabled во время generating. Для одного доверенного юзера за basic-auth серверный счётчик защищает от конкуренции, которую человек создать не может.
- ✅ `MAX_UPLOAD_BYTES` / `GENERATE_TIMEOUT_MS` → константы в коде, не env (redeploy ради тюнинга для личного инструмента приемлем).
- ✅ Раздача картинок — через статику (`public/generated/` или один статик-роут) вместо `@fastify/static`/стрим-слоя.

**Оставлено как есть (load-bearing, НЕ упрощать):** atomic tmp+rename (единственная копия данных), snapshot migration/parse-error backup, ephemeral status-store (v3), timeout-лесенка, named volume, `node:22-slim`.

**⏳ Развилка для пользователя (архитектурная):** свернуть Fastify в Next route handlers (1 контейнер) ИЛИ оставить Fastify внутренним сервисом (2 контейнера, как в Plan v3). От ответа зависят: `packages/shared`, pnpm-monorepo, внутренний `X-Api-Key`, набор env. Финализация PLAN Done — после ответа.

### Развилка решена (2026-06-22)
Пользователь делегировал выбор. Решение: **один контейнер на Next.js** (route handlers как бэк). Обоснование: при BFF отдельный Fastify — прокси-без-трансформации; `replicate`/`sharp`/fs работают в Node-route-handlers нативно; убирает целый сервис, внутренний `X-Api-Key`, CORS, monorepo, `packages/shared`, ступень таймаутов. Путь к будущему агенту-сборщику/чату не закрыт (тоже server-side). → принимаются ВСЕ упрощения Simplifier.

**Разрешён конфликт между агентами:** Simplifier предлагал писать картинки в `public/generated/`, но `public/` баком в образ → не переживёт redeploy и не на volume (Integration #5 load-bearing). **Итог:** картинки на named volume `/data`, раздаются маленьким route-handler `/files/[...path]` (за basic-auth). `public/` для runtime-файлов НЕ используем.

## Plan Done (финал — один контейнер Next.js)
_Канонический спек для реализации. Заменяет v1–v3 как руководство; load-bearing фиксы из feedback log сохранены явно._

### 1. Стек и деплой
- **Одно приложение:** Next.js (App Router, `output:'standalone'`), TypeScript, React, `tldraw`. UI + серверный API (route handlers) в одном процессе.
- **Генерация:** `replicate` SDK, модель `retro-diffusion/rd-fast`, server-side.
- **Постобработка:** `sharp` (nearest downscale + palette PNG).
- **Хранение:** файлы на named volume `/data`. БД нет.
- **Деплой:** одно приложение в Coolify (Docker Compose, один сервис `web`), `node:22-slim` multi-stage, Traefik `Host(canvas.spriteengine.net)` порт 3000, named volume `canvas-data:/data` (`is_directory:true`), Traefik responding timeout 180s. `git push` → webhook → деплой.

### 2. Структура репозитория (single app, без monorepo)
```
infinity-canvas/
  app/
    page.tsx                 # холст (tldraw)
    api/canvas/route.ts      # GET/PUT snapshot
    api/upload/route.ts      # POST загрузка картинок
    api/generate/route.ts    # POST генерация (Replicate + sharp)
    files/[...path]/route.ts # раздача /data/* (за basic-auth)
  middleware.ts              # basic-auth на весь сайт
  lib/replicate.ts           # generateImage(input): Promise<{imageUrl}>
  lib/storage.ts             # atomic read/write /data, пути uploads/generated/canvas.json
  lib/pixelart.ts            # sharp postprocess
  lib/types.ts               # RegionProps, GenerateResponse, allowed styles/sizes
  components/                # RegionShapeUtil, панель области, ephemeral status store
  Dockerfile, next.config.js, README.md
```

### 3. Модель данных / хранение
- `/data/canvas.json` — tldraw snapshot (`getSnapshot`/`loadSnapshot`); атомарно tmp→rename **в пределах `/data`**.
- `/data/uploads/<id>.<ext>`, `/data/generated/<id>.png`. Раздача — `/files/[...path]`.
- **Region** (custom shape) persisted props: `{ name: string; resolution: number /*64..384*/; prompt: string }`.
- `status: 'idle'|'generating'|'error'` + `errorMessage` — **ephemeral** store по `regionId` (React state/zustand), НЕ в shape props и НЕ в snapshot.
- Картинки — нативные image-shapes; подпись в `shape.meta.caption`; `captions` собираются из картинок внутри области в момент «Старт».

### 4. API (Next route handlers, same-origin)
- `GET /api/canvas` → `{ snapshot }` | 204.
- `PUT /api/canvas` `{ snapshot }` → атомарная запись (только контент, без ephemeral-статуса) → 200; retry-политика на клиенте.
- `POST /api/upload` (multipart) → mime `image/*` + размер ≤ `MAX_UPLOAD_BYTES` (константа) → `/data/uploads` → `{ url:'/files/uploads/<id>', width, height }`.
- `POST /api/generate` `{ regionId, prompt, captions[], width, height, promptStyle?, seed? }`:
  1. валидация: prompt непустой; w/h clamp 64–384; promptStyle ∈ enum.
  2. finalPrompt = `[prompt, ...captions].join(', ')`.
  3. `generateImage({ prompt:finalPrompt, style:promptStyle, width, height, seed? })`.
  4. download → `sharp` postprocess → `/data/generated/<id>.png`.
  5. → `{ url:'/files/generated/<id>.png', width, height }`. Ошибки → 4xx/5xx + message.
- Ключей в API нет (нет внутренней границы). Защита — basic-auth middleware на всё.

### 5. Frontend
- `<Tldraw>` + `RegionShapeUtil` (рамка + имя + бейдж статуса из ephemeral-store).
- Тулбар: инструмент «область», select/hand. Drag/paste картинки → `/api/upload` → image-shape + поле подписи (meta.caption).
- Панель выделенной области (ровно одна region): имя, селектор разрешения, textarea промпта, «Старт» (disabled при пустом промпте/во время generating, дебаунс), спиннер, блок ошибки + «Повторить» (дебаунс), «Отменить».
- **«Старт»:** ephemeral status=generating → `AbortController`(timeout `GENERATE_TIMEOUT_MS`+запас) → try `fetch POST /api/generate` → catch(reject/abort/timeout) → status=error.
- **На 200:** `regionId` ещё в store? нет → отбросить результат; да → создать область-результат рядом (фикс-смещение) + image-shape из `url` → исходная → idle.
- **«Отменить»:** abort() → idle.
- **Автосейв:** подписка на контент store → debounce ~700мс → `PUT /api/canvas` (без ephemeral-статуса). Retry 3× backoff → стойкий тост, dirty-state до следующего изменения.
- **Mount:** загрузить snapshot; ephemeral-store пуст → «зависших» generating не бывает by design.
- UI-строки в одном `lib/strings.ts` (без i18n-рантайма).

### 6. Generation layer
```ts
// lib/replicate.ts — единственная точка свопа провайдера (без interface/класса)
export async function generateImage(input: {
  prompt: string; style?: string; width: number; height: number; seed?: number
}): Promise<{ imageUrl: string }> {
  // replicate.run("retro-diffusion/rd-fast",{ input:{ prompt, style, width, height, num_images:1, seed } }) → output[0]
}
```
- `REPLICATE_API_TOKEN` только в env сервера. Таймаут вызова `GENERATE_TIMEOUT_MS` (~120с, константа).
- ⚠️ Поле Replicate — `style` (не `prompt_style`); вывод — **массив**, брать `output[0]`. Финальный enum стилей и диапазоны размеров **снять из Replicate model schema** (`rd-fast`) при кодинге; clamp 64–384 как MVP-дефолт.
- `lib/pixelart.ts`: `sharp` kernel nearest + опц. `.png({palette:true, colours:N})`.

### 7. Edge cases (сводно)
Пустой промпт/не одна область → «Старт» disabled. Повтор во время generating → disabled (клиент). Replicate 4xx/5xx/timeout/битый ответ, клиентский fetch-fail, клиентский таймаут, отмена → корректные переходы (см. §5). Удаление области во время generating → проверка `regionId` перед применением 200. ENOSPC/parse-error snapshot → backup + не перезатирать; retry автосейва. Размер вне диапазона → clamp. Аплоад не-картинки/большой → отклонить. Несколько вкладок → last-write-wins (README-предупреждение); ephemeral-статус не теряется (он не в snapshot).

### 8. Безопасность
- `middleware.ts` — basic-auth (`BASIC_AUTH_USER`/`BASIC_AUTH_PASS`) на весь сайт, включая `/api/*` и `/files/*` (домен публичный, генерация платная).
- `REPLICATE_API_TOKEN` — только server-env, в браузер не попадает (нет публичного api, нет CORS).
- Лимит размера аплоада и разрешения. Серверный rate-limit НЕ нужен (один юзер за basic-auth + клиентский дебаунс).

### 9. Env (минимум)
`REPLICATE_API_TOKEN`, `DATA_DIR=/data`, `BASIC_AUTH_USER`, `BASIC_AUTH_PASS`. Остальное (`MAX_UPLOAD_BYTES`, `GENERATE_TIMEOUT_MS`, allowed sizes/styles) — константы в коде.

### 10. Порядок реализации (MVP)
1. Next-скелет + пустой холст tldraw + basic-auth middleware; локальный запуск.
2. `lib/storage.ts` (atomic /data) + `/api/canvas` GET/PUT + автосейв/загрузка.
3. `RegionShapeUtil` + тулбар + панель (имя/разрешение/промпт) + ephemeral status-store.
4. `/api/upload` (+ `/files`) + подпись картинок (caption).
5. `/api/generate` со **заглушкой** (dummy PNG) → весь поток end-to-end + клиентские состояния (abort/timeout/cancel/error/размещение результата).
6. `lib/replicate.ts` (rd-fast) + `lib/pixelart.ts` (sharp) → реальная генерация; сверить enum стилей/размеры из model schema.
7. Полировка edge cases.
8. Dockerfile (`node:22-slim`, standalone) + Coolify compose + named volume + Traefik 180s → деплой на `canvas.spriteengine.net`.

### Load-bearing (явно сохранено из feedback log — НЕ упрощать)
atomic tmp+rename в `/data` · snapshot parse-error backup · ephemeral status не в snapshot · `node:22-slim` (не alpine) · named volume `is_directory:true` переживает redeploy · Traefik responding timeout 180s + лесенка (Traefik 180 ≥ браузер→Next 150 ≥ Next→Replicate 120) · Replicate `style`+`output[0]` · sharp nearest+palette.

## Implementation notes

### Реализовано (2026-06-22)
- Стек по факту: Next.js 14.2.35, React 18.3.1, tldraw 3.15.6, replicate 1.4.0, sharp 0.33.5. Один контейнер, без отдельного Fastify (как решено).
- Файлы: `app/` (page + route handlers canvas/canvas/backup/upload/generate/files), `middleware.ts` (basic-auth), `components/` (CanvasApp, RegionShape, RegionPanel, persistence, statusStore, toast), `lib/` (replicate, pixelart, storage, types, constants, strings, api).
- Кастомный `RegionShapeUtil` (BaseBoxShapeUtil) + `RegionTool`; ephemeral статус в `statusStore` (не в snapshot); автосейв через `store.listen` (debounce 700мс, 3× retry); upload через `registerExternalAssetHandler` (картинки на /data, в snapshot только URL).
- Генерация: `lib/replicate.ts` `generateImage()` (rd-fast, `style`, `output[0]`); без `REPLICATE_API_TOKEN` — детерминированная заглушка `makeDummyPng`. Постобработка `sharp` nearest + palette.

### Проверено
- `next build` — типы/сборка зелёные. API end-to-end (curl): canvas GET/PUT, generate-заглушка → валидный 128² PNG, upload, раздача /files, валидация (400), path-traversal (404).
- UI (preview + скриншоты): холст рендерится, инструмент «Область» в тулбаре, панель (имя/разрешение/промпт), «Старт» → область-результат с картинкой появляется рядом. Полный поток работает на заглушке.

### Code review
Критичных багов нет. Одна правка: при невозможности загрузить snapshot в tldraw (валидный JSON, несовместимая схема) — бэкап `canvas.json.bad-*` на сервере + тост, чтобы автосейв не перезатёр данные. → `app/api/canvas/backup`, `lib/storage.ts:backupCanvas`, `persistence.ts`.

### Деплой — ВЫПОЛНЕН (2026-06-22)
- GitHub (public): `ifkeyframe/infinity-canvas`, ветка `master`.
- Coolify app uuid `js8h9lc22oul3fgptkka5ftt` (проект «My first project»), Docker Compose, named volume `canvas-data:/data`.
- Живой URL: **http://js8h9lc22oul3fgptkka5ftt.178.104.251.137.sslip.io** (basic-auth `admin` / пароль в Coolify env `BASIC_AUTH_PASS`).
- Проверено: 401 без auth, 200 с auth, `/api/canvas` 204, генерация-заглушка → валидный 128² PNG.
- Грабли (исправлены коммитами): нет `public/` → Dockerfile COPY падает; Traefik для compose не навешивался Coolify'ем → прописал labels + сеть `coolify` явно; Next standalone биндился не на все интерфейсы → `HOSTNAME=0.0.0.0`.
- Осталось (follow-up, нужен пользователь): вписать `REPLICATE_API_TOKEN` в env Coolify + redeploy (тогда реальная генерация вместо заглушки); опц. домен `canvas.spriteengine.net` (A-запись + host в Traefik-label); опц. Traefik responding timeout 180s; авто-деплой по git push (Coolify не публичен — redeploy через API/UI).
