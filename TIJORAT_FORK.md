# Tijorat+ fork of ZITADEL

Этот репозиторий — форк [zitadel/zitadel](https://github.com/zitadel/zitadel), на котором работает
единый вход Tijorat+ (`https://id.tijorat.plus`). Форк меняет только Login UI v2 (`apps/login`).
Go-бэкенд (core) не меняется, поэтому core используется из официального образа ZITADEL.

## Принципы

1. **Новый код — в собственных путях форка.** Upstream их не трогает, поэтому конфликтов там не бывает:
   - `apps/login/src/tijorat/**` — логика, компоненты, стили, тексты;
   - `apps/login/src/app/(login)/passkey/offer/**` — страница, которой нет в upstream;
   - `scripts/tijorat/**`, `.github/workflows/tijorat-*.yml`, этот файл.
2. **В upstream-файлах — только короткие крючки** (1–5 строк), каждый помечен комментарием `TIJORAT`.
   Найти все: `git grep -n TIJORAT -- apps/login/src`.
3. **Всё выключено по умолчанию.** Без переменных из раздела «Настройка» login ведёт себя как upstream,
   поэтому upstream-тесты проходят без изменений.
4. **Каждый изменённый upstream-файл перечислен ниже.** `scripts/tijorat/upstream-diff.sh` в CI
   падает, если изменён файл, которого нет в списке.

## Изменённые upstream-файлы

<!-- upstream-files:start -->

| Файл                                            | Крючок                                                                           |
| ----------------------------------------------- | -------------------------------------------------------------------------------- |
| `apps/login/src/app/(login)/layout.tsx`         | При бренде отдаёт `TijoratRootLayout` (весь экран, Inter); favicon Tijorat+      |
| `apps/login/src/app/(login)/loginname/page.tsx` | Вместо `UsernameForm` — `TijoratSignInForm` (логин и пароль на одном экране)     |
| `apps/login/src/app/(login)/register/page.tsx`  | Вместо `RegisterForm` — `TijoratSignUpForm` (сразу пароль, без выбора метода)    |
| `apps/login/src/components/dynamic-theme.tsx`   | Отдаёт разметку страниц `TijoratTheme` (бренд-панель, форма, языки)              |
| `apps/login/src/helpers/colors.ts`              | Палитра Tijorat+ вместо стандартных цветов ZITADEL (`withTijoratColors`)         |
| `apps/login/src/i18n/request.ts`                | Языки форка (`tijoratAllowedLanguages`) и тексты Tijorat+ (`getTijoratMessages`) |
| `apps/login/src/lib/i18n.ts`                    | `LANGS` = en, ru, tg, uz при бренде (`TIJORAT_LANGS`)                            |
| `apps/login/src/lib/server/password.ts`         | После входа по паролю предлагает passkey (`getPasskeyOfferRedirect`)             |
| `apps/login/src/lib/server/register.ts`         | После регистрации предлагает passkey (`getPasskeyOfferRedirect`)                 |

<!-- upstream-files:end -->

## Что делает форк

### Бренд (`NEXT_PUBLIC_TIJORAT_BRAND=true`)

- **Палитра** взята из `tajerp_ui/styles/tokens.css`:
  - primary #167d55 — фирменный зелёный, затемнённый чуть сильнее `--ui-brand-solid`, чтобы
    белый текст на кнопках читался с контрастом 5.1:1;
  - светлый фон #f7f9f8, тёмный #132621;
  - ошибки #c43422 и #f0997a.

  Цвета, которые админ задал в Branding Settings сам, сохраняются. Заменяются только пустые поля и
  стандартные значения ZITADEL (`cmd/defaults.yaml`, `LabelPolicy`).

- **Шрифт** Inter, включая `cyrillic-ext`.
- **Разметка страниц** как в `tajerp_ui/stories/examples/Login.stories.tsx`: на весь экран, без
  карточки (`TijoratRootLayout` + `TijoratTheme`).
  - На больших экранах слева тёмно-зелёная бренд-панель (заголовок, три пункта, ©), справа форма
    шириной 384px.
  - Наверху справа переключатель языков RU/TJ/UZ/EN, внизу — переключатель темы.
  - Поля ввода и кнопки — как `Input`/`Button size="lg"` из tajerp_ui. Поля на остальных экранах
    (смена пароля, коды, MFA) подогнаны стилями в `tijorat.scss`.

  Логотип Tijorat+ встроен как inline-SVG (`src/tijorat/brand/wordmark.tsx`), favicon — как data URI:
  standalone-сервер login не раздаёт `public/` под base path. Логотипы, загруженные в Branding
  Settings, имеют приоритет над встроенным.

- **Вход на одном экране** (`src/tijorat/forms/sign-in-form.tsx`): email/логин и пароль сразу, ссылка
  «Забыли пароль?», заметная кнопка «Создать аккаунт».
  - Action `signInWithPassword` сначала вызывает штатный `sendLoginname`, который решает, куда вести
    пользователя: IdP, только passkey, приглашение, регистрация или ложный шаг пароля для неизвестных.
  - Пароль проверяется сразу (`sendPassword`), только когда этот шаг ведёт на ввод пароля. Поэтому MFA,
    смена пароля, подтверждение email, защита от перебора и подсказка passkey работают как раньше.
- **Регистрация на одном экране** (`src/tijorat/forms/sign-up-form.tsx`): имя, фамилия, email, пароль
  и повтор, требования к паролю, согласие с условиями.
  - Выбора «Passkey / Пароль» нет. Passkey предлагается сразу после регистрации.
- **Языки:** только English, Русский, Тоҷикӣ, O‘zbekcha (латиница).
  - Полные переводы tg/uz лежат в `src/tijorat/locales/{tg,uz}.json`.
  - ZITADEL core этих языков не знает, поэтому при бренде список языков login не фильтруется по
    настройкам инстанса.
  - Письма и SMS пользователям с языком tg/uz приходят на языке инстанса по умолчанию (ru).
  - Файлы остальных языков upstream не удалены, чтобы не было конфликтов при обновлении; при бренде
    они просто не показываются.
- **Тексты ru/en:** короче и без упоминаний ZITADEL. Лежат в `src/tijorat/locales/{ru,en}.json`.
  API `GetHostedLoginTranslation` всегда возвращает полный набор стандартных текстов ZITADEL. Поэтому
  overlay применяется после него, но только к ключам, где API отдаёт стандартный текст. Если админ
  изменил текст через `SetHostedLoginTranslation`, остаётся его версия.

### Предложение passkey (`TIJORAT_PASSKEY_OFFER=true`)

Подсказка показывается после успешного входа по паролю или регистрации с паролем, когда пройдены
все проверки (смена пароля, подтверждение email, MFA), и только если:

- passkey разрешены политикой входа;
- у пользователя ещё нет passkey;
- он не нажимал «Не сейчас» на этом устройстве последние 30 дней.

Страница `/passkey/offer` работает так:

- если устройство не умеет вход по отпечатку или Face ID, она сразу продолжает вход;
- после регистрации passkey вход завершается без повторной аутентификации, потому что сессия уже
  содержит проверенный пароль;
- завершение OIDC/SAML-запроса заново проверяет сессию штатным `isSessionValid`.

## Настройка

### Переменные окружения login

| Переменная                     | Когда              | Значение для Tijorat+                       |
| ------------------------------ | ------------------ | ------------------------------------------- |
| `NEXT_PUBLIC_TIJORAT_BRAND`    | сборка (build-arg) | `true`                                      |
| `NEXT_PUBLIC_BASE_PATH`        | сборка             | `/ui/v2/login`                              |
| `NEXT_PUBLIC_THEME_LAYOUT`     | сборка             | `side-by-side`                              |
| `NEXT_PUBLIC_THEME_ROUNDNESS`  | сборка             | `mid`                                       |
| `NEXT_PUBLIC_THEME_APPEARANCE` | сборка             | `flat`                                      |
| `NEXT_PUBLIC_AUTO_SUBMIT_CODE` | сборка             | `true` (код из письма отправляется сам)     |
| `TIJORAT_PASSKEY_OFFER`        | запуск             | `true`                                      |
| `EMAIL_VERIFICATION`           | запуск             | `true` (вход только с подтверждённым email) |

`NEXT_PUBLIC_*` подставляются в код при `next build`, поэтому задаются при сборке образа, а не при запуске.

Без `EMAIL_VERIFICATION=true` login email не проверяет вообще. После регистрации пользователь сразу
попадает в приложение, а tajerp_base его не пустит, потому что требует `email_verified`. Переменная
работает только вместе с SMTP в ZITADEL: код подтверждения приходит письмом. После регистрации с
неподтверждённым email пользователь сначала вводит код (`/verify`), и подсказка passkey в этом случае
не показывается.

### Настройки инстанса ZITADEL (Console или API, без кода)

**Брендинг** (Default settings → Branding): включить «Hide watermark». Login подставит логотип и
палитру Tijorat+ сам, но письма ZITADEL (подтверждение email, сброс пароля) берут логотип и цвета
только из этих настроек. Поэтому задайте их там тоже:

- логотип — `tajerp_app/assets/brand/tijorat_wordmark.svg`;
- primary #167d55, фон #f7f9f8, текст #0c1e16, ошибки #c43422.

**Безопасность:**

- **Lockout:**
  - `Max password attempts = 5`;
  - `Max OTP attempts = 5`.

  По умолчанию стоит 0, то есть попытки не ограничены.

- **Login policy:**
  - `Ignore unknown usernames = on` — ответ не выдаёт, существует ли аккаунт;
  - passkey разрешены;
  - `Force MFA` для организаций и ролей с правами администратора.
- **Password complexity:** минимум 10 символов без обязательных спецсимволов. Длинный пароль
  надёжнее и проще запомнить, чем короткий со «сложными» правилами.

**Языки:** язык инстанса по умолчанию — `ru`. Список языков login задаёт сам форк (en, ru, tg, uz), настройка allowed languages инстанса на него не влияет.

## Обновление от upstream

`main` — чистое зеркало `zitadel/zitadel`. Работа форка живёт в отдельной ветке.

```bash
git remote add upstream https://github.com/zitadel/zitadel.git   # один раз
git fetch upstream --tags
git checkout main && git merge --ff-only upstream/main && git push origin main
git checkout <ветка форка>
git merge <тег upstream, например v4.x.y>                        # merge, не rebase
scripts/tijorat/upstream-diff.sh upstream/main
pnpm nx run @zitadel/login:test-unit
```

Конфликты возможны только в файлах из таблицы выше. При конфликте:

1. Примите версию upstream.
2. Заново вставьте крючок `TIJORAT` — он умещается в одну-две строки.
3. Если upstream переименовал ключ локали, который мы перекрываем, упадёт тест
   `src/tijorat/locales/index.test.ts`. Обновите ключ в `src/tijorat/locales/*.json`.
