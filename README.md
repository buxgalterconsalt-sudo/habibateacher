# Habiba teacher — onlayn o'quv platformasi

Node.js + SQLite asosidagi platforma: admin kurs va darslar yaratadi, PDF yuklaydi,
video havolasini qo'shadi, testlar tuzadi; o'quvchilar ro'yxatdan o'tib, materiallarni
ko'radi va natijalarini kuzatadi.

Tashqi npm paketlar kerak emas — faqat Node.js 22.5+ (bu kompyuterda 24 o'rnatilgan).

---

## 1. Lokal ko'rib chiqish

Loyiha papkasida PowerShell yoki terminal ochib serverni ishga tushiring:

```cmd
cd "C:\Users\i7TechStore\Desktop\Habiba Teacher\railway-upload"
node server.mjs
```

Brauzerda **http://localhost:8788** ni oching. Server ishlashi uchun terminal oynasi ochiq tursin; to'xtatish uchun `Ctrl+C` bosing.

`8788` band bo'lsa, PowerShell'da boshqa port bering:

```powershell
$env:PORT = "8789"
node server.mjs
```

Keyin **http://localhost:8789** ni oching. Admin sahifasi `/admin`; parol `config.json` yoki Railway `ADMIN_PASSWORD` sozlamasidan olinadi.

### Kod papkalari

- `server.mjs` — server va sahifa yo'naltirishlari;
- `src/config.mjs` — ilova sozlamalari;
- `src/i18n.mjs` — UZ/RU/EN tarjimalari;
- `src/question-import.mjs` — XLSX/DOCX savol importi;
- `seed-data/daily-wisdom-uz.json` — 365 ta qisqa, ilm va o'rganishga oid hikmat; dashboard sanaga qarab bittasini chiqaradi;
- `scripts/build-daily-wisdom.mjs` — kunlik hikmatlar ro'yxatini qayta yaratish;
- `public/platform.css` — sayt uslublari;
- `public/img/` — sahifadagi rasmlar.

- O'quvchi sahifasi: `http://localhost:8788`
- Admin: `http://localhost:8788/admin`
- Admin paroli: `Habiba2026` (o'zgartirish — `config.json`)

Baza va papkalar birinchi ishga tushishda avtomatik yaratiladi:

```
platform/
├─ server.mjs
├─ config.json          # port, admin paroli, yuklash limiti
├─ start-platform.bat
├─ data/platform.db     # SQLite baza
├─ storage/             # yuklangan PDF fayllar
└─ public/platform.css  # dizayn
```

---

## 2. Kontent qo'shish (admin)

1. `http://localhost:8788/admin` → parol.
2. **Yangi kurs** yarating (masalan: «Atestatsiya testlariga tayyorlov»).
3. Kurs ichida **Yangi dars** qo'shing:
   - **Matn** — dars matni;
   - **PDF fayl** — fayl tanlanadi va `storage/` ga saqlanadi (maks. 60 MB);
   - **Video** — YouTube havolasi (video «unlisted» bo'lsin) yoki to'g'ridan-to'g'ri `mp4` havolasi;
   - **Test** — dars yaratilgach, «Savollar» bo'limida savol va 4 variantni kiritasiz.
4. Har bir darsni o'quvchi ochishi, PDF yuklab olishi, test topshirishi mumkin.
5. **O'quvchilar** bo'limida ro'yxatdan o'tganlar va tugatgan darslari ko'rinadi.

PDF fayllar faqat tizimga kirgan o'quvchilarga beriladi (to'g'ridan-to'g'ri havola bilan
ochib bo'lmaydi).

### Test katalogi (Attestatsiya va TKT)

Platformada ikkita test yo'nalishi bor:

- **Attestatsiya** (`/attestation`): «Toifa testlari» (7 bepul test), «2026 KUZ
  PLATFORMA MOCKLARI» (20 ta PRO test, 20 000 so'm) va «Attestatsiya Readinglari»
  (Advanced Passage, 2 000 so'm).
- **TKT** (`/tkt`): 1, 2 va 3-modul mock testlari (6 ta bepul test).

Attestatsiya tayyorgarligi uchun qo‘shimcha ravishda Reading, Grammar, Vocabulary, Pragmatika, Pedagogik mahorat va Kasbiy standart yo‘nalishlarida 20 tadan — jami 120 ta mashq testi (1 000 savol) mavjud.

Kartochkada vaqt, savollar soni, maksimal ball, ko'rishlar va narx ko'rsatiladi.
Narxi 0 bo'lgan testlar bepul; narx kiritilgan testlar **PRO** bo'lib, to'lovdan
keyingina ochiladi.

**PRO testni ochish:** o'quvchi testni ochganda to'lov sahifasi chiqadi
(Telegram havolasi va tarif). Admin panelda kurs → test qatoridagi **«Ruxsat»**
tugmasi orqali o'quvchiga testni ochib beradi yoki yopadi.

**Yangi test qo'shish:** admin → kurs → **Yangi dars** → turi **Test**.
Test uchun davomiylik, narx (0 — bepul), maksimal ball va e'lon qilinadigan
savollar sonini kiritasiz. Savollar «Savollar» bo'limida qo'shiladi. Test
guruhi kurslari umumiy «Kurslar» ro'yxatida ko'rinmaydi — faqat yo'nalish
sahifasida chiqadi.

### Test sahifasi va materiallar

Har bir test kartochkasi bosilganda alohida sahifa ochiladi: test haqida
ma'lumot, vaqt/savollar/ball/narx, natijalar taqsimoti va eng yaxshi 10
ishtirokchi. Bepul yoki ochilgan testda **«Testni boshlash»** tugmasi bo'ladi.

Admin panelda test qatoridagi **«Materiallar»** tugmasi orqali:

- test tavsifini («Test haqida» matni) tahrirlash;
- PDF fayl, havola yoki matn ko'rinishidagi material qo'shish;
- materiallarni o'chirish.

Materiallar test sahifasida ko'rinadi. Pullik test materiallari test
ochilgandan keyin ko'rinadi.

Test yakunlanganda natija Telegramga ham yuboriladi. Buning uchun
`config.json` da `telegramBotToken` va `telegramChatId` to'ldirilgan bo'lishi
kerak (`notifyOnFinish: false` qilsangiz o'chadi).

---

## 3. Sozlamalar

`config.json`:

```json
{
  "port": 8788,
  "adminPassword": "BU_YERGA_OZINGIZNING_PAROLINGIZ",
  "siteName": "Habiba teacher",
  "maxUploadMb": 60,
  "telegram": "https://t.me/Qobuljon_91",
  "telegramBotUsername": "your_bot_username",
  "phone": "+998 93 568 00 91",
  "telegramBotToken": "123456789:AA...",
  "telegramChatId": "123456789",
  "notifyOnFinish": true
}
```

- Parolni albatta o'zgartiring.
- `telegramBotToken` — @BotFather'dan olingan bot tokeni; `telegramChatId` —
  natijalar boradigan chat (adminning Telegram ID si). Bo'sh bo'lsa, test
  yakunlanganda Telegram xabari yuborilmaydi.
- Duel takliflarini bot nomidan yuborish uchun Railway'da `TELEGRAM_BOT_TOKEN`
  va `TELEGRAM_BOT_USERNAME` ni kiriting. @BotFather'da `/setinline` orqali
  botning Inline Mode rejimini yoqing. Duel yaratuvchi kontaktni tanlagach,
  Telegram'da bot taklifini jo'natishni tasdiqlaydi.
- Katta videolarni serverga yuklamang — YouTube (unlisted) ishlatsangiz, disk tejaladi.
- PDF hajmi `maxUploadMb` dan oshsa, rad etiladi.

---

## 4. Zaxira nusxa

Yetarli:

```
data/platform.db        (va -wal, -shm bo'lsa)
storage/                (PDF fayllar)
config.json
```

Bu fayllarni nusxalab qo'ysangiz, butun platforma tiklanadi.

---

## 5. Serverga joylash (keyingi qadam)

Platforma **Node.js** talab qiladi — Netlify kabi statik hosting ishlamaydi.

Variantlar:

1. **VPS** (tavsiya): Node.js o'rnatiladi, `node server.mjs` xizmat sifatida ishlaydi.
   Oldiga Caddy yoki Nginx qo'yiladi:
   - `platform.habibatecher.uz` → `127.0.0.1:8788`;
   - HTTPS avtomatik (Caddy + Let's Encrypt).
2. **Node.js qo'llab-quvvatlaydigan hosting** (webspace.uz kabi) — Node mavjudligini
   tekshirish kerak.

Muhim: `data/` va `storage/` papkalari doimiy diskda turishi kerak (konteyner
qayta ishga tushganda o'chib ketmasin).

Sayt (marketing) Netlify'da qoladi; platforma esa alohida subdomenda turadi.
Keyin sayt menyusiga «Platformaga kirish» havolasini qo'shamiz.

---

## 6. Xavfsizlik

- Admin parolini o'zgartiring (`config.json`).
- HTTPS orqali ishlating (cookie'lar `Secure` bo'ladi).
- `data/` va `storage/` ni ochiq statik papka qilib qo'ymang.
- Muntazam backup qiling.
- Login 5 marta xato bo'lsa, 5 daqiqaga bloklanadi.

---

## 7. Tekshirilgan oqim

- [x] Admin login → kurs yaratish
- [x] Matn / PDF / test darslarini qo'shish
- [x] PDF yuklash va himoyalangan tarzda berish
- [x] O'quvchi ro'yxatdan o'tishi va kirishi
- [x] Kurs, dars, progress, test natijasi
- [x] Admin statistikasi va o'quvchilar ro'yxati
- [x] Attestatsiya (7 bepul + 20 PRO + reading) va TKT (6 ta) test katalogi
- [x] PRO testlar uchun to'lov sahifasi va admin orqali ruxsat berish
- [x] Test sahifasi: natijalar taqsimoti, top-10, materiallar
- [x] Admin test paneli: tavsif + PDF/havola/matn materiallar
- [x] Test yakunlanganda Telegramga natija yuborish
