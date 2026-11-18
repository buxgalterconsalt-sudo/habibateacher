# Railway + GitHub ga deploy qilish

Bu papka to'liq deployga tayyor: `Dockerfile`, `railway.json`, `package.json`, `.env.example` qo'shilgan.

## 1. GitHub repo

Repo ildizida (root) quyidagilar bo'lishi kerak:

```
server.mjs
public/
Dockerfile
railway.json
package.json
```

Agar repo ichida papkalar bo'lsa (`platform/server.mjs`), Railway'da **Root Directory** ni `platform` qilib qo'ying.

**GitHub'ga yubormang:** `config.json`, `data/`, `storage/`, `*.db`, `.env` — bular `.gitignore` va `.dockerignore` da yopilgan. Ular maxfiy ma'lumot va katta fayllar.

## 2. Railway Variables

Railway → Service → **Variables** bo'limiga qo'shing:

| Nomi | Majburiy | Izoh |
|---|---|---|
| `ADMIN_PASSWORD` | ha | Admin panel paroli |
| `SITE_NAME` | ha | `Habiba teacher` |
| `APP_URL` | ha | `https://habibateacher.uz` |
| `TELEGRAM_BOT_TOKEN` | ha | Bot tokeni |
| `TELEGRAM_BOT_USERNAME` | ha | `@HabibateacherBot` |
| `TELEGRAM_CHAT_ID` | ha | Admin xabarlari uchun chat ID |
| `TELEGRAM_URL` | yo'q | Telegram havolasi |
| `CONTACT_PHONE` | yo'q | Aloqa telefon raqami |
| `MAX_UPLOAD_MB` | yo'q | `100` (video uchun alohida 1 GB) |

`PORT` ni qo'lda yozmang — Railway o'zi beradi, ilova uni avtomatik oladi.

## 3. Volume (baza va fayllar saqlanishi uchun)

Railway → Service → **Volumes** → **Add Volume**:

- Mount path: `/data`

Ilova avtomatik:
- bazani `/data/data/platform.db` da,
- yuklangan fayllarni `/data/storage` da saqlaydi.

Volume bo'lmasa, har deployda baza va yuklamalar o'chib ketadi.

## 4. Deploy

1. Railway → **New Project** → **Deploy from GitHub repo**.
2. Repo va branch ni tanlang.
3. Agar kerak bo'lsa **Root Directory** = `platform`.
4. **Deploy** ni bosing.
5. Loglarda quyidagi qator chiqishi kerak:

```
Platforma ishga tushdi: http://localhost:PORT
```

## 5. Domen

Avval Railway bergan test domenini tekshiring:

```
https://<service>.up.railway.app
```

Ishlasa, **Settings → Networking → Custom Domain** orqali `habibateacher.uz` va `www.habibateacher.uz` qo'shing.

Cloudflare DNS da:

- `habibateacher.uz` → **CNAME** → Railway bergan target (masalan `xxxx.up.railway.app`)
- Proxy dastlab **DNS only** (kulrang bulut) bo'lsin; ishlagach **Proxied** qilish mumkin.

Hozir domen `153.52.255.8` (Railway edge) ga ketayapti va **404** qaytaryapti — bu servis ishlamayotganini bildiradi, DNS xatosi emas. Deploy muvaffaqiyatli bo'lsa, 404 yo'qoladi.

## 6. Bot haqida muhim

Telegram bot tokeni faqat **bitta** joyda ishlashi kerak. Lokal kompyuterda ham, Railway'da ham bir vaqtda ishlasa, Telegram `409 Conflict` beradi.

- Railway'da ishlatmoqchi bo'lsangiz, lokal serverni to'xtating yoki lokal `config.json` dan bot tokenini olib tashlang.
- Yoki Railway'da alohida bot tokeni ishlating.

## 7. Eski bazani ko'chirish (ixtiyoriy)

Mavjud `platform.db` va `storage/` fayllarini Railway volume ichiga ko'chirish kerak:

```
/data/data/platform.db
/data/storage/...
```

Buni Railway shell/SSH yoki volume orqali qiling. Ko'chirishdan oldin serverni to'xtatib turing, keyin qayta ishga tushiring.
