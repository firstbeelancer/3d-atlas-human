# 3D-атлас: фундамент + эталонный раздел «Сердце» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Рабочий сайт с дизайн-системой, главной (3D-фигура + разделы + поиск), переключателем 18+, аннотацией в подвале и одним полностью готовым разделом «Сердце», который задаёт планку для остальных 22.

**Architecture:** SPA на React + React Router; контент — типизированные TS-файлы по разделу; 3D — процедурные модели на @react-three/fiber, каждая в своём лениво загружаемом модуле; общая сцена `Stage` и общее хранилище выделения связывают модель и список частей. Сборка — статика + HTML на каждый маршрут со своими мета-тегами; раздача — nginx в Docker.

**Tech Stack:** Vite 7, React 19, TypeScript 5.9, three 0.187, @react-three/fiber 9, @react-three/drei 10, Tailwind CSS 4 (@tailwindcss/vite), react-router 7, lucide-react, @fontsource (Literata, Golos Text, JetBrains Mono), Vitest + @testing-library/react + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-06-3d-atlas-design.md`

## Global Constraints

- Ни одного эмодзи в `src/`, `index.html`, `scripts/` — проверка `npm run check:emoji` входит в `npm run build` и в `npm test`.
- Текст подвала дословно: `Сайт носит информационный характер. Заметили ошибку? Напишите нам` («Напишите нам» — ссылка на `/o-proekte#svyaz`).
- 18+ по умолчанию выключен; при выключенном 18+ откровенный материал не загружается (отдельный динамический импорт).
- Шрифты и все ресурсы — свои, из `node_modules`/`public`, без Google Fonts и внешних CDN.
- Модели — только процедурные, без внешних файлов моделей и HDR; код моделей из референсов не используется.
- Стиль «Музей науки» (вариант 1 из `docs/mockups/preview-v1.html`), без винтажа и без шаблонного «нейрослопа» — см. §6.1 спеки.
- Цвета (светлая): фон `#F7F7F4`, карточки `#FFFFFF`, текст `#121212`, вторичный `#5F6166`, линии `#E1E1DC`; (тёмная): `#101114`, `#17191E`, `#F0EEE9`, `#A3A6AD`, `#2A2D33`; цвета систем — токены в `src/styles/index.css`; контраст текста WCAG AA.
- Шрифты: заголовки Onest, текст Golos Text, цифры/латынь JetBrains Mono (через @fontsource, свои файлы).
- Все строки интерфейса — в `src/i18n/ru.ts` (функция `t(key)`), тексты разделов (название, латынь, подзаголовок, контент) — в `src/content/ru/`; реестр `src/content/sections/index.ts` хранит только неязыковые поля (slug, system, icon, ready, adultParts) и подтягивает русские тексты; язык по умолчанию `ru`. Компоненты не содержат русских строк напрямую — это готовит переводы (en, zh, uz, kk, hi, de).
- Иконки интерфейса — lucide-react; иконки органов — собственный SVG-набор.
- Язык интерфейса и контента — русский; slug-и латиницей.
- Папка `референсы разные/` не попадает в git.

## Review Focus

1. `localStorage` недоступен (приватный режим) → переключатель 18+ и тема работают в пределах сессии, без падения. Тест в Task 4.
2. Нет WebGL или потерян контекст → вместо сцены заглушка, весь текст раздела виден. Тест в Task 6.
3. Перезагрузка по прямой ссылке `/razdel/serdce` и неизвестный `/razdel/xxx` → 200 с нужной страницей и 404-страница соответственно. Тесты в Task 3 (роутинг) и Task 9 (nginx-конфиг, сборка).
4. `prefers-reduced-motion: reduce` → анимации моделей стоят на паузе по умолчанию. Тест в Task 6.
5. 18+ строки не попадают в основной бандл. Тест в Task 9 (поиск маркера `ADULT_CONTENT_MARKER` в `dist/assets/index-*.js` должен дать 0 совпадений).

---

## Файловая структура

