# Infinity Canvas — генератор пиксель-арта

Бесконечный холст ([tldraw](https://tldraw.dev)), где можно создавать **области**, давать им имя/разрешение, класть внутрь картинки с подписями, и по кнопке **Старт** генерировать пиксель-арт — результат появляется в новой области рядом. Генерация — через [Replicate](https://replicate.com) (модель Retro Diffusion `rd-fast`), пост-обработка `sharp`. Всё в одном Next.js-приложении.

Полный план и история ревью — в [PLAN.md](./PLAN.md).

## Стек
- Next.js 14 (App Router) + React 18 + TypeScript
- tldraw 3 (холст, кастомный shape «область»)
- Route handlers как бэк (генерация, загрузка, хранение) — без отдельного сервера
- Replicate `retro-diffusion/rd-fast` + `sharp` (nearest downscale + palette)
- Хранение на диске (`DATA_DIR`): `canvas.json`, `uploads/`, `generated/`

## Локальный запуск
```bash
npm install
npm run dev          # http://localhost:3000
```
Без `REPLICATE_API_TOKEN` генерация отдаёт детерминированную картинку-заглушку — весь поток работает без оплаты.

### Env (`.env.local`, см. `.env.example`)
| Переменная | Назначение |
|---|---|
| `REPLICATE_API_TOKEN` | токен Replicate (нужен для реальной генерации; иначе заглушка) |
| `DATA_DIR` | где хранить данные (по умолчанию `./data`) |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` | basic-auth на весь сайт |
| `BASIC_AUTH_ENABLED=false` | отключить auth локально |

Если `BASIC_AUTH_USER`/`PASS` не заданы — auth выключен (удобно локально).

## Как пользоваться
1. Инструмент **«Область»** (первый в тулбаре, клавиша `R`) — нарисуй прямоугольник.
2. Выдели область → справа панель: имя, разрешение, промпт.
3. Перетащи картинки в область, подпиши каждую (подпись уходит в промпт как текст).
4. **Старт** → результат появится в новой области справа. Кнопки **Отменить** / **Повторить** — по ситуации.

## Деплой (Coolify на Hetzner)
1. Подключи репозиторий в Coolify как **Docker Compose** (файл `docker-compose.yml`).
2. Задай домен сервису `web` (напр. `canvas.spriteengine.net`) — Coolify сам поднимет Traefik-роут и TLS.
3. Секреты-env: `REPLICATE_API_TOKEN`, `BASIC_AUTH_USER`, `BASIC_AUTH_PASS`.
4. Named volume `canvas-data` создаётся автоматически и **переживает redeploy**.
5. ⚠️ **Таймаут прокси.** Синхронная генерация может длиться дольше дефолтных 60с Traefik. В Coolify → сервер → Proxy добавь флаги entrypoint:
   ```
   --entrypoints.https.transport.respondingTimeouts.readTimeout=180s
   --entrypoints.https.transport.respondingTimeouts.writeTimeout=180s
   --entrypoints.https.transport.respondingTimeouts.idleTimeout=180s
   ```
6. `git push` → webhook → деплой.

## Известные ограничения (MVP)
- Один общий холст, без аккаунтов (защита — basic-auth).
- Несколько вкладок одновременно: последняя запись побеждает (last-write-wins).
- Картинки в области пока **не** влияют на генерацию пикселями — только подписи как текст (визуальное кондиционирование запланировано позже).
- Нет автоудаления старых картинок с диска.

## Структура
```
app/            страница холста + route handlers (canvas/upload/generate/files)
components/     CanvasApp, RegionShape, RegionPanel, persistence, statusStore, toast
lib/            replicate, pixelart (sharp), storage, types, constants, strings
middleware.ts   basic-auth
```
