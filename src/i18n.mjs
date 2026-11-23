const LANG_CODES = ["uz", "en"];
const I18N = {
  en: {
  "01 / MAQSADGA QADAM": "01 / A STEP TOWARD YOUR GOAL",
  "02 / O'QUV DASTURI": "02 / LEARNING PROGRAM",
  "03 / O'ZINGIZGA MOS TARIF": "03 / A PLAN THAT FITS YOU",
  "04 / YORDAM": "04 / HELP",
  AMALIYOT: "PRACTICE",
  ATTESTATSIYA: "ATTESTATION",
  "Ustozlarimizga ko‘mak bo‘lsin deya, ushbu materiallar Habiba Mo'minjonovna tomonidan taqdim etildi.": "These materials are offered by Habiba Mo'minjonovna to support our teachers.",
  "Amaliy mashq": "Practical exercise",
  "Attestatsiya va TKT uchun testlar, video darslar hamda metodik materiallar. O'z maqsadingizga mos yo'nalishni tanlab, o'z sur'atingizda o'rganing.": "Attestation and TKT tests, video lessons, and teaching resources. Choose a learning path that fits your goals and study at your own pace.",
  "Attestatsiya yoki TKT — o'zingizga kerakli yo'nalishdan boshlang.": "Attestation or TKT — start with the path you need.",
  "Attestatsiya, TKT va o'qituvchilar uchun amaliy o'quv materiallari.": "Attestation, TKT, and practical learning resources for teachers.",
  "Attestatsiyaga tayyorlov, metodika, demo dars va testlar — barchasi bir joyda.": "Attestation preparation, teaching methods, demo lessons, and tests — all in one place.",
  "Avtor: Habiba Mo'minjonovna. Barcha huquqlar himoyalangan.": "Created by Habiba Mo'minjonovna. All rights reserved.",
  "Avval oldingi test": "Complete the previous test first",
  "Barcha kurslarni ko'rish": "View all courses",
  "Barcha tariflar": "All plans",
  "Barcha testlar yakunlandi!": "All tests are complete!",
  "Bepul ro'yxatdan o'tish": "Register for free",
  "Bilim — amaliyotda kuch.": "Knowledge becomes power through practice.",
  "Bilimingizni": "Your knowledge",
  "Bilimni darsda qo'llash": "Apply knowledge in class",
  "Bilimni yangilang": "Refresh your knowledge",
  "Bir maqsad sari": "Toward one goal",
  "Birinchi testni boshlang 🚀": "Start your first test 🚀",
  "Bosh sahifa yuqori qismi": "Top of the home page",
  Boshlash: "Start",
  "Boshlashdan oldin": "Before you begin",
  "Brauzer menyusidan 'Ilovani o'rnatish' yoki 'Bosh ekranga qo'shish'ni tanlang.": "In your browser menu, choose Install app or Add to Home screen.",
  "Bu hafta hali hech kim test yakunlamadi. Birinchi bo'ling!": "No one has completed a test this week yet. Be the first!",
  "Bugungi kun hikmati": "Today's thought",
  "CPD testlari": "CPD tests",
  DARS: "LESSON",
  "Darslarni telefondan ko'rsam bo'ladimi?": "Can I watch lessons on my phone?",
  "HABIBA TEACHER · TA'LIM PLATFORMASI": "HABIBA TEACHER · LEARNING PLATFORM",
  "Ha. Sayt telefon, planshet va kompyuter ekranlariga moslashadi.": "Yes. The site adapts to phones, tablets, and computers.",
  "Habiba teacher — ingliz tili fani o'qituvchilarini attestatsiyaga tayyorlaydigan onlayn platforma. Testlar, metodika, demo dars va portfolio bo'yicha tizimli materiallar.": "Habiba Teacher is an online platform that helps English teachers prepare for attestation, with structured tests, teaching methods, demo lessons, and portfolio resources.",
  "Har bir mavzu bilimni mustahkamlash, sinab ko'rish va dars jarayonida qo'llashga yordam beradi.": "Each topic helps you strengthen your knowledge, check your understanding, and apply it in class.",
  "Har bir modul bo'yicha alohida tayyorgarlik": "Focused preparation for every module",
  "Hozircha testlar yo'q.": "There are no tests yet.",
  "Ilova qurilmangizga o'rnatilgan.": "The app is installed on your device.",
  "Imtihonga tayyor bo'ling.": "Get ready for your exam.",
  "Ingliz tili o'qituvchilari uchun imtihonlarga tayyorlov platformasi.": "An exam preparation platform for English teachers.",
  "Istalgan qurilmada": "On any device",
  "KEYINGI QADAM — SIZDAN": "THE NEXT STEP IS YOURS",
  Kabinet: "Dashboard",
  "Kabinetda tugatilgan darslar va test natijalaringizni ko'rishingiz mumkin.": "Your completed lessons and test results are available in your dashboard.",
  "Kasbiy maqsadingizga": "Toward your professional goals",
  "Keyingi test": "Next test",
  "Kirishni ochish": "Unlock access",
  "Kurslarni ko'rish": "View courses",
  "Metodik materiallar va video tushuntirishlardan foydalanib, o'rganganlaringizni amaliy vaziyatlar bilan bog'lang.": "Use teaching resources and video explanations to connect what you learn with practical situations.",
  Metodika: "Teaching methods",
  "Mutaxassislik, kasbiy standartlar va pedagogik mahorat bo'yicha mavzularni o'rganing va testlarda mashq qiling.": "Study subject knowledge, professional standards, and teaching skills, then practise with tests.",
  NATIJA: "RESULT",
  "Natija va progress nazorati": "Results and progress tracking",
  "Natijani kuzating": "Track your progress",
  "O'QITUVCHILAR UCHUN ONLAYN TA'LIM": "ONLINE LEARNING FOR TEACHERS",
  "O'qish natijalarim saqlanadimi?": "Are my learning results saved?",
  "O'qishni": "Learning",
  "O'qishni boshlash": "Start learning",
  "O'qishni davom ettirish": "Continue learning",
  "O'quv dasturi": "Learning program",
  "O'quv yo'nalishi": "Learning path",
  "O'quvchilar va darslar hisoblagichi": "Learners and lessons counter",
  "O'rganing. Mashq qiling.": "Learn. Practise.",
  "O'sishni kuzating.": "Track your progress.",
  "O'zbek tilida": "In Uzbek",
  "O'zingizni sinang": "Test yourself",
  "Orbita va afzalliklar": "Learning path and benefits",
  "Platforma imkoniyatlari": "Platform features",
  "Platformada qaysi yo'nalishlar bor?": "Which learning paths are available?",
  "Platformadan foydalanish haqida qisqa javoblar.": "Quick answers about using the platform.",
  "Platformani yangilash": "Update the platform",
  Poydevordan: "From the foundations",
  "Qanday qilib kursga kiraman?": "How do I access a course?",
  "Reja, mashq va natija — bir joyda": "Plan, practise, and track results in one place",
  "Ro'yxatdan o'ting, kerakli yo'nalishni tanlang va tariflar sahifasidagi ko'rsatmalarga amal qiling.": "Register, choose a learning path, and follow the instructions on the plans page.",
  Sahifa: "Page",
  "Savol-javob": "Questions and answers",
  "Serverdagi so'nggi o'zgarishlarni yuklash": "Load the latest server updates",
  "Shaxsiy kabinetda progress va yakunlangan darslarni ko'ring.": "View your progress and completed lessons in your dashboard.",
  "Sinov testlari": "Practice tests",
  "Siz muvaffaqiyatli ro'yxatdan o'tdingiz.": "You registered successfully.",
  TEST: "TEST",
  "TKT modullarida til tizimi, dars rejalashtirish va o'quvchini qo'llab-quvvatlash mavzularini takrorlang.": "Review language systems, lesson planning, and learner support in the TKT modules.",
  "TKT: 3 ta modul": "TKT: 3 modules",
  "Tabriklaymiz, barcha testlarni yechib bo'ldingiz.": "Congratulations, you have completed all the tests.",
  "Tarif kerak": "Plan required",
  "Tarif talab qilinadi": "A plan is required",
  "Tarifni ko'rish": "View plans",
  "Tarifni tanlang, o'quv rejangizga mos tarzda foydalaning.": "Choose a plan that fits your learning schedule.",
  "Tayyorgarlikni kichik, tushunarli bosqichlarga ajrating. Har bir mavzu sizni bilimni amalda qo'llashga yaqinlashtiradi.": "Break your preparation into clear, manageable steps. Each topic helps you put your knowledge into practice.",
  "Telegram orqali bog'lanish": "Contact us on Telegram",
  "Test va mashqlar orqali tushunganingizni tekshirib boring.": "Check your understanding with tests and exercises.",
  Testlar: "Tests",
  "Testlar jarayoni": "Test progress",
  "Testlarni qidirish...": "Search tests...",
  "Toifa sinoviga tayyorlov": "Qualification exam preparation",
  Tugatildi: "Completed",
  "Ustozlar uchun amaliy tayyorlov": "Practical preparation for teachers",
  "Video dars va metodik qo'llanma bilan asosiy mavzularni takrorlang.": "Review key topics with video lessons and teaching guides.",
  "Video dars va metodik qo'llanma bilan asosiy mavzularni takrorlang. (video darslar hozircha yo'q)": "Review key topics with video lessons and teaching guides (video lessons coming soon).",
  "Video va o'quv darslari": "Video and learning lessons",
  "Yakuniy chaqiriq": "Take the next step",
  "Yangi darslar va sinovlar platformada muntazam yangilanadi": "New lessons and practice tests are added regularly.",
  Yangilash: "Refresh",
  "Yo'nalish kartalari": "Learning path cards",
  "Yo'nalishni tanlang va o'z rejangiz bo'yicha tayyorgarlikni boshlang.": "Choose a learning path and start preparing at your own pace.",
  "Teaching Knowledge Test": "Teaching Knowledge Test",
  "amaliyotgacha.": "through practice.",
  "bilishingiz kerak.": "you need to know.",
  "bugun boshlang.": "start today.",
  "bugun yaqinlashing.": "move closer today.",
  "mustahkamlang.": "strengthen it.",
  "ta dars": "lessons",
  "ta test": "tests",
  "ta yo'nalish": "learning paths",
  daqiqa: "minutes",
  daq: "min",
  kun: "days",
  test: "test",
  yakunlangan: "completed",
  "HABIBA - CHAMPION TEACHER BILAN USTOZLIK MAHORATINGIZNI OSHIRING": "GROW YOUR TEACHING SKILLS WITH HABIBA - CHAMPION TEACHER",
  "Ishonch bilan": "With confidence",
  "Attestatsiya va TKT uchun testlar, CPD, BSB va CHSB lar hamda metodik materiallar. O'z maqsadingizga mos yo'nalishni tanlab, o'z sur'atingizda o'rganing.": "Attestation and TKT tests, CPD, BSB and CHSB practice, and teaching resources. Choose a learning path that fits your goals and study at your own pace.",
  "Attestatsiya, TKT, CPD yoki BSB va CHSB — o'zingizga kerakli yo'nalishdan boshlang.": "Attestation, TKT, CPD, or BSB and CHSB — start with the learning path you need.",
  "Yo'nalishlar": "Learning paths",
  "Ingliz tili o'qituvchilari uchun toifa attestatsiyasiga tayyorgarlik.": "Qualification attestation preparation for English teachers.",
  "Teaching Knowledge Test modullari va metodika bo'yicha sinovlar.": "Teaching Knowledge Test modules and teaching-method practice.",
  "Teaching Knowledge Test (TKT) uchun tayyorgarlik: imtihon uslubidagi modul sinov testlari.": "Preparation for the Teaching Knowledge Test (TKT), with exam-style module practice tests.",
  "Uzluksiz kasbiy rivojlanish uchun test va materiallar.": "Tests and resources for continuing professional development.",
  "BSB va CHSB": "BSB & CHSB",
  "BSB va CHSB testlari": "BSB & CHSB tests",
  "BSB va CHSB bo'yicha sinovlar hamda tayyorlov materiallari.": "BSB & CHSB practice and preparation resources.",
  "Testlar tez orada qo'shiladi": "Tests will be added soon",
  "Bu yo'nalishda testlar tez orada qo'shiladi.": "Tests for this learning path will be added soon.",
  "4 ta yo'nalish": "4 learning paths",
  "Barcha darslar": "All lessons",
  "Attestatsiyaga tayyorlov, metodika, demo dars(video darslar hozircha yo'q) va testlar — barchasi bir joyda.": "Attestation preparation, teaching methods, demo lessons (video lessons coming soon), and tests — all in one place.",
  "Reading testlari": "Reading tests",
  "Grammar testlari": "Grammar tests",
  "Pedakogik mahorat testlari": "Teaching skills tests",
  "Kasbiy standart testlari": "Professional standards tests",
  "Barcha darslarni ko'rish": "View all lessons",
  "Habiba teacher — ingliz tili fani o'qituvchilarini attestatsiyaga tayyorlaydigan onlayn platforma. Testlar, metodika, demo dars(video darslar hozircha yo'q) va portfolio bo'yicha tizimli materiallar.": "Habiba Teacher is an online platform that helps English teachers prepare for attestation, with structured tests, teaching methods, demo lessons (video lessons coming soon), and portfolio resources.",
  "Video tushuntirishlar (video darslar hozircha yo'q)": "Video explanations (coming soon)",
  "Video darslar(video darslar hozircha yo'q)": "Video lessons (coming soon)",
  "Trener tushuntirishlari va amaliy namunalar (video darslar hozircha yo'q).": "Trainer explanations and practical examples (video lessons coming soon).",
  "Dars(video darslar hozircha yoq)": "Lessons (video lessons coming soon)",
  "Dars(video darslar hozircha yo'q)": "Lessons (video lessons coming soon)",
  "Video va o'quv darslari(video darslar hozircha yo'q)": "Video and learning lessons (video lessons coming soon)",
  "Darslarni ko'rish(video darslar hozircha yo'q)": "View lessons (video lessons coming soon)",
  "Barcha kurs va testlarga 1 oy kirish.": "One month of access to all courses and tests.",
  "Barcha kurs va testlarga 3 oy kirish.": "Three months of access to all courses and tests.",
  "Barcha kurs va testlarga 12 oy kirish.": "Twelve months of access to all courses and tests.",
  "O'zingizga mos muddatni tanlang.": "Choose the period that suits you.",
  "Video darslar va materiallar": "Video lessons and resources",
  "Testlar va natijalar": "Tests and results",
  "Kirish va sotib olish": "Access and purchase",
  "To'lovdan keyin adminga nimalar yuboriladi?": "What should I send the admin after payment?",
  "To'lov chekining skrinshoti": "A screenshot of the payment receipt",
  "Tranzaksiya ID yoki to'lov raqami": "Transaction ID or payment reference",
  "Ro'yxatdan o'tgan telefon raqamingiz": "The phone number used to register",
  "Tanlangan tarif nomi": "Selected plan name",
  "Karta PIN-kodi, SMS tasdiqlash kodi yoki CVV raqamini yubormang. Admin to'lovni tekshirib, tarifni faollashtiradi.": "Do not send your card PIN, SMS verification code, or CVV. The admin will verify your payment and activate your plan.",
  "Tugatilgan darslar va o'rtacha test natijasi bo'yicha.": "Ranked by completed lessons and average test score.",
  "Telefon raqamingizni kiriting": "Enter your phone number",
  "Telefon raqamingiz": "Your phone number",
  "foydalanish shartlariga": "terms of use",
  "Foydalanish shartlariga": "Terms of use",
  "Admin sifatida kirish?": "Sign in as an admin?",
  "Ma'lumotlaringizni kiriting va yangi parol yarating.": "Enter your details and create a password.",
  "Kamida 8 ta belgi: katta va kichik lotin harfi, raqam hamda maxsus belgi. Eng ko'pi 64 ta belgi.": "At least 8 characters: uppercase and lowercase Latin letters, a number, and a special character. Maximum 64 characters.",
  "Parolni qayta tasdiqlang": "Confirm your password",
  "Kurs tavsifi yo'q": "No course description",
  "Ingliz tili attestatsiya testlari": "English teacher attestation tests",
  "Kurs va testlar tariflari": "Course and test plans",
  "BSB va CHSB testlari - Habiba - Champion Teacher AELLCA": "BSB & CHSB tests - Habiba - Champion Teacher AELLCA",
  "Ingliz tili attestatsiya testlari va TKT": "English teacher attestation tests and TKT",
  "Ingliz tili o'qituvchilari uchun kurslar": "Courses for English teachers",
  "Ingliz tili attestatsiya testlari va TKT - Habiba - Champion Teacher AELLCA": "English teacher attestation tests and TKT - Habiba - Champion Teacher AELLCA",
  "Ingliz tili o'qituvchilari uchun kurslar - Habiba - Champion Teacher AELLCA": "Courses for English teachers - Habiba - Champion Teacher AELLCA",
  "Kurs va testlar tariflari - Habiba - Champion Teacher AELLCA": "Course and test plans - Habiba - Champion Teacher AELLCA",
  "2026 Habiba - Champion Teacher AELLCA. Avtor: Habiba Mo'minjonovna. Barcha huquqlar himoyalangan.": "2026 Habiba - Champion Teacher AELLCA. Created by Habiba Mo'minjonovna. All rights reserved.",
  "Habiba teacher ingliz tili o'qituvchilari bilan mashg'ulotda": "Habiba Teacher teaching English teachers",
  "Ilovani serverdan yangilash": "Update the app from the server",
  "Menyu": "Menu",
  "Tugatilmagan": "Not completed",
  "O'tilmadi": "Not passed",
  "Barcha kurs va testlarga kirish.": "Access to all courses and tests.",
  "so'm": "UZS",
  "To'lovni tasdiqlash": "Confirm payment",
  "To'lov qilish": "Make a payment",
  "To'lovni yuborish": "Submit payment",
  "To'lov muvaffaqiyatli yuborildi.": "Payment submitted successfully.",
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

  const mediaNotice = decoded.replace(/video darslar hozircha yo(?:'|’)?q/gi, "video lessons coming soon");
  if (mediaNotice !== decoded) {
    return put(mediaNotice.replace(/^Dars\(/, "Lessons (").replace(/^Dars$/, "Lessons"));
  }

  let m;
  if ((m = decoded.match(/^Salom,\s*(.+?)(!\s*👋)$/)) || (m = decoded.match(/^Salom,\s*(.+?)(!?)$/))) {
    return put(`Hello, ${m[1]}${m[2]}`);
  }
  if ((m = decoded.match(/^(\d+)\s*ta\s+video$/))) return put(`${m[1]} video lessons`);
  if ((m = decoded.match(/^Sahifa\s+(\d+)\s*\/\s*(\d+)\s*\|\s*(\d+)\s*ta\s+dars$/))) return put(`Page ${m[1]} / ${m[2]} | ${m[3]} lessons`);
  if ((m = decoded.match(/^(\d+)\s*\/\s*(\d+)\s*dars$/))) return put(`${m[1]} / ${m[2]} lessons`);
  if ((m = decoded.match(/^(\d+)\s+kunlik streak$/))) return put(`${m[1]} day streak`);
  if ((m = decoded.match(/^(\d+)\s+dars\s*·\s*(\d+)\s+kun 🔥$/))) return put(`${m[1]} lessons · ${m[2]} days 🔥`);
  if ((m = decoded.match(/^#?(\d+)\s*\/\s*(\d+)$/))) return put(`${m[1]} / ${m[2]}`);
  if ((m = source.match(/^Jami qatnashganlar:\s*(\d+)\s*ta$/))) return put(`Total participants: ${m[1]}`);
  if ((m = source.match(/^Sizning natijangiz:\s*(\d+)%$/))) return put(`Your result: ${m[1]}%`);
  if ((m = source.match(/^(\d+)\s*\/\s*(\d+)\s*savol$/))) return put(`${m[1]} / ${m[2]} questions`);
  if ((m = source.match(/^(\d+)-savol$/))) return put(`Question ${m[1]}`);
  if ((m = source.match(/^(\d+)\s*soat(?:\s*(\d+)\s*daqiqa)?$/))) {
    const h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    return put(`${h} ${h === 1 ? "hour" : "hours"}${min ? ` ${min} min` : ""}`);
  }
  if ((m = source.match(/^(\d+)\s*daqiqa$/))) return put(`${m[1]} min`);
  if ((m = source.match(/^([\d\s]+)\s*so'm$/))) return put(`${m[1].trim()} UZS`);
  if ((m = source.match(/^(\d+)\s*ballik$/)) || (m = source.match(/^(\d+)\s*ball$/))) return put(`${m[1]} points`);
  if ((m = source.match(/^(\d+)\s*dars$/))) return put(`${m[1]} lessons`);
  if ((m = source.match(/^(\d+)\s*Ko'rishlar$/))) return put(`${m[1]} views`);
  if ((m = source.match(/^(\d+)\s*\/\s*(\d+)\s*to'g'ri javob$/))) return put(`${m[1]} / ${m[2]} correct answers`);
  if ((m = source.match(/^(\d+)\s*ta$/))) return put(`${m[1]} items`);
  if ((m = source.match(/^(\d+)\s*ta\s+test$/))) return put(`${m[1]} tests`);
  if ((m = source.match(/^(.+)\s+guruhiga$/))) return put(`to ${m[1]} group`);
  if ((m = source.match(/^Bugun\s+(\d+)\/8\s+ishtirokchi\.$/))) return put(`Today ${m[1]}/8 participants.`);
  if ((m = source.match(/^Kunlik pley-off\s*.\s+(.+)$/))) return put(`Daily playoff. ${m[1]}`);
  if ((m = source.match(/^Siz shu yerdasiz$/))) return put("You are here");
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