```
index.html
package.json · vite.config.ts · tsconfig.json · vitest.setup.ts
.gitignore · LICENSE (MIT) · README.md · Dockerfile · nginx.conf · .dockerignore
scripts/check-no-emoji.mjs          — падает при эмодзи
scripts/prerender-meta.mjs          — dist/<route>/index.html с title/description/og
src/main.tsx · src/App.tsx          — роутер
src/styles/index.css                — Tailwind + токены (@theme) + темы
src/content/types.ts                — типы контента
src/content/systems.ts              — 11 систем организма
src/content/sections/index.ts       — реестр 23 разделов (мета)
src/content/sections/serdce.ts      — полный контент «Сердце»
src/content/loadSection.ts          — slug → lazy import контента
src/lib/adult.tsx                   — AdultProvider, useAdult
src/lib/theme.tsx                   — ThemeProvider, useTheme
src/lib/storage.ts                  — safeGet/safeSet (try/catch)
src/lib/search.ts                   — поиск по разделам и частям
src/components/layout/{Header,Footer,AdultToggle,AdultConfirmDialog,ThemeToggle,Layout}.tsx
src/components/icons/organs.tsx     — SVG-иконки органов
src/components/section/{SectionHero,StatCards,PartsList,KidSay,FactCards,CareList,RelatedSections,ComingSoon}.tsx
src/three/Stage.tsx                 — Canvas, свет, тени, контролы, пауза вне экрана
src/three/StageToolbar.tsx          — пауза, разрез, подписи, сброс, «Показ»
src/three/Label.tsx                 — подпись с выноской
src/three/materials.ts              — анатомические материалы
src/three/selection.tsx             — SelectionProvider, useSelection
src/three/webgl.ts                  — hasWebGL()
src/models/registry.ts              — slug → lazy(() => import(model))
src/models/heart/HeartModel.tsx
src/models/body/BodyFigure.tsx
src/pages/{HomePage,SectionPage,AboutPage,NotFoundPage}.tsx
tests/*.test.ts(x)
```

---

### Task 1: Каркас проекта, git, защита от эмодзи

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `vitest.setup.ts`, `index.html`, `.gitignore`, `LICENSE`, `README.md`, `scripts/check-no-emoji.mjs`, `src/main.tsx`, `src/App.tsx`, `tests/no-emoji.test.ts`

**Interfaces:**
- Produces: скрипты `npm run dev | build | test | typecheck | check:emoji`; `build` = `check:emoji && tsc -b && vite build && node scripts/prerender-meta.mjs` (последний шаг добавляется в Task 9).
- Produces: `scripts/check-no-emoji.mjs` экспортирует `findEmoji(text: string): string[]` и при запуске как CLI сканирует `src/ index.html scripts/`, выход 1 при находке с выводом `файл:строка`.

- [ ] **Step 1:** `git init -b main`, `git remote add origin https://github.com/firstbeelancer/3d-atlas-human.git`, `.gitignore` с `node_modules dist референсы\ разные/ .env*`.
- [ ] **Step 2: Failing test** `tests/no-emoji.test.ts`:
  - `findEmoji('Сердце бьётся')` → `[]`
  - `findEmoji('Сердце ❤️')` → длина 1
  - `findEmoji('\u{1F9E0} мозг')` → длина 1
  - `findEmoji('18+ · © — №')` → `[]` (типографика не эмодзи)
- [ ] **Step 3:** Run `npx vitest run tests/no-emoji.test.ts` → FAIL.
- [ ] **Step 4:** Реализовать `findEmoji` через `/\p{Extended_Pictographic}/gu` минус разрешённые `©®™` ; CLI-обход файлов.
- [ ] **Step 5:** Run тест → PASS; `npm run check:emoji` → exit 0.
- [ ] **Step 6:** Минимальный `App` рендерит «3D-атлас человека»; `npm run build` → успех.
- [ ] **Step 7:** Commit `chore: scaffold vite react ts project with emoji guard`.

### Task 2: Дизайн-система, темы, раскладка, подвал с аннотацией

**Files:**
- Create: `src/styles/index.css`, `src/lib/storage.ts`, `src/lib/theme.tsx`, `src/components/layout/{Layout,Header,Footer,ThemeToggle}.tsx`, `tests/footer.test.tsx`, `tests/storage.test.ts`

