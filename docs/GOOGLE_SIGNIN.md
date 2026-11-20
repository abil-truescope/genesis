# Как включить «Войти через Google» (10 минут)

Вход работает без своего сервера через Google Identity Services. Нужен только **Client ID**. Он не секретный, его можно хранить в публичном репозитории.

1. Откройте https://console.cloud.google.com/ и войдите в Google-аккаунт.
2. Сверху: **Select a project → New project**, название `atmosphere-diary` → **Create**.
3. Меню **APIs & Services → OAuth consent screen**:
   - User type: **External** → Create;
   - App name: `Дневник атмосферы`, support email — ваша почта;
   - App domain → Privacy policy: `https://abil-truescope.github.io/genesis/#privacy`;
   - Developer contact — ваша почта → **Save and continue** до конца;
   - на вкладке **Audience / Test users** добавьте почты тех, кто будет входить (себя и жюри, если знаете), или нажмите **Publish app**.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**;
   - Authorized JavaScript origins: `https://abil-truescope.github.io` и для локальной проверки `http://localhost:5173`;
   - **Create** → скопируйте **Client ID** (вида `1234-abc.apps.googleusercontent.com`).
5. Вставьте его в `js/config.js`:
   ```js
   export const GOOGLE_CLIENT_ID = '1234-abc.apps.googleusercontent.com';
   ```
6. Закоммитьте и запушьте. Через 1–2 минуты кнопка заработает на сайте.

**Что получает приложение:** имя, почту и аватар из ID-токена. Они хранятся только в браузере пользователя и нужны, чтобы у каждого аккаунта на устройстве был свой дневник. Пароль приложение не видит.

**Если кнопка не появляется:** проверьте, что адрес сайта точно совпадает с Authorized JavaScript origin (без `/genesis` в конце), и подождите несколько минут — Google применяет изменения не сразу.
