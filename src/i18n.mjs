const LANG_CODES = ["uz", "ru", "en"];
const I18N = {
  ru: {
    "Salom,": "Здравствуйте,",
    "Xush kelibsiz": "Добро пожаловать",
    "O'rganishni davom eting va maqsadingizga erishing!": "Продолжайте учиться и достигайте своих целей!",
    "kunlik streak": "дней подряд",
    "Ilovani o'rnatish": "Установить приложение",
    "Kurs jarayoni": "Прогресс курса",
    "Yaxshi boshladingiz, davom eting 🚀": "Хорошее начало, продолжайте 🚀",
    "Birinchi video darsni boshlang 🚀": "Начните первый видеоурок 🚀",
    "Guruhda o'rningiz": "Ваше место в группе",
    "Yutuqlar": "Достижения",
    "Video darslar": "Видео-уроки",
    "Darslarni qidirish...": "Поиск уроков...",
    "Katak ko'rinishi": "В виде карточек",
    "Ro'yxat ko'rinishi": "В виде списка",
    "Guruh reytingi": "Рейтинг группы",
    "Faol o'quvchilarning natijalari": "Результаты активных учеников",
    "Haftalik": "За неделю",
    "Bu hafta hali hech kim dars tugatmadi. Birinchi bo'ling!": "На этой неделе уроки ещё никто не завершил. Будьте первым!",
    "Har kuni ozgina o'sish ham katta natijaga olib keladi.": "Небольшой ежедневный прогресс приводит к большим результатам.",
    "Barcha darslar tugatilgan!": "Все уроки завершены!",
    "Tabriklaymiz, siz barcha materiallarni o'zlashtirdingiz.": "Поздравляем, вы изучили все материалы.",
    "Attestatsiya testlari": "Тесты аттестации",
    "TKT testlari": "Тесты TKT",
    "Kurs jarayon": "Прогресс курса",
    "Parol kamida 6 belgidan iborat bo'lishi kerak.": "Пароль должен содержать не менее 6 символов.",
    "Ism faqat harflardan iborat bo'lishi kerak.": "Имя должно содержать только буквы.",
    "Telefon raqami faqat 9 ta raqamdan iborat bo'lishi kerak.": "Номер телефона должен содержать ровно 9 цифр.",
    "Telegram username (@username) yoki raqamli ID kiriting.": "Введите username Telegram (@username) или числовой ID.",
    "Bu telefon raqam allaqachon ro'yxatdan o'tgan.": "Этот номер телефона уже зарегистрирован.",
    "Bu Telegram ID allaqachon ro'yxatdan o'tgan. Bir ID   bitta akkaunt.": "Этот ID Telegram уже зарегистрирован. Один ID — одна учётная запись.",
    "Bu Telegram username allaqachon ro'yxatdan o'tgan.": "Этот username Telegram уже зарегистрирован.",
    "Parol": "Пароль",
    "Kamida 6 belgi": "Не менее 6 символов",
    "Bosh sahifa": "Главная",
    "Attestatsiya": "Аттестация",
    "TKT": "TKT",
    "Ilm izlash uchun yo'lga chiqqan kishiga Alloh jannat yo'lini oson qiladi.": "Тому, кто отправился искать знания, Аллах облегчает путь в Рай.",
    "Sizlarning yaxshilaringiz Qur'onni o'rganib, uni o'rgatganlaringizdir.": "Лучшие из вас — те, кто изучает Коран и обучает ему других.",
    "Amallar niyatlarga bog'liq.": "Поступки оцениваются по намерениям.",
    "Yaxshi gap aytsin yoki sukut saqlasin.": "Пусть говорит благое или молчит.",
    "Ikki ne'mat: sog'lik va bo'sh vaqt.": "Два блага, которые люди часто не ценят: здоровье и свободное время.",
    "Ilm — insonni yuksaltiradigan nur.": "Знание — свет, возвышающий человека.",
    "Ustoz bergan saboq — umrga yo'ldosh.": "Урок учителя сопровождает человека всю жизнь.",
    "Mehnat qilgan — murodga yetar.": "Труд приводит к цели.",
    "Bugungi kichik qadam ertangi katta natijadir.": "Маленький шаг сегодня — большой результат завтра.",
    "Vaqtni qadrlagan maqsadiga yaqinlashadi.": "Тот, кто ценит время, приближается к своей цели.",
    "Reja — niyatni amalga eltuvchi yo'l xaritasi.": "План — это маршрут от намерения к действию.",
    "Takrorlash — bilimning mustahkam tayanchi.": "Повторение — надёжная опора знаний.",
    "Til bilgan — el biladi.": "Знающий язык знает людей.",
    "Shirin so'z ko'ngilni obod qiladi.": "Доброе слово согревает сердце.",
    "Tinglash ham muloqotning muhim qismidir.": "Умение слушать — важная часть общения.",
    "Savol berishdan uyalmang: bilmaganini so'rash ilm eshigidir.": "Не стесняйтесь задавать вопросы: вопрос открывает путь к знаниям.",
    "Har kuni oz-ozdan o'rganish katta maqsadga olib keladi.": "Небольшое обучение каждый день приводит к большой цели.",
    "Sabr va izchillik mahoratni shakllantiradi.": "Терпение и последовательность формируют мастерство.",
    "Bilim ulashilsa, qadri ortadi.": "Когда знаниями делятся, их ценность растёт.",
    "O'qish qalbga, mashq esa mahoratga yo'l ochadi.": "Учёба открывает путь к знаниям, а практика — к мастерству.",
    "Maqsadni yozing, vaqtni belgilang, bugun boshlang.": "Запишите цель, назначьте время и начните сегодня.",
    "Ustozga hurmat — ilmga hurmat.": "Уважение к учителю — уважение к знаниям.",
    "Yaxshi muomala — tilning eng go'zal tarjimasi.": "Доброе отношение — лучший перевод слов.",
    "Bugun o'rganganingiz ertaga birovga yo'l ko'rsatadi.": "То, чему вы научились сегодня, завтра поможет кому-то найти путь.",
    "Haqiqiy tayyorgarlikni boshlang": "Начните подготовку",
    "Ingliz tili attestatsiyasiga ishonch bilan tayyorlaning": "Готовьтесь к аттестации по английскому языку уверенно",
    "Ingliz tili o'qituvchilari uchun attestatsiya testlari, TKT modullari, metodika va amaliy tayyorlov — barchasi bir platformada.": "Тесты для аттестации учителей английского языка, модули TKT, методика и практическая подготовка — всё на одной платформе.",
    "Yo'nalishni tanlang": "Выберите направление",
    "Username (@qobuljon) yoki raqamli ID. Kod bot orqali kelishi uchun avval botga": "Username (@qobuljon) или числовой ID. Чтобы получить код от бота, сначала отправьте ему",
    "@username yoki 1097025987": "@username или 1097025987",
    "Parol aynan 4 ta lotin harfi yoki raqamdan iborat bo'lishi kerak.": "Пароль должен состоять ровно из 4 латинских букв или цифр.",
    "Teaching Knowledge Test (TKT) uchun tayyorgarlik imtihon uslubidagi modul sinov testlari": "Подготовка к Teaching Knowledge Test (TKT) — модульные пробные тесты в экзаменационном формате",
    "Birgalikda natijaga": "Вместе — к результату",
    "Bitta tarif bilan barcha pullik testlarni oching ancha tejamkor.": "Один тариф открывает все платные тесты — гораздо выгоднее.",
    "Attestatsiya yoki TKT o'zingizga kerakli yo'nalishdan boshlang.": "Аттестация или TKT — начните с нужного направления.",
    "Ingliz tili fani o'qituvchilari uchun testlar, metodika va demo dars.": "Тесты, методика и демо-уроки для учителей английского языка.",
    "Teaching Knowledge Test formatidagi metodika va sinf boshqaruvi testlari.": "Тесты по методике и управлению классом в формате Teaching Knowledge Test.",
    "Atestatsiyaga tayyorlov, metodika, demo dars va testlar barchasi bir joyda.": "Подготовка к аттестации, методика, демо-уроки и тесты — всё в одном месте.",
    "Teaching Knowledge Test (TKT) uchun tayyorgarlik imtihon uslubidagi modul sinov testlari.": "Подготовка к Teaching Knowledge Test (TKT) — модульные пробные тесты в экзаменационном формате.",
    "Habiba teacher ingliz tili fani o'qituvchilarini atestatsiyaga tayyorlaydigan onlayn platforma. Testlar, metodika, demo dars va portfolio bo'yicha tizimli materiallar.": "Habiba teacher — онлайн-платформа для подготовки учителей английского языка к аттестации. Системные материалы: тесты, методика, демо-уроки и портфолио.",
    "Har bir dars sinfdagi haqiqiy vaziyatlarga moslashtirilgan.": "Каждый урок адаптирован к реальным ситуациям в классе.",
    "Darslik va qo'llanmalarni platformadan ochish yoki yuklab olish.": "Открывайте учебники и пособия на платформе или скачивайте их.",
    "O'qituvchilar uchun toifa attestatsiyasiga tayyorgarlik sinov testlari, natijalar va javoblar.": "Подготовка учителей к аттестации на категорию — пробные тесты, результаты и ответы.",
    "Barcha yo'nalishlar": "Все направления",
    "Do'stingiz bilan bir testda kuch sinashing. Kod yarating, do'stingiz qo'shilsin va eng ko'p to'g'ri javob bergan yutsin.": "Проверьте силы с другом в одном тесте. Создайте код, пригласите друга — побеждает тот, у кого больше правильных ответов.",
    "Atestatsiyaga tayyorlov kurslari. Kursni ochish uchun tizimga kiring.": "Курсы подготовки к аттестации. Войдите, чтобы открыть курс.",
    "Tugatilgan darslar va o'rtacha test natijasi bo'yicha.": "По пройденным урокам и среднему результату тестов.",
    "Ingliz tili o'qituvchilari uchun atestatsiyaga tayyorlov: testlar, metodika, demo dars va portfolio.": "Подготовка учителей английского языка к аттестации: тесты, методика, демо-уроки и портфолио.",
    "Ingliz tili o'qituvchilari uchun atestatsiyaga tayyorlov platformasi.": "Платформа подготовки учителей английского языка к аттестации.",
    "Telegram orqali bog'laning": "Свяжитесь через Telegram",
    "Excel / Word dan yuklash": "Загрузка из Excel / Word",
    "Bo'limlar va matnlar": "Разделы и тексты",
    "Namuna Excel faylni yuklab olish": "Скачать образец Excel",
    "Yuklash": "Загрузить",
    "Savol qo'shish": "Добавить вопрос",
    "Dars qo'shish": "Добавить урок",
    "Yangi savol": "Новый вопрос",
    "Tahrirlash": "Редактировать",
    "Saqlash": "Сохранить",
    "O'chirish": "Удалить",
    "Kurs nomini tahrirlash": "Редактировать название курса",
    "Yangi dars": "Новый урок",
    "Yangi kurs": "Новый курс",
    "Yangi bo'lim": "Новый раздел",
    "Darslar": "Уроки",
    "Savollar": "Вопросы",
    "Ruxsatlar": "Доступы",
    "Materiallar": "Материалы",
    "Test savollari": "Вопросы теста",
    "Bo'limlar": "Разделы",
    "Admin panel": "Админ-панель",
    "Bosh sahifa": "Главная",
    Attestatsiya: "Аттестация",
    TKT: "TKT",
    Duel: "Дуэль",
    Kurslar: "Курсы",
    Tariflar: "Тарифы",
    Reyting: "Рейтинг",
    Kirish: "Войти",
    Chiqish: "Выйти",
    Platforma: "Платформа",
    Admin: "Админ",
    "O'quvchilar": "Ученики",
    "Saytni ko'rish": "Открыть сайт",
    "Biz haqimizda": "О нас",
    "Onlayn o'quv platformasi": "Онлайн-платформа обучения",
    "Hoziroq boshlash": "Начать сейчас",
    "Platformadan foydalanish": "Войти на платформу",
    ATESTATSIYA: "АТТЕСТАЦИЯ",
    "Mock testlar. Metodika. Demo dars": "Мок-тесты. Методика. Демо-урок",
    "Yo'nalishni tanlang": "Выберите направление",
    "Ochish   ": "Открыть",
    "Barcha kurslar": "Все курсы",
    "O'qituvchilar uchun amaliy tayyorlov": "Практическая подготовка для учителей",
    "Haqiqiy formatdagi mock testlar": "Мок-тесты в реальном формате",
    "PDF darslik va qo'llanmalar": "PDF-учебники и пособия",
    "Video tushuntirishlar": "Видео-объяснения",
    "Progress va natijalar nazorati": "Контроль прогресса и результатов",
    "Bilim   amaliyotda kuch.": "Знания — сила на практике.",
    "O'quvchilar": "Ученики",
    Darslar: "Уроки",
    "Tugatilgan darslar": "Пройденные уроки",
    "Nega biz": "Почему мы",
    "Natijaga olib boradigan tayyorlov": "Подготовка, которая приводит к результату",
    "PDF materiallar": "PDF-материалы",
    "Video darslar": "Видео-уроки",
    "Trener tushuntirishlari va amaliy namunalar.": "Объяснения тренера и практические примеры.",
    "Mock testlar": "Мок-тесты",
    "Haqiqiy formatdagi testlar, natija va tahlil.": "Тесты в реальном формате, результаты и анализ.",
    "Atestatsiyaga bugun tayyorlanishni boshlang": "Начните подготовку к аттестации сегодня",
    "Ro'yxatdan o'ting yoki Telegram orqali bog'laning.": "Зарегистрируйтесь или напишите нам в Telegram.",
    "Ro'yxatdan o'tish": "Регистрация",
    "Barcha huquqlar himoyalangan.": "Все права защищены.",
    "  Barcha yo'nalishlar": "Все направления",
    "O'qituvchlar uchun mock testlar": "Мок-тесты для учителей",
    "Attestatsiya testlari": "Тесты аттестации",
    "TKT testlari": "Тесты TKT",
    "Toifa testlari": "Тесты по категории",
    "Ajratilgan vaqt:": "Время:",
    "Savollar soni:": "Вопросы:",
    "Eng yuqori ball:": "Максимальный балл:",
    Bepul: "Бесплатно",
    Ochilgan: "Открыто",
    "Bu testlarni birma-bir sotib olish shart emas": "Не нужно покупать эти тесты по отдельности",
    "Tarifni ko'rish   ": "Посмотреть тарифы",
    Narx: "Цена",
    "Test haqida": "О тесте",
    Materiallar: "Материалы",
    "Materiallar test ochilgach ko'rinadi.": "Материалы откроются после покупки теста.",
    "Natijalar taqsimoti": "Распределение результатов",
    "Har bir ishtirokchining eng yaxshi natijasi asosida": "По лучшему результату каждого участника",
    "70% va yuqori": "70% и выше",
    "Jami qatnashganlar:": "Всего участников:",
    "Testga kirish uchun tizimga kiring": "Войдите, чтобы открыть тест",
    "Testni boshlash": "Начать тест",
    "Qayta topshirish": "Пройти заново",
    "Sizning natijangiz:": "Ваш результат:",
    "Tayyor bo'lsangiz, testni boshlang.": "Когда будете готовы, начните тест.",
    "Telegram orqali sotib olish": "Купить через Telegram",
    "Bu testni tarif bilan oching": "Откройте тест по тарифу",
    "Bitta tarif   barcha pullik testlar uchun.": "Один тариф для всех платных тестов.",
    "Savollar uchun:": "Вопросы:",
    "Eng yaxshi 10 ishtirokchi": "Топ-10 участников",
    "Hozircha natijalar yo'q. Birinchi bo'lib topshiring.": "Пока результатов нет. Будьте первым.",
    "Tavsif va materiallarni tahrirlash   ": "Редактировать описание и материалы",
    Boshqarish: "Управлять",
    "Yangi test qo'shish": "Добавить новый тест",
    Katalog: "Каталог",
    "Bitta to'lov bilan barcha kurs va materiallarga kirish.": "Одна оплата — доступ ко всем курсам и материалам.",
    "Tavsiya etiladi": "Рекомендуется",
    "To'liq kirish": "Полный доступ",
    "Barcha kurslar, PDF materiallar, testlar va yangilanishlar.": "Все курсы, PDF-материалы, тесты и обновления.",
    "/ 3 oy": "/ 3 месяца",
    "Barcha kurslarga kirish": "Доступ ко всем курсам",
    "Mock testlar va natijalar": "Мок-тесты и результаты",
    "Yangi materiallar bepul": "Новые материалы бесплатно",
    "Sotib olish": "Купить",
    "Telefon va parolingizni kiriting.": "Введите телефон и пароль.",
    Telefon: "Телефон",
    Parol: "Пароль",
    "Akkountingiz yo'qmi?": "Нет аккаунта?",
    "Ismingiz": "Ваше имя",
    "Ism, telefon va parolni kiriting.": "Введите имя, телефон и пароль.",
    "Akkountingiz bormi?": "Уже есть аккаунт?",
    "Kamida 6 belgi": "Минимум 6 символов",
    "Eng faol o'quvchilar": "Самые активные ученики",
    "Tugatilgan darslar va o'tacha test natijasi bo'yicha.": "По пройденным урокам и среднему результату тестов.",
    "O'quvchi": "Ученик",
    "Tugatgan darslari": "Пройденные уроки",
    "O'rtacha natija": "Средний результат",
    "Hozircha natijalar yo'q.": "Пока результатов нет.",
    "1-savol": "Вопрос 1",
    "Oldingi": "Назад",
    "Keyingi": "Далее",
    "Yakunlash": "Завершить",
    "Saytga o'tish": "Перейти на сайт",
    "Test yakunlandi": "Тест завершён",
    "Yaxshi natija!": "Хороший результат!",
    "Yana urinib ko'ring": "Попробуйте ещё раз",
    "Testlarga qaytish": "К тестам",
    "Shriftni kichraytirish": "Уменьшить шрифт",
    "Shriftni kattalashtirish": "Увеличить шрифт",
    "Test savollari hali qo'shilmagan": "Вопросы теста ещё не добавлены",
    "Administrator tez orada savollarni qo'shadi.": "Администратор скоро добавит вопросы.",
    "Darsni tugatdim": "Урок завершён",
    "Testni yakunlash": "Завершить тест",
    "Kursga qaytish": "К курсу",
    "Tugatilgan": "Завершено",
    "Ochish": "Открыть",
    Matn: "Текст",
    Video: "Видео",
    Test: "Тест",
    "dars": "уроков",
    "Yakunlandi": "Завершено",
    "Natija": "Результат",
    "Sertifikatlar": "Сертификаты",
    "Til": "Язык",
    "Kunduzgi va tungi rejim": "Дневной и ночной режим",
    "Duel xonasi": "Комната дуэли",
    "1 vs 1": "1 на 1",
    "Raqib kutilmoqda": "Ожидание соперника",
    "Hali o'ynamadi": "Ещё не играл",
    "Kodni do'stingizga yuboring": "Отправьте код другу",
    "Taklif kodi": "Код приглашения",
    "Nusxalash": "Копировать",
    "Do'stga yuborish": "Отправить другу",
    "Duelni bekor qilish": "Отменить дуэль",
    "G'alaba!": "Победа!",
    "Mag'lubiyat": "Поражение",
    "Durang!": "Ничья!",
    "G'olib:": "Победитель:",
    "Yangi duel": "Новая дуэль",
    "Testlarga o'tish": "К тестам",
    "Raqib natijasi kutilmoqda": "Ожидание результата соперника",
    "Tayyormisiz?": "Готовы?",
    "Duelni boshlash a ": "Start duel a\u001d",
    "Faol duellar": "Активные дуэли",
    "Duel tarixi": "История дуэлей",
    "Kod": "Код",
    "Holat": "Статус",
    "Kutilmoqda": "Ожидание",
    "Jonli": "В эфире",
    "Yakunlangan": "Завершено",
    "Xonaga kirish   ": "Войти в комнату",
    "Bepul testlardan birini tanlang.": "Выберите один из бесплатных тестов.",
    "Do'stingiz bergan 6 xonali kodni kiriting.": "Введите 6-значный код от друга.",
    "Qo'shilish": "Присоединиться",
    "Duel yaratish a ": "Create duel a\u001d",
    "Duel   kim kuchli?": "Дуэль — кто сильнее?",
    "Do'stingiz /duel sahifasida shu kodni kiritib qo'shiladi.": "Друг вводит этот код на /duel и присоединяется.",
    "Ikkalangiz teng natija ko'rsatdingiz.": "У вас обоих одинаковый результат.",
    "Kunlik pley-off": "Ежедневный плей-офф",
    "Kunlik duel": "Ежедневная дуэль",
    "Kunlik duel   finalga qadar sxema": "Ежедневная дуэль — сетка до финала",
    "Sxemani ko'rish   ": "Посмотреть сетку",
    "Turnirga qo'shilish a ": "Join the tournament a\u001d",
    "Turnirni boshqarish": "Управление турниром",
    "Turnirni boshlash": "Начать турнир",
    "Siz ro'yxatdasiz": "Вы зарегистрированы",
    "Kunlik duel g'olibi": "Победитель ежедневной дуэли",
    "Aniqlanmadi": "Не определено",
    "Hozircha ishtirokchilar yo'q.": "Пока нет участников.",
    "O'ynash": "Играть",
    "Turnirni boshlash uchun kamida 2 ishtirokchi kerak.": "Для старта нужно минимум 2 участника.",
    "Bugun": "Сегодня",
    "Attestatsiya jarayoni": "Процесс аттестации",
    "Amaliy tayyorlov": "Практическая подготовка",
    "Amaliyotchi o'qituvchi": "Практикующий учитель",
    "Har bir dars   hayotdagi haqiqiy vaziyatlar uchun.": "Каждый урок — для реальных жизненных ситуаций.",
    MATN: "ТЕКСТ",
    SAVOL: "ВОПРОС",
    "Tugatish": "Завершить",
    "Bekor qilish": "Отмена",
    "Ha": "Да",
    "Javob berilgan": "Отвечено",
    "Hozirgi savol": "Текущий вопрос",
    "Testni tugatishni tasdiqlaysizmi?": "Завершить тест?",
    "ta savol javobsiz.": "вопросов без ответа.",
    "Barcha savollarga javob berilgan.": "Все вопросы отвечены.",
  },
  en: {
  "Ilm izlash uchun yo'lga chiqqan kishiga Alloh jannat yo'lini oson qiladi.": "Allah makes the path to Paradise easier for the one who sets out to seek knowledge.",
  "Sizlarning yaxshilaringiz Qur'onni o'rganib, uni o'rgatganlaringizdir.": "The best among you are those who learn the Qur'an and teach it.",
  "Amallar niyatlarga bog'liq.": "Actions are judged by intentions.",
  "Yaxshi gap aytsin yoki sukut saqlasin.": "Let them speak good or remain silent.",
  "Ikki ne'mat: sog'lik va bo'sh vaqt.": "Two blessings people often take for granted are health and free time.",
  "Ilm — insonni yuksaltiradigan nur.": "Knowledge is a light that elevates a person.",
  "Ustoz bergan saboq — umrga yo'ldosh.": "A teacher's lesson stays with you throughout life.",
  "Mehnat qilgan — murodga yetar.": "Hard work leads to the goal.",
  "Bugungi kichik qadam ertangi katta natijadir.": "A small step today becomes a big result tomorrow.",
  "Vaqtni qadrlagan maqsadiga yaqinlashadi.": "Those who value time move closer to their goals.",
  "Reja — niyatni amalga eltuvchi yo'l xaritasi.": "A plan is a roadmap from intention to action.",
  "Takrorlash — bilimning mustahkam tayanchi.": "Practice is a strong foundation for knowledge.",
  "Til bilgan — el biladi.": "A person who knows a language understands its people.",
  "Shirin so'z ko'ngilni obod qiladi.": "Kind words brighten the heart.",
  "Tinglash ham muloqotning muhim qismidir.": "Listening is an important part of communication.",
  "Savol berishdan uyalmang: bilmaganini so'rash ilm eshigidir.": "Do not be afraid to ask: questions open the door to learning.",
  "Har kuni oz-ozdan o'rganish katta maqsadga olib keladi.": "Learning a little each day leads to big goals.",
  "Sabr va izchillik mahoratni shakllantiradi.": "Patience and consistency build mastery.",
  "Bilim ulashilsa, qadri ortadi.": "Knowledge becomes more valuable when shared.",
  "O'qish qalbga, mashq esa mahoratga yo'l ochadi.": "Learning opens the way to knowledge; practice opens the way to mastery.",
  "Maqsadni yozing, vaqtni belgilang, bugun boshlang.": "Write down your goal, set a time, and start today.",
  "Ustozga hurmat — ilmga hurmat.": "Respect for a teacher is respect for knowledge.",
  "Yaxshi muomala — tilning eng go'zal tarjimasi.": "Kindness is the finest translation of words.",
  "Bugun o'rganganingiz ertaga birovga yo'l ko'rsatadi.": "What you learn today may guide someone tomorrow.",
  "Haqiqiy tayyorgarlikni boshlang": "Start preparing",
  "Ingliz tili attestatsiyasiga ishonch bilan tayyorlaning": "Prepare confidently for English teacher attestation",
  "Ingliz tili o'qituvchilari uchun attestatsiya testlari, TKT modullari, metodika va amaliy tayyorlov — barchasi bir platformada.": "Attestation tests for English teachers, TKT modules, methodology, and practical preparation — all in one platform.",
  "Yo'nalishni tanlang": "Choose a direction",
  "Username (@qobuljon) yoki raqamli ID. Kod bot orqali kelishi uchun avval botga": "Username (@qobuljon) or numeric ID. To get a code from the bot, first send it",
  "@username yoki 1097025987": "@username or 1097025987",
  "Parol aynan 4 ta lotin harfi yoki raqamdan iborat bo'lishi kerak.": "Password must be exactly 4 Latin letters or digits.",
  "Xush kelibsiz": "Welcome",
  "Salom,": "Hello,",
  "O'rganishni davom eting va maqsadingizga erishing!": "Keep learning and reach your goals!",
  "kunlik streak": "day streak",
  "Ilovani o'rnatish": "Install app",
  "Kurs jarayoni": "Course progress",
  "Yaxshi boshladingiz, davom eting 🚀": "A great start, keep going 🚀",
  "Birinchi video darsni boshlang 🚀": "Start your first video lesson 🚀",
  "Guruhda o'rningiz": "Your group rank",
  "Yutuqlar": "Achievements",
  "Video darslar": "Video lessons",
  "Darslarni qidirish...": "Search lessons...",
  "Katak ko'rinishi": "Grid view",
  "Ro'yxat ko'rinishi": "List view",
  "Guruh reytingi": "Group leaderboard",
  "Faol o'quvchilarning natijalari": "Active learners' results",
  "Haftalik": "Weekly",
  "Bu hafta hali hech kim dars tugatmadi. Birinchi bo'ling!": "No lessons completed this week yet. Be the first!",
  "Har kuni ozgina o'sish ham katta natijaga olib keladi.": "A little progress each day leads to big results.",
  "Barcha darslar tugatilgan!": "All lessons completed!",
  "Tabriklaymiz, siz barcha materiallarni o'zlashtirdingiz.": "Congratulations, you have completed all the material.",
  "Attestatsiya testlari": "Attestation tests",
  "TKT testlari": "TKT tests",
  "Parol kamida 6 belgidan iborat bo'lishi kerak.": "Password must contain at least 6 characters.",
  "Ism faqat harflardan iborat bo'lishi kerak.": "Name must contain letters only.",
  "Telefon raqami faqat 9 ta raqamdan iborat bo'lishi kerak.": "Phone number must contain exactly 9 digits.",
  "Telegram username (@username) yoki raqamli ID kiriting.": "Enter a Telegram username (@username) or numeric ID.",
  "Bu telefon raqam allaqachon ro'yxatdan o'tgan.": "This phone number is already registered.",
  "Bu Telegram ID allaqachon ro'yxatdan o'tgan. Bir ID   bitta akkaunt.": "This Telegram ID is already registered. One ID per account.",
  "Bu Telegram username allaqachon ro'yxatdan o'tgan.": "This Telegram username is already registered.",
  "Ism, telefon va parolni kiriting.": "Enter your name, phone number, and password.",
  "Kamida 6 belgi": "At least 6 characters",
  "Bosh sahifa": "Home",
  Attestatsiya: "Attestation",
  TKT: "TKT",
  Duel: "Duel",
  Kurslar: "Courses",
  Tariflar: "Plans",
  Reyting: "Rating",
  Kirish: "Log in",
  Chiqish: "Log out",
  Platforma: "Platform",
  Admin: "Admin",
  "O'quvchilar": "Students",
  "Saytni ko'rish": "View site",
  "Biz haqimizda": "About us",
  "Onlayn o'quv platformasi": "Online learning platform",
  "Ingliz tili o'qituvchilari uchun atestatsiyaga tayyorlov: testlar, metodika, demo dars va portfolio.":
  "Exam preparation for English teachers: tests, methodology, demo lessons and portfolio.",
  "Hoziroq boshlash": "Start now",
  "Platformadan foydalanish": "Use the platform",
  ATESTATSIYA: "ATTESTATION",
  "Mock testlar. Metodika. Demo dars": "Mock tests. Methodology. Demo lesson",
  "Yo'nalishni tanlang": "Choose a direction",
  "Attestatsiya yoki TKT   o'zingizga kerakli yo'nalishdan boshlang.":
  "Attestation or TKT   start with the direction you need.",
  "Ingliz tili fani o'qituvchilari uchun testlar, metodika va demo dars.":
  "Tests, methodology and demo lessons for English teachers.",
  "Ochish   ": "Open   ",
  "Teaching Knowledge Test formatidagi metodika va sinf boshqaruvi testlari.":
  "Methodology and classroom management tests in the Teaching Knowledge Test format.",
  "Barcha kurslar": "All courses",
  "Atestatsiyaga tayyorlov, metodika, demo dars va testlar   barchasi bir joyda.":
  "Exam preparation, methodology, demo lessons and tests   all in one place.",
  "O'qituvchilar uchun amaliy tayyorlov": "Practical preparation for teachers",
  "Habiba teacher   ingliz tili fani o'qituvchilarini atestatsiyaga tayyorlaydigan onlayn platforma. Testlar, metodika, demo dars va portfolio bo'yicha tizimli materiallar.":
  "Habiba teacher is an online platform preparing English teachers for attestation, with tests, methodology, demo lessons and portfolio materials.",
  "Haqiqiy formatdagi mock testlar": "Mock tests in the real format",
  "PDF darslik va qo'llanmalar": "PDF textbooks and guides",
  "Video tushuntirishlar": "Video explanations",
  "Progress va natijalar nazorati": "Progress and result tracking",
  "Bilim   amaliyotda kuch.": "Knowledge is power in practice.",
  "Har bir dars sinfdagi haqiqiy vaziyatlarga moslashtirilgan.":
  "Every lesson is adapted to real classroom situations.",
  "O'quvchilar": "Students",
  Darslar: "Lessons",
  "Tugatilgan darslar": "Completed lessons",
  "Nega biz": "Why us",
  "Natijaga olib boradigan tayyorlov": "Preparation that leads to results",
  "PDF materiallar": "PDF materials",
  "Darslik va qo'llanmalarni platformadan ochish yoki yuklab olish.":
  "Open or download textbooks and guides on the platform.",
  "Video darslar": "Video lessons",
  "Trener tushuntirishlari va amaliy namunalar.": "Trainer explanations and practical examples.",
  "Mock testlar": "Mock tests",
  "Haqiqiy formatdagi testlar, natija va tahlil.": "Real-format tests, results and analysis.",
  "Atestatsiyaga bugun tayyorlanishni boshlang": "Start preparing for attestation today",
  "Ro'yxatdan o'ting yoki Telegram orqali bog'laning.": "Register or contact us on Telegram.",
  "Ro'yxatdan o'tish": "Sign up",
  "Ingliz tili o'qituvchilari uchun atestatsiyaga tayyorlov platformasi.":
  "An attestation preparation platform for English teachers.",
  "Barcha huquqlar himoyalangan.": "All rights reserved.",
  "  Barcha yo'nalishlar": "  All directions",
  "O'qituvchilar uchun toifa attestatsiyasiga tayyorgarlik   sinov testlari, natijalar va javoblar.":
  "Preparation for qualification attestation: practice tests, results and answers.",
  "O'qituvchlar uchun mock testlar": "Mock tests for teachers",
  "Attestatsiya testlari": "Attestation tests",
  "TKT testlari": "TKT tests",
  "Toifa testlari": "Category tests",
  "Ajratilgan vaqt:": "Time:",
  "Savollar soni:": "Questions:",
  "Eng yuqori ball:": "Max score:",
  Bepul: "Free",
  Ochilgan: "Unlocked",
  "Bu testlarni birma-bir sotib olish shart emas": "You don't have to buy these tests one by one",
  "Bitta tarif bilan barcha pullik testlarni oching   ancha tejamkor.":
  "One plan unlocks all paid tests   much more economical.",
  "Tarifni ko'rish   ": "View plans   ",
  Narx: "Price",
  "Test haqida": "About the test",
  Materiallar: "Materials",
  "Materiallar test ochilgach ko'rinadi.": "Materials will be available after unlocking the test.",
  "Natijalar taqsimoti": "Score distribution",
  "Har bir ishtirokchining eng yaxshi natijasi asosida": "Based on each participant's best result",
  "70% va yuqori": "70% and above",
  "Jami qatnashganlar:": "Total participants:",
  "Testga kirish uchun tizimga kiring": "Log in to open the test",
  "Testni boshlash": "Start test",
  "Qayta topshirish": "Retake",
  "Sizning natijangiz:": "Your result:",
  "Tayyor bo'lsangiz, testni boshlang.": "When ready, start the test.",
  "Test pullik. To'lovdan so'ng admin uni hisobingizga ochadi.":
  "This test is paid. After payment the admin will unlock it for your account.",
  "Telegram orqali sotib olish": "Buy via Telegram",
  "Bu testni tarif bilan oching": "Unlock this test with a plan",
  "Bitta tarif   barcha pullik testlar uchun.": "One plan   for all paid tests.",
  "Savollar uchun:": "Questions:",
  "Eng yaxshi 10 ishtirokchi": "Top 10 participants",
  "Hozircha natijalar yo'q. Birinchi bo'lib topshiring.": "No results yet. Be the first to take it.",
  "Tavsif va materiallarni tahrirlash   ": "Edit description and materials   ",
  Boshqarish: "Manage",
  "Yangi test qo'shish": "Add a new test",
  Katalog: "Catalog",
  "Atestatsiyaga tayyorlov kurslari. Kursni ochish uchun tizimga kiring.":
  "Attestation preparation courses. Log in to open a course.",
  "Bitta to'lov bilan barcha kurs va materiallarga kirish.": "One payment for access to all courses and materials.",
  "Tavsiya etiladi": "Recommended",
  "To'liq kirish": "Full access",
  "Barcha kurslar, PDF materiallar, testlar va yangilanishlar.": "All courses, PDF materials, tests and updates.",
  "/ 3 oy": "/ 3 months",
  "Barcha kurslarga kirish": "Access to all courses",
  "Mock testlar va natijalar": "Mock tests and results",
  "Yangi materiallar bepul": "New materials free",
  "Sotib olish": "Buy",
  "Telefon va parolingizni kiriting.": "Enter your phone and password.",
  Telefon: "Phone",
  Parol: "Password",
  "Akkountingiz yo'qmi?": "No account?",
  "Ismingiz": "Your name",
  "Ism, telefon va parolni kiriting.": "Enter your name, phone and password.",
  "Akkountingiz bormi?": "Already have an account?",
  "Kamida 6 belgi": "At least 6 characters",
  "Eng faol o'quvchilar": "Most active students",
  "Tugatilgan darslar va o'tacha test natijasi bo'yicha.": "By completed lessons and average test score.",
  "O'quvchi": "Student",
  "Tugatgan darslari": "Completed lessons",
  "O'rtacha natija": "Average score",
  "Hozircha natijalar yo'q.": "No results yet.",
  "1-savol": "Question 1",
  "Oldingi": "Previous",
  "Keyingi": "Next",
  "Yakunlash": "Finish",
  "Saytga o'tish": "Go to site",
  "Test yakunlandi": "Test completed",
  "Yaxshi natija!": "Good result!",
  "Yana urinib ko'ring": "Try again",
  "Testlarga qaytish": "Back to tests",
  "Shriftni kichraytirish": "Decrease font size",
  "Shriftni kattalashtirish": "Increase font size",
  "Test savollari hali qo'shilmagan": "Test questions have not been added yet",
  "Administrator tez orada savollarni qo'shadi.": "The administrator will add questions soon.",
  "Darsni tugatdim": "Lesson completed",
  "Testni yakunlash": "Finish test",
  "Kursga qaytish": "Back to course",
  "Tugatilgan": "Completed",
  "Ochish": "Open",
  Matn: "Text",
  Video: "Video",
  Test: "Test",
  "dars": "lessons",
  "Yakunlandi": "Completed",
  "Natija": "Result",
  "Sertifikatlar": "Certificates",
  "Til": "Language",
  "Kunduzgi va tungi rejim": "Day and night mode",
  "Duel xonasi": "Duel room",
  "1 vs 1": "1 vs 1",
  "Raqib kutilmoqda": "Waiting for opponent",
  "Hali o'ynamadi": "Hasn't played yet",
  "Kodni do'stingizga yuboring": "Send the code to your friend",
  "Taklif kodi": "Invite code",
  "Nusxalash": "Copy",
  "Do'stga yuborish": "Send to friend",
  "Duelni bekor qilish": "Cancel duel",
  "G'alaba!": "Victory!",
  "Mag'lubiyat": "Defeat",
  "Durang!": "Draw!",
  "G'olib:": "Winner:",
  "Yangi duel": "New duel",
  "Testlarga o'tish": "Back to tests",
  "Raqib natijasi kutilmoqda": "Waiting for the opponent's result",
  "Tayyormisiz?": "Ready?",
  "Duelni boshlash a ": "Start duel a ",
  "Faol duellar": "Active duels",
  "Duel tarixi": "Duel history",
  "Kod": "Code",
  "Holat": "Status",
  "Kutilmoqda": "Waiting",
  "Jonli": "Live",
  "Yakunlangan": "Finished",
  "Xonaga kirish   ": "Enter room   ",
  "Bepul testlardan birini tanlang.": "Choose one of the free tests.",
  "Do'stingiz bergan 6 xonali kodni kiriting.": "Enter the 6-character code from your friend.",
  "Qo'shilish": "Join",
  "Duel yaratish a ": "Create duel a ",
  "Duel   kim kuchli?": "Duel   who is stronger?",
  "Do'stingiz bilan bir testda kuch sinashing. Kod yarating, do'stingiz qo'shilsin va eng ko'p to'g'ri javob bergan yutsin.":
  "Challenge a friend in one test. Create a code, let them join, and the one with more correct answers wins.",
  "Test tanlang, kod yarating va do'stingizni chaqiring. Eng ko'p to'g'ri javob bergan   g'olib.":
  "Choose a test, create a code and invite a friend. More correct answers wins.",
  "Do'stingiz /duel sahifasida shu kodni kiritib qo'shiladi.": "Your friend enters this code on /duel to join.",
  "Ikkalangiz teng natija ko'rsatdingiz.": "You both achieved the same result.",
  "Kunlik pley-off": "Daily playoff",
  "Kunlik duel": "Daily duel",
  "Kunlik duel   finalga qadar sxema": "Daily duel   bracket to the final",
  "Sxemani ko'rish   ": "View bracket   ",
  "Turnirga qo'shilish a ": "Join the tournament a ",
  "Turnirni boshqarish": "Manage tournament",
  "Turnirni boshlash": "Start tournament",
  "Siz ro'yxatdasiz": "You are registered",
  "Do'stlaringizni taklif qiling   turnir 2 ishtirokchidan boshlanadi.":
  "Invite your friends   the tournament starts with 2 participants.",
  "Kunlik duel g'olibi": "Daily duel champion",
  "Aniqlanmadi": "Not determined",
  "Hozircha ishtirokchilar yo'q.": "No participants yet.",
  "Sxema ishtirokchilar qo'shilgach to'ladi. Boshlash uchun kamida 2 ishtirokchi kerak.":
  "The bracket fills up as participants join. At least 2 participants are needed to start.",
  "Har bir match 15 ta aralash savol. Har savolga 60 soniya. ko'proq to'g'ri javob, teng bo'lsa tezroq o'yinchi yutadi.":
  "Each match has 15 mixed questions. 60 seconds per question. More correct answers wins; if tied, the faster player wins.",
  "O'ynash": "Play",
  "Turnirni boshlash uchun kamida 2 ishtirokchi kerak.": "At least 2 participants are needed to start.",
  "Bugun": "Today",
  "Attestatsiya jarayoni": "Attestation process",
  "Amaliy tayyorlov": "Practical preparation",
  "Amaliyotchi o'qituvchi": "Practicing teacher",
  "Har bir dars   hayotdagi haqiqiy vaziyatlar uchun.": "Every lesson   for real-life situations.",
  MATN: "TEXT",
  SAVOL: "QUESTION",
  "Tugatish": "Finish",
  "Bekor qilish": "Cancel",
  "Ha": "Yes",
  "Javob berilgan": "Answered",
  "Hozirgi savol": "Current question",
  "Testni tugatishni tasdiqlaysizmi?": "Finish the test?",
  "ta savol javobsiz.": "questions unanswered.",
  "Barcha savollarga javob berilgan.": "All questions answered."
  }
};