**Interfaces:**
- Produces: `safeGet(key: string): string | null`, `safeSet(key: string, value: string): void` — никогда не бросают.
- Produces: `ThemeProvider`, `useTheme(): { theme: 'light' | 'dark'; toggle(): void }`; атрибут `data-theme` на `<html>`; начальное значение — сохранённое, иначе системное.
- Produces: CSS-токены `--color-paper #F4EFE6`, `--color-ink #1C1A17`, `--color-line #D9D0C1`, `--color-sys-<systemId>` (11 шт.), `--font-display` Literata, `--font-body` Golos Text, `--font-mono` JetBrains Mono; тёмная тема переопределяет paper/ink/line.
- Produces: `<Layout>` = Header + `<Outlet/>` + Footer.

- [ ] **Step 1: Failing tests:** `Footer` содержит текст `Сайт носит информационный характер. Заметили ошибку?` и ссылку с текстом `Напишите нам` и `href="/o-proekte#svyaz"`; `safeGet/safeSet` не бросают, когда `localStorage.getItem` бросает (`vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error()})`).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Реализовать. Направление вида — §6 спеки («живой анатомический атлас»: бумажный фон, чернильный текст, тонкие линии, крупная Literata). Перед вёрсткой — загрузить навык `frontend-design`.
- [ ] **Step 4:** Run → PASS; `npm run dev`, проверить шапку/подвал в браузере, светлую и тёмную тему, ширину 375 px без горизонтального скролла.
- [ ] **Step 5:** Commit `feat: design tokens, themes, layout and footer disclaimer`.

### Task 3: Модель контента, системы, реестр 23 разделов, роутинг

**Files:**
- Create: `src/content/types.ts`, `src/content/systems.ts`, `src/content/sections/index.ts`, `src/content/loadSection.ts`, `src/pages/{HomePage,SectionPage,AboutPage,NotFoundPage}.tsx` (заглушки), `src/components/section/ComingSoon.tsx`, `tests/content-registry.test.ts`, `tests/routing.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  type SystemId = 'cells'|'support'|'overview'|'nervous'|'respiratory'|'circulatory'|'digestive'|'urinary'|'skin'|'reproductive'|'endocrine';
  interface SectionMeta { slug: string; title: string; latin: string; tagline: string; system: SystemId; icon: OrganIconName; ready: boolean; adultParts?: boolean }
  interface Stat { value: string; label: string }
  interface Part { id: string; name: string; latin?: string; text: string; adult?: boolean }
  interface SectionContent { slug: string; stats: Stat[]; does: string[]; parts: Part[]; kidSay: string[]; facts: string[]; care: string[]; related: string[] }
  ```
- Produces: `SYSTEMS: { id: SystemId; title: string }[]` в порядке §4.2 спеки; `SECTIONS: SectionMeta[]` — 23 записи в порядке таблицы §5; `getSection(slug): SectionMeta | undefined`; `loadSectionContent(slug): Promise<SectionContent | null>`.
- Slug-и: `kletki-i-belki, skelet, myshcy, vnutrennie-organy, mozg, glaz, uho, zub, legkie, serdce, zheludok, pechen, podzheludochnaya, zhelchnyj-puzyr, pochki, mochevoj-puzyr, kishechnik, zhenskaya-reproduktivnaya, muzhskaya-reproduktivnaya, krovenosnaya-sistema, volosy-i-nogti, beremennost, gormony`.
- Маршруты: `/`, `/razdel/:slug`, `/kletki/:slug` (заглушка ComingSoon до плана «Клетки»), `/o-proekte`, `*` → NotFound.

