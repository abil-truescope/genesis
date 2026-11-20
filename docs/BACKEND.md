# Бэкенд

**Стек:** Supabase — Postgres, Auth, Storage, Edge Functions. Проект `genesis-diary`, регион `eu-central-1` (Франкфурт).

## Как устроено

```
Браузер (IndexedDB) ──► сначала день сохраняется локально, работает и офлайн
        │  вошёл в аккаунт?
        ▼
Supabase Auth ── почта + пароль (по желанию Google)
Postgres  public.days      ── текст, название, анализ, параметры визуальной системы
          public.profiles  ── имя и версия принятой политики
Storage   diary/<uid>/<dayId>/photo_N.jpg, thumb.jpg   (приватный бакет)
Edge Fn   delete-account   ── полное удаление аккаунта со всеми файлами
```

- **Синхронизация** (`js/cloud.js`): при входе дневник скачивает дни, которых нет на устройстве, и отправляет те, что ещё не в облаке. Новый день уходит в облако сразу после сохранения.
- **Безопасность:** Row Level Security на всех таблицах и на бакете: пользователь видит и меняет только строки и файлы со своим `user_id`. Publishable key в `js/config.js` — публичный, так и задумано.
- **Не храним:** аудиофайлы песен (авторские права) — они остаются только на устройстве.
- **Схема:** `supabase/migrations/20261120_diary_schema.sql`, функция: `supabase/functions/delete-account/index.ts`.

## ⚠️ Обязательная настройка в панели Supabase (2 минуты)

Откройте https://supabase.com/dashboard/project/jnpbvtrhodsypuwlftga

1. **Authentication → Sign In / Providers → Email → выключите «Confirm email» → Save.**
   Без этого после регистрации нужно подтверждать почту, а встроенный почтовый сервер Supabase отправляет письма только участникам вашей организации — жюри не сможет войти.
2. **Authentication → URL Configuration:**
   - Site URL: `https://abil-truescope.github.io/genesis/`
   - Redirect URLs: добавьте `https://abil-truescope.github.io/genesis/` и `http://localhost:5173/`

Восстановление пароля по почте тоже работает только через почтовый сервер; для всех пользователей нужно подключить свой SMTP (Authentication → Emails → SMTP Settings). Для демо это не обязательно.

## Проверка

- `python3 tools/cloud_test.py` — сквозной тест облака в браузере с подменой ответов Supabase: регистрация, загрузка дня и фото, восстановление на «новом устройстве», выход, удаление аккаунта.
- RLS проверен SQL-тестом: второй пользователь не видит дни первого.