const NORM_CACHE = new WeakMap();
function normKey(value) {
  return String(value || "")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/[\u2014\u2013]/g, " ")
    .replace(/\s+-\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function translateCore(text, lang) {
  const dict = I18N[lang];
  if (!dict) return text;
  const source = text.trim();
  if (!source) return text;
  const put = (value) => text.replace(source, value);
  const decoded = source
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  if (dict[source] !== undefined) return put(dict[source]);
  if (dict[decoded] !== undefined) return put(dict[decoded]);

  let cache = NORM_CACHE.get(dict);
  if (!cache) {
    cache = new Map();
    for (const [key, value] of Object.entries(dict)) cache.set(normKey(key), value);
    NORM_CACHE.set(dict, cache);
  }
  const normalized = normKey(decoded);
  if (cache.has(normalized)) return put(cache.get(normalized));

  let m;
  if ((m = decoded.match(/^Salom,\s*(.+?)(!\s*👋)$/))) {
    return put(`${lang === "ru" ? "Здравствуйте," : "Hello,"} ${m[1]}${m[2]}`);
  }
  if ((m = decoded.match(/^Salom,\s*(.+?)(!?)$/))) {
    return put(`${lang === "ru" ? "Здравствуйте," : "Hello,"} ${m[1]}${m[2]}`);
  }
  if ((m = decoded.match(/^(\d+)\s*ta\s+video$/))) {
    return put(lang === "ru" ? `${m[1]} видеоуроков` : `${m[1]} video lessons`);
  }
  if ((m = decoded.match(/^Sahifa\s+(\d+)\s*\/\s*(\d+)\s*\|\s*(\d+)\s*ta\s+dars$/))) {
    return put(lang === "ru" ? `Страница ${m[1]} / ${m[2]} | уроки ${m[3]}` : `Page ${m[1]} / ${m[2]} | ${m[3]} lessons`);
  }
  if ((m = decoded.match(/^(\d+)\s*\/\s*(\d+)\s*dars$/))) {
    return put(lang === "ru" ? `${m[1]} / ${m[2]} уроков` : `${m[1]} / ${m[2]} lessons`);
  }
  if ((m = decoded.match(/^(\d+)\s+kunlik streak$/))) {
    return put(lang === "ru" ? `${m[1]} дней подряд` : `${m[1]} day streak`);
  }
  if ((m = decoded.match(/^(\d+)\s+dars\s*·\s*(\d+)\s+kun 🔥$/))) {
    return put(lang === "ru" ? `${m[1]} уроков · ${m[2]} дней 🔥` : `${m[1]} lessons · ${m[2]} days 🔥`);
  }
  if ((m = decoded.match(/^#?(\d+)\s*\/\s*(\d+)$/))) {
    return put(`${m[1]} / ${m[2]}`);
  }
  if ((m = source.match(/^Jami qatnashganlar:\s*(\d+)\s*ta$/))) {
    return put(lang === "ru" ? `Всего участников: ${m[1]}` : `Total participants: ${m[1]}`);
  }
  if ((m = source.match(/^Sizning natijangiz:\s*(\d+)%$/))) {
    return put(lang === "ru" ? `Ваш результат: ${m[1]}%` : `Your result: ${m[1]}%`);
  }
  if ((m = source.match(/^(\d+)\s*\/\s*(\d+)\s*savol$/))) {
    return put(`${m[1]} / ${m[2]} ${lang === "ru" ? "вопросов" : "questions"}`);
  }
  if ((m = source.match(/^(\d+)-savol$/))) {
    return put(lang === "ru" ? `Вопрос ${m[1]}` : `Question ${m[1]}`);
  }
  if ((m = source.match(/^(\d+)\s*soat(?:\s*(\d+)\s*daqiqa)?$/))) {
    const h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    if (lang === "ru") return put(`${h} ч${min ? ` ${min} мин` : ""}`);
    return put(`${h} ${h === 1 ? "hour" : "hours"}${min ? ` ${min} min` : ""}`);
  }
  if ((m = source.match(/^(\d+)\s*daqiqa$/))) {
    return put(lang === "ru" ? `${m[1]} мин` : `${m[1]} min`);
  }
  if ((m = source.match(/^([\d\s]+)\s*so'm$/))) {
    return put(lang === "ru" ? `${m[1].trim()} сум` : `${m[1].trim()} UZS`);
  }
  if ((m = source.match(/^(\d+)\s*ballik$/)) || (m = source.match(/^(\d+)\s*ball$/))) {
    return put(lang === "ru" ? `${m[1]} баллов` : `${m[1]} points`);
  }
  if ((m = source.match(/^(\d+)\s*dars$/))) {
    return put(lang === "ru" ? `${m[1]} уроков` : `${m[1]} lessons`);
  }
  if ((m = source.match(/^(\d+)\s*Ko'rishlar$/))) {
    return put(lang === "ru" ? `${m[1]} просмотров` : `${m[1]} views`);
  }
  if ((m = source.match(/^(\d+)\s*\/\s*(\d+)\s*to'g'ri javob$/))) {
    return put(
      lang === "ru"
        ? `${m[1]} / ${m[2]} правильных ответов`
        : `${m[1]} / ${m[2]} correct answers`
    );
  }
  if ((m = source.match(/^(\d+)\s*ta$/))) {
    return put(lang === "ru" ? `${m[1]} шт.` : `${m[1]} questions`);
  }
  if ((m = source.match(/^(\d+)\s*ta\s+test$/))) {
    return put(lang === "ru" ? `${m[1]} тестов` : `${m[1]} tests`);
  }
  if ((m = source.match(/^(.+)\s+guruhiga$/))) {
    return put(lang === "ru" ? `в группу ${m[1]}` : `to ${m[1]} group`);
  }
  if ((m = source.match(/^Bugun\s+(\d+)\/8\s+ishtirokchi\.$/))) {
    return put(lang === "ru" ? `Сегодня ${m[1]}/8 участников.` : `Today ${m[1]}/8 participants.`);
  }
  if ((m = source.match(/^Kunlik pley-off\s*.\s+(.+)$/))) {
    return put(lang === "ru" ? `Ежедневный плей-офф. ${m[1]}` : `Daily playoff. ${m[1]}`);
  }
  if ((m = source.match(/^Siz shu yerdasiz$/))) {
    return put(lang === "ru" ? "Вы здесь" : "You are here");
  }
  return text;
}

export function translateHtml(html, lang) {
  if (lang === "uz" || !I18N[lang]) return html;
  let out = html.replace('<html lang="uz">', `<html lang="${lang}">`);
  out = out.replace(/<title>([\s\S]*?)<\/title>/, (match, inner) => {
    const parts = inner.split(/[\u0000-\u001f\u2014\u2013]+|\s{2,}/).map((part) => translateCore(part, lang).trim()).filter(Boolean);
    return `<title>${parts.join(" - ")}</title>`;
  });
  out = out.replace(
  /(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>)|>([^<]*)</g,
  (match, skip, text) => (skip ? match: `>${translateCore(text, lang)}<`)
  );
  out = out.replace(/\b(placeholder|aria-label|title)="([^"]*)"/g, (match, attr, value) => {
  const decoded = value
.replace(/&amp;/g, "&")
.replace(/&#39;/g, "'")
.replace(/&quot;/g, '"')
.replace(/&lt;/g, "<")
.replace(/&gt;/g, ">");
  const translated = translateCore(decoded, lang).trim();
  if (translated === decoded.trim()) return match;
  const encoded = translated
.replace(/&/g, "&amp;")
.replace(/"/g, "&quot;")
.replace(/</g, "&lt;")
.replace(/>/g, "&gt;");
  return `${attr}="${encoded}"`;
  });
  return out;
}

export { LANG_CODES };