- [ ] **Step 1: Failing tests:** `SECTIONS.length === 23`; slug-и уникальны и совпадают со списком выше; каждый `system` есть в `SYSTEMS`; у каждого раздела непустые `title`, `latin`, `tagline`; `adultParts` true ровно у `zhenskaya-reproduktivnaya`, `muzhskaya-reproduktivnaya`, `beremennost`. Роутинг (`MemoryRouter`): `/razdel/serdce` рендерит заголовок `Сердце`; `/razdel/xxx` рендерит NotFound с текстом `Страница не найдена`; раздел с `ready:false` рендерит `Раздел готовится`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Реализовать; tagline-ы — короткие яркие (манера референсов), без эмодзи.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: content model, 23-section registry and routes`.

### Task 4: Режим 18+

**Files:**
- Create: `src/lib/adult.tsx`, `src/components/layout/{AdultToggle,AdultConfirmDialog}.tsx`, `src/components/AdultOnly.tsx`, `tests/adult.test.tsx`
- Modify: `src/components/layout/Header.tsx`

**Interfaces:**
- Produces: `AdultProvider`, `useAdult(): { adult: boolean; requestEnable(): void; disable(): void }`; ключ хранения `atlas.adult` = `'1'`.
- Produces: `<AdultOnly load={() => import('...')} />` — вызывает `load` только при `adult === true`, иначе ничего не рендерит.

- [ ] **Step 1: Failing tests:** по умолчанию `adult === false`; клик по переключателю открывает диалог с кнопками `Мне есть 18 лет` и `Отмена`; `Отмена` → остаётся false; подтверждение → true и `safeSet('atlas.adult','1')`; повторный клик выключает без диалога; `AdultOnly` не вызывает `load` при false (`vi.fn`) и вызывает при true; при бросающем `localStorage` всё работает.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Реализовать; диалог — нативный `<dialog>` с фокусом на «Отмена», иконка lucide `ShieldAlert`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: 18+ mode with confirmation and lazy adult content`.

### Task 5: Иконки органов

**Files:**
- Create: `src/components/icons/organs.tsx`, `tests/icons.test.tsx`

**Interfaces:**
- Produces: `type OrganIconName` (по одному на раздел: `cell, skeleton, muscle, organs, brain, eye, ear, tooth, lungs, heart, stomach, liver, pancreas, gallbladder, kidneys, bladder, intestine, uterus, testis, vessels, hair, pregnancy, hormones`); `<OrganIcon name size? strokeWidth? className? />` — SVG 24×24, `stroke="currentColor"`, `fill="none"`, по умолчанию `strokeWidth 1.5`, `aria-hidden`.

- [ ] **Step 1: Failing test:** для каждого `SECTIONS[i].icon` `<OrganIcon>` рендерит `<svg>` с хотя бы одним `path|circle|ellipse`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Нарисовать иконки в линейном стиле Lucide (скруглённые концы, 1.5 px), узнаваемые силуэты.
- [ ] **Step 4:** Run → PASS; визуально проверить сетку всех иконок на временной странице в dev.
- [ ] **Step 5:** Commit `feat: custom organ icon set`.

### Task 6: 3D-сцена, материалы, подписи, выделение

**Files:**
- Create: `src/three/{Stage,StageToolbar,Label,materials,selection,webgl}.ts(x)`, `tests/selection.test.tsx`, `tests/stage-fallback.test.tsx`

**Interfaces:**
- Produces: `SelectionProvider`, `useSelection(): { selected: string|null; hovered: string|null; select(id: string|null): void; hover(id: string|null): void }`.
- Produces: `hasWebGL(): boolean`.
- Produces: `<Stage label: string; description: string; hasCutaway?: boolean; children: (state: StageState) => ReactNode />`, где `StageState = { paused: boolean; cutaway: boolean; labels: boolean; time: { current: number } }`; модели читают `paused` и не двигаются при `true`.
- Produces: `<Label at: [number,number,number]; partId: string; text: string />` — HTML-плашка с линией-выноской, видна при `labels` или если `partId` выделен/наведён.
- Produces: `MAT` — фабрика материалов: `artery, vein, muscle, myocardium, bone, nerve, fat, membrane, glass` (MeshPhysicalMaterial, матовый с лёгким `sheen`/`clearcoat`); `highlight(material)` для выделения.
- Поведение Stage: OrbitControls без панорамы, зум в пределах, авто-вращение медленное до первого касания; `frameloop="demand"`-переключение на паузу, когда сцена вне экрана (IntersectionObserver); `AdaptiveDpr`; окружение из `Lightformer` в коде; `ContactShadows`; кнопки тулбара: Пауза, Разрез (если `hasCutaway`), Подписи, Сброс вида, Показ (Fullscreen API на контейнер + принудительно тёмная сцена; при отсутствии API — фиксированный полноэкранный слой).

- [ ] **Step 1: Failing tests:** `useSelection`: `select('aorta')` → `selected==='aorta'`, `select(null)` сбрасывает; `Stage` при `hasWebGL()===false` (мок) рендерит заглушку с текстом `description` и без `<canvas>`; при `matchMedia('(prefers-reduced-motion: reduce)').matches===true` начальное `paused===true` (проверить через children-функцию).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** Run → PASS; dev-страница с тестовой сферой: крутится, тулбар работает, «Показ» разворачивает, 375 px — ок.
- [ ] **Step 5:** Commit `feat: shared 3D stage, materials, labels and selection`.

