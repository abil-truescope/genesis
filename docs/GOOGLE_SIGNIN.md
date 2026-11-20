# Как включить «Войти через Google» (15 минут, по желанию)

Вход по почте и паролю уже работает. Google — дополнительная кнопка; её включают в два шага.

## 1. Google Cloud: получить Client ID и Secret

1. https://console.cloud.google.com/ → **New project** → `atmosphere-diary`.
2. **APIs & Services → OAuth consent screen:** External, имя `Дневник атмосферы`, ваша почта;
   Privacy policy: `https://abil-truescope.github.io/genesis/#privacy` → сохранить → **Publish app**.
3. **Credentials → Create credentials → OAuth client ID → Web application:**
   - Authorized JavaScript origins: `https://abil-truescope.github.io`
   - Authorized redirect URIs: `https://jnpbvtrhodsypuwlftga.supabase.co/auth/v1/callback`
   - Create → скопируйте **Client ID** и **Client secret**.

## 2. Supabase: включить провайдера

1. https://supabase.com/dashboard/project/jnpbvtrhodsypuwlftga/auth/providers → **Google** → Enable.
2. Вставьте Client ID и Client secret → Save.
3. В `js/config.js` поставьте `export const GOOGLE_ENABLED = true;`, закоммитьте и запушьте.

После этого в окне входа появится кнопка «Войти через Google». Secret хранится только в Supabase, в код он не попадает.