### Task 7: Эталонный раздел «Сердце» (модель + контент + страница раздела)

**Files:**
- Create: `src/models/heart/HeartModel.tsx`, `src/models/registry.ts`, `src/content/sections/serdce.ts`, `src/components/section/{SectionHero,StatCards,PartsList,KidSay,FactCards,CareList,RelatedSections}.tsx`, `tests/section-page.test.tsx`, `tests/serdce-content.test.ts`
- Modify: `src/pages/SectionPage.tsx`, `src/content/sections/index.ts` (`serdce.ready = true`)

**Interfaces:**
- Consumes: `Stage`, `Label`, `MAT`, `useSelection` (Task 6); `SectionContent` (Task 3).
- Produces: `MODELS: Record<string, LazyExoticComponent<ComponentType<ModelProps>>>`, `ModelProps = { state: StageState }`; id частей модели = `Part.id` контента.
- Части сердца (id): `right-atrium, left-atrium, right-ventricle, left-ventricle, aorta, pulmonary-trunk, superior-vena-cava, inferior-vena-cava, pulmonary-veins, tricuspid-valve, mitral-valve, septum, coronary-arteries`.
- Модель: узнаваемая форма сердца (асимметричный конус с верхушкой влево-вниз), камеры, дуга аорты, лёгочный ствол, полые вены, коронарные артерии по поверхности; анимация — двухфазное сокращение (предсердия → желудочки, ~70 уд/мин), частицы крови: красные из левого желудочка в аорту, синие из полых вен в правое предсердие; разрез показывает 4 камеры, перегородку и клапаны.
- Страница раздела — блоки 1–10 из §4.3 спеки в этом порядке; на телефоне сцена сверху, на ≥1024 px сцена слева липкая, текст справа.

- [ ] **Step 1: Failing tests:** контент сердца: `stats.length` 3–5, `facts.length` 3–5, `kidSay.length` 1–2, `care.length` 3–5, `does.length` 2–3, каждый `parts[i].id` из списка выше, `related` содержит `krovenosnaya-sistema`, `legkie`; нет эмодзи (`findEmoji` по JSON.stringify). Страница: `/razdel/serdce` показывает заголовки блоков `Что делает`, `Из чего состоит`, `Как рассказать ребёнку`, `Интересные факты`, `Чем болеет и как беречь`, `Связанные разделы`; клик по части в `PartsList` вызывает `select(id)` и элемент получает `aria-current="true"`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Написать контент (тон — §1 спеки; факты проверены: ~100 000 ударов/сутки, ~7 000 л/сутки, масса ~250–350 г, размер с кулак — сверить по источникам) и модель; перед вёрсткой — навык `frontend-design`.
- [ ] **Step 4:** Run → PASS; в браузере: модель узнаётся как сердце, бьётся, клик по части ↔ список, разрез, «Показ», 375 px, тёмная тема; скриншот.
- [ ] **Step 5:** Commit `feat: heart section — model, content, section page`.

### Task 8: Главная — фигура человека, поиск, разделы по системам

**Files:**
- Create: `src/models/body/BodyFigure.tsx`, `src/lib/search.ts`, `tests/search.test.ts`, `tests/home.test.tsx`
- Modify: `src/pages/HomePage.tsx`

**Interfaces:**
- Produces: `search(query: string, parts?: Record<string, Part[]>): { slug: string; title: string; match: string }[]` — регистронезависимо, `ё`=`е`, по `title`, `latin`, `tagline` и именам частей; пустой запрос → `[]`.
- BodyFigure: полупрозрачный силуэт (сглаженная процедурная фигура), внутри органы-упрощения на анатомических местах; наведение → подпись, клик → `navigate('/razdel/<slug>')`; лёгкое «дыхание», пульсация сердца; использует `Stage`.

- [ ] **Step 1: Failing tests:** `search('сердце')[0].slug==='serdce'`; `search('ЖЕЛУДОК')` находит `zheludok`; `search('печень')`==`search('печень ')`; `search('ёж')` ищет как `еж`; `search('')` → `[]`; `search('аорта', {serdce: parts})` → `serdce` с `match==='Аорта'`. Главная: 11 заголовков систем в порядке `SYSTEMS`, 23 ссылки на разделы, у неготовых — пометка `Скоро`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Реализовать (навык `frontend-design`).
- [ ] **Step 4:** Run → PASS; браузер: фигура, клик по сердцу ведёт в раздел, поиск, 375 px, тёмная тема.
- [ ] **Step 5:** Commit `feat: home page with body figure, search and systems grid`.

### Task 9: «О проекте», 404, мета-теги по маршрутам, Docker

**Files:**
- Create: `scripts/prerender-meta.mjs`, `Dockerfile`, `nginx.conf`, `.dockerignore`, `tests/build-output.test.ts`
- Modify: `src/pages/AboutPage.tsx`, `src/pages/NotFoundPage.tsx`, `package.json`

**Interfaces:**
- `/o-proekte`: что за проект (открытый пет-проект для повышения образованности), для кого, как пользоваться с ребёнком, лицензии (код MIT, тексты CC BY 4.0), блок `id="svyaz"` — «Заметили ошибку?» со ссылкой на GitHub Issues репозитория и местом под e-mail (адрес даст Хозяин).
- `prerender-meta.mjs`: для `/`, `/o-proekte` и каждого `/razdel/<slug>` пишет `dist/<route>/index.html` — копию `dist/index.html` с `<title>{Название} — 3D-атлас человека</title>`, `meta description` = tagline, `og:title`, `og:description`; плюс `dist/404.html`, `sitemap.xml`, `robots.txt`.
- nginx: `try_files $uri $uri/index.html /index.html` (неизвестный slug получает SPA, она показывает страницу «Страница не найдена»); gzip; `Cache-Control: immutable` для `/assets/`, `no-cache` для HTML.
- Dockerfile: `node:22-alpine` build → `nginx:1.27-alpine`, порт 80, healthcheck `wget -qO- http://localhost/`.
- Маркер: строка `ADULT_CONTENT_MARKER` вставляется комментарием в каждый 18+-модуль (первый появится в планах репродуктивных разделов; в этом плане — в тестовый `src/content/adult/_marker.ts`, импортируемый только через `AdultOnly`).

- [ ] **Step 1: Failing test** `tests/build-output.test.ts` (запускается после `npm run build`, пропускается без `dist/`): `dist/razdel/serdce/index.html` содержит `<title>Сердце — 3D-атлас человека</title>`; `dist/sitemap.xml` содержит 25 `<loc>`; ни один `dist/assets/index-*.js` не содержит `ADULT_CONTENT_MARKER`; `findEmoji` по всем `dist/**/*.html` → `[]`.
- [ ] **Step 2:** Run `npm run build && npx vitest run tests/build-output.test.ts` → FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** Run → PASS; если есть Docker — `docker build -t atlas . && docker run -p 8080:80 atlas`, `curl -I localhost:8080/razdel/serdce` → 200; нет Docker — отметить в отчёте.
- [ ] **Step 5:** Commit `feat: about page, per-route meta, sitemap, docker image`.

### Task 10: Финальная проверка этапа

- [ ] **Step 1:** `npm run typecheck && npm test && npm run build` — всё зелёное.
- [ ] **Step 2:** Браузер: главная → сердце → 18+ вкл/выкл → «О проекте» → 404; телефон 375 px и десктоп; светлая/тёмная; консоль без ошибок.
- [ ] **Step 3:** Отчёт Хозяину со скриншотами; дальше — планы для остальных разделов (по 3–5 разделов на план, по образцу Task 7) и «Клетки и белки».

---

## Следующие планы (не в этом)

- План 2: Лёгкие, Кровеносная система, Мозг, Глаз, Ухо.
- План 3: Пищеварение — Зуб, Желудок, Печень, Поджелудочная, Желчный пузырь, Кишечник.
- План 4: Скелет, Мышцы, Внутренние органы, Почки, Мочевой пузырь, Волос и ногти.
- План 5: Женская и Мужская репродуктивная системы (с 18+), Беременность, Гормоны.
- План 6: Клетки и белки (вводная клетка + каталог ~35 моделей).
- План 7: Вики, деплой на Coolify (по правилам Хозяина, с подтверждением), smoke-test.
