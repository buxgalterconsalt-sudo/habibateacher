/* ==========================================================================
  Habiba teacher   onlayn o'quv platformasi
  Node.js + SQLite, tashqi kutubxonalarsiz.
  Ishga tushirish: node server.mjs  (yoki start-platform.bat)
  ========================================================================== */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomInt, scryptSync, timingSafeEqual, createHmac } from "node:crypto";
import { Readable } from "node:stream";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { LANG_CODES, translateHtml } from "./src/i18n.mjs";
import { parseQuestionsFromXlsx, parseQuestionsFromDocx, questionsXlsxTemplate } from "./src/question-import.mjs";
import { loadAppConfig } from "./src/config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { config, port: PORT, dataDir: DATA_DIR, storageDir: STORAGE_DIR, publicDir: PUBLIC_DIR, maxUpload: MAX_UPLOAD } = loadAppConfig(__dirname);
const DAILY_WISDOM = JSON.parse(fs.readFileSync(path.join(__dirname, "seed-data", "daily-wisdom-uz.json"), "utf8"));
const MAX_VIDEO_UPLOAD = 4 * 1024 * 1024 * 1024;
const VIDEO_UPLOAD_CHUNK = 2 * 1024 * 1024;
const MAX_MULTIPART_BODY = Math.max(256 * 1024 * 1024, MAX_UPLOAD + 1024 * 1024);
const videoUploadSessions = new Map();
const videoUploadCleanup = setInterval(() => {
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  for (const [token, session] of videoUploadSessions) {
    if (session.createdAt >= cutoff) continue;
    videoUploadSessions.delete(token);
    fs.promises.unlink(session.path).catch(() => {});
  }
}, 60 * 60 * 1000);
videoUploadCleanup.unref();

const DEFAULT_ADMIN_PASSWORD_HASH = "7e3379d301a940c026d357d73fea6007:9c89ab7ba9f0dc3ecf9292610192eb2041c4b68bca73e90ae2548da7bef7a7f4619a004438960e6a7c174c32a99ecac93a37cd9b2a0898d28065809898553fb8";

/* ---------------------------------------------------- embedded assets
   public/ papkasi yuklanmasa ham sayt to'liq ko'rinishi uchun. */

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(STORAGE_DIR, { recursive: true });

/* ---------------------------------------------------------- static assets
   GitHub/Railway'ga fayllar tekislangan (papkasiz) yuklansa ham CSS va
   rasmlarni topib, public/ ichiga o'z joyiga qaytaradi. */
function findAssetFile(name, roots, depth = 5) {
  const skip = new Set(["node_modules", ".git", "data", "storage", ".cache"]);
  const queue = roots.map((dir) => ({ dir, level: 0 }));
  while (queue.length) {
    const { dir, level } = queue.shift();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) return full;
      if (entry.isDirectory() && level < depth && !skip.has(entry.name)) {
        queue.push({ dir: full, level: level + 1 });
      }
    }
  }
  return "";
}

function ensurePublicAssets() {
  try {
    fs.mkdirSync(path.join(PUBLIC_DIR, "img"), { recursive: true });
    const targets = [
      ["platform.css", path.join(PUBLIC_DIR, "platform.css")],
      ["habiba-stage.jpg", path.join(PUBLIC_DIR, "img", "habiba-stage.jpg")],
      ["teachers-group.jpg", path.join(PUBLIC_DIR, "img", "teachers-group.jpg")],
    ];
    for (const [name, dest] of targets) {
      if (fs.existsSync(dest)) continue;
      const found = findAssetFile(name, [__dirname, process.cwd()]);
      if (found) {
        fs.copyFileSync(found, dest);
        console.log(`[assets] ${name} -> ${path.relative(__dirname, dest)}`);
      } else {
        console.warn(`[assets] ${name} topilmadi (GitHub repo ichida yo'q)`);
      }
    }
  } catch (e) {
    console.error("[assets]", e.message);
  }
}
ensurePublicAssets();

const nowISO = () => new Date().toISOString();

function metaGet(key, fallback = "") {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
  return row ? row.value: fallback;
}

function metaSet(key, value) {
  db.prepare(
  "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, String(value));
}

const SITE_TEXT_DEFAULTS = {
  site_name: config.siteName || "Habiba teacher",
  orbit_kicker: "HABIBA TEACHER · TA'LIM PLATFORMASI", orbit_test: "TEST", orbit_lesson: "DARS", orbit_result: "NATIJA", orbit_tag_1: "Attestatsiya", orbit_tag_2: "TKT", orbit_tag_3: "Metodika", orbit_tag_4: "Amaliy mashq",
  nav_home: "Bosh sahifa", nav_attestation: "Attestatsiya", nav_tkt: "TKT", nav_duel: "Duel", nav_plans: "Tariflar", nav_leaderboard: "Reyting",
  hero_eyebrow: "O'QITUVCHILAR UCHUN ONLAYN TA'LIM", hero_title: "Bilimingizni", hero_accent: "mustahkamlang.", hero_title_end: "Imtihonga tayyor bo'ling.", hero_description: "Attestatsiya va TKT uchun testlar, video darslar hamda metodik materiallar. O'z maqsadingizga mos yo'nalishni tanlab, o'z sur'atingizda o'rganing.", hero_primary: "Bepul ro'yxatdan o'tish", hero_primary_logged: "O'qishni davom ettirish", hero_secondary: "Yo'nalishni tanlang", hero_trust_1: "O'zbek tilida", hero_trust_2: "Istalgan qurilmada", hero_trust_3: "Natija va progress nazorati", hero_note: "Yangi darslar va sinovlar platformada muntazam yangilanadi", hero_image_caption: "Ustozlar uchun amaliy tayyorlov", hero_float_mark: "TKT", hero_float_title: "TKT: 3 ta modul", hero_float_description: "Har bir modul bo'yicha alohida tayyorgarlik",
  stat_directions: "Yo'nalishlar", stat_lessons: "Video va o'quv darslari", stat_tests: "Sinov testlari", stat_test_attestation: "Attestatsiya testlari", stat_test_tkt: "TKT testlari", stat_students: "O'quvchilar", stat_note_title: "Bir maqsad sari", stat_note_description: "Reja, mashq va natija — bir joyda", program_direction_suffix: "ta yo'nalish", program_lesson_suffix: "ta dars", program_attestation_tag: "ATTESTATSIYA", program_tkt_tag: "TKT", program_practice_tag: "AMALIYOT", footer_about: "Biz haqimizda",
  overview_eyebrow: "01 / MAQSADGA QADAM", overview_title: "O'rganing. Mashq qiling.", overview_accent: "O'sishni kuzating.", overview_description: "Tayyorgarlikni kichik, tushunarli bosqichlarga ajrating. Har bir mavzu sizni bilimni amalda qo'llashga yaqinlashtiradi.", pillar_1_title: "Bilimni yangilang", pillar_1_description: "Video dars va metodik qo'llanma bilan asosiy mavzularni takrorlang.", pillar_2_title: "O'zingizni sinang", pillar_2_description: "Test va mashqlar orqali tushunganingizni tekshirib boring.", pillar_3_title: "Natijani kuzating", pillar_3_description: "Shaxsiy kabinetda progress va yakunlangan darslarni ko'ring.",
  direction_heading: "Yo'nalishni tanlang", direction_description: "Attestatsiya yoki TKT — o'zingizga kerakli yo'nalishdan boshlang.", direction_attestation_title: "Attestatsiya testlari", direction_attestation_description: "Ingliz tili fani o'qituvchilari uchun testlar, metodika va demo dars.", direction_tkt_title: "TKT testlari", direction_tkt_description: "Teaching Knowledge Test formatidagi metodika va sinf boshqaruvi testlari.", direction_open: "Ochish",
  about_eyebrow: "Biz haqimizda", about_title: "O'qituvchilar uchun amaliy tayyorlov", about_description: "Habiba teacher — ingliz tili fani o'qituvchilarini attestatsiyaga tayyorlaydigan onlayn platforma. Testlar, metodika, demo dars va portfolio bo'yicha tizimli materiallar.", about_check_1: "Haqiqiy formatdagi mock testlar", about_check_2: "PDF darslik va qo'llanmalar", about_check_3: "Video tushuntirishlar", about_check_4: "Progress va natijalar nazorati", about_card_title: "Bilim — amaliyotda kuch.", about_card_description: "Har bir dars sinfdagi haqiqiy vaziyatlarga moslashtirilgan.",
  feature_eyebrow: "Nega biz", feature_title: "Natijaga olib boradigan tayyorlov", feature_pdf_title: "PDF materiallar", feature_pdf_description: "Darslik va qo'llanmalarni platformadan ochish yoki yuklab olish.", feature_video_title: "Video darslar", feature_video_description: "Trener tushuntirishlari va amaliy namunalar.", feature_test_title: "Mock testlar", feature_test_description: "Haqiqiy formatdagi testlar, natija va tahlil.",
  program_eyebrow: "02 / O'QUV DASTURI", program_title: "Poydevordan", program_accent: "amaliyotgacha.", program_description: "Har bir mavzu bilimni mustahkamlash, sinab ko'rish va dars jarayonida qo'llashga yordam beradi.", program_step_1_title: "Toifa sinoviga tayyorlov", program_step_1_description: "Mutaxassislik, kasbiy standartlar va pedagogik mahorat bo'yicha mavzularni o'rganing va testlarda mashq qiling.", program_step_2_title: "Teaching Knowledge Test", program_step_2_description: "TKT modullarida til tizimi, dars rejalashtirish va o'quvchini qo'llab-quvvatlash mavzularini takrorlang.", program_step_3_title: "Bilimni darsda qo'llash", program_step_3_description: "Metodik materiallar va video tushuntirishlardan foydalanib, o'rganganlaringizni amaliy vaziyatlar bilan bog'lang.",
  pricing_eyebrow: "03 / O'ZINGIZGA MOS TARIF", pricing_title: "O'qishni", pricing_accent: "bugun boshlang.", pricing_description: "Tarifni tanlang, o'quv rejangizga mos tarzda foydalaning.", pricing_all: "Barcha tariflar", pricing_button: "Tarifni ko'rish",
  faq_eyebrow: "04 / YORDAM", faq_title: "Boshlashdan oldin", faq_accent: "bilishingiz kerak.", faq_description: "Platformadan foydalanish haqida qisqa javoblar.", faq_contact: "Telegram orqali bog'lanish", faq_q1: "Platformada qaysi yo'nalishlar bor?", faq_a1: "Attestatsiya, TKT va o'qituvchilar uchun amaliy o'quv materiallari.", faq_q2: "Darslarni telefondan ko'rsam bo'ladimi?", faq_a2: "Ha. Sayt telefon, planshet va kompyuter ekranlariga moslashadi.", faq_q3: "O'qish natijalarim saqlanadimi?", faq_a3: "Kabinetda tugatilgan darslar va test natijalaringizni ko'rishingiz mumkin.", faq_q4: "Qanday qilib kursga kiraman?", faq_a4: "Ro'yxatdan o'ting, kerakli yo'nalishni tanlang va tariflar sahifasidagi ko'rsatmalarga amal qiling.",
  final_eyebrow: "KEYINGI QADAM — SIZDAN", final_title: "Kasbiy maqsadingizga", final_accent: "bugun yaqinlashing.", final_description: "Yo'nalishni tanlang va o'z rejangiz bo'yicha tayyorgarlikni boshlang.", final_button: "Ro'yxatdan o'tish", final_button_logged: "O'qishni boshlash", footer_tagline: "Ingliz tili o'qituvchilari uchun imtihonlarga tayyorlov platformasi.", footer_credit: "Avtor: Habiba Mo'minjonovna. Barcha huquqlar himoyalangan."
};

Object.assign(SITE_TEXT_DEFAULTS, {
  dashboard_page_title: "Kabinet", dashboard_registered_notice: "Siz muvaffaqiyatli ro'yxatdan o'tdingiz.", dashboard_quote_title: "Bugungi kun hikmati", dashboard_quote_override: "", dashboard_quote_source: "",
  dashboard_greeting_eyebrow: "Xush kelibsiz", dashboard_greeting_prefix: "Salom,", dashboard_welcome_lead: "O'rganishni davom eting va maqsadingizga erishing!",
  dashboard_streak_label: "kunlik streak", dashboard_refresh_label: "Yangilash", dashboard_refresh_aria: "Platformani yangilash", dashboard_refresh_help: "Serverdagi so'nggi o'zgarishlarni yuklash", dashboard_install_label: "Ilovani o'rnatish", dashboard_install_aria: "Ilovani o'rnatish", dashboard_install_ready: "Ilova qurilmangizga o'rnatilgan.", dashboard_install_help: "Brauzer menyusidan 'Ilovani o'rnatish' yoki 'Bosh ekranga qo'shish'ni tanlang.",
  dashboard_done_title: "Barcha testlar yakunlandi!", dashboard_done_description: "Tabriklaymiz, barcha testlarni yechib bo'ldingiz.", dashboard_plan_required: "Tarif talab qilinadi", dashboard_next_test: "Keyingi test", dashboard_open_access: "Kirishni ochish",
  dashboard_completed: "yakunlangan", dashboard_progress_title: "Testlar jarayoni", dashboard_test_unit: "test", dashboard_progress_encouragement: "Yaxshi boshladingiz, davom eting 🚀", dashboard_first_test_hint: "Birinchi testni boshlang 🚀",
  dashboard_rank_position: "Guruhda o'rningiz", dashboard_achievements: "Yutuqlar", dashboard_group_ranking: "Guruh reytingi", dashboard_active_results: "Faol o'quvchilarning natijalari", dashboard_weekly: "Haftalik",
  dashboard_weekly_empty: "Bu hafta hali hech kim test yakunlamadi. Birinchi bo'ling!", dashboard_daily_growth: "Har kuni ozgina o'sish ham katta natijaga olib keladi.", dashboard_tests_title: "Testlar", dashboard_test_count_suffix: "ta test",
  dashboard_test_search: "Testlarni qidirish...", dashboard_grid_view: "Katak ko'rinishi", dashboard_list_view: "Ro'yxat ko'rinishi", dashboard_no_tests: "Hozircha testlar yo'q.",
  dashboard_status_previous: "Avval oldingi test", dashboard_status_done: "Tugatildi", dashboard_status_plan: "Tarif kerak", dashboard_status_start: "Boshlash", dashboard_time_short: "daq", dashboard_duration_unit: "daqiqa", dashboard_day_unit: "kun",
  dashboard_page_label: "Sahifa", dashboard_test_list_label: "test"
});

const HOME_SECTION_LABELS = {
  hero: "Bosh sahifa yuqori qismi",
  "teachers-photo": "O'qituvchilar jamoasi rasmi",
  overview: "Orbita va afzalliklar",
  directions: "Yo'nalish kartalari",
  about: "Biz haqimizda",
  stats: "O'quvchilar va darslar hisoblagichi",
  features: "Platforma imkoniyatlari",
  program: "O'quv dasturi",
  pricing: "Tariflar",
  faq: "Savol-javob",
  final: "Yakuniy chaqiriq"
};

function homeSectionVisibility() {
  let saved = {};
  try { saved = JSON.parse(metaGet("home_sections_json", "{}")) || {}; } catch (e) {}
  return Object.fromEntries(Object.keys(HOME_SECTION_LABELS).map((key) => [key, saved[key] !== false]));
}

function homeCustomSections() {
  try {
    const rows = JSON.parse(metaGet("home_custom_sections_json", "[]"));
    if (!Array.isArray(rows)) return [];
    return rows.slice(0, 20).map((row, index) => ({
      id: String(row.id || `section_${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || `section_${index + 1}`,
      title: String(row.title || "").slice(0, 180),
      description: String(row.description || "").slice(0, 2000),
      buttonLabel: String(row.buttonLabel || "").slice(0, 80),
      buttonUrl: String(row.buttonUrl || "").slice(0, 500),
      visible: row.visible !== false
    })).filter((row) => row.title || row.description);
  } catch (e) { return []; }
}

function homeSectionOrder(customSections = homeCustomSections()) {
  const allKeys = [...Object.keys(HOME_SECTION_LABELS), ...customSections.map((row) => `custom_${row.id}`)];
  let saved = [];
  try { saved = JSON.parse(metaGet("home_section_order_json", "[]")); } catch (e) {}
  const order = Array.isArray(saved) && saved.length ? saved.filter((key) => allKeys.includes(key)) : [...allKeys];
  if (!order.includes("teachers-photo")) {
    const heroIndex = order.indexOf("hero");
    if (heroIndex >= 0) order.splice(heroIndex + 1, 0, "teachers-photo");
    else order.push("teachers-photo");
  }
  for (const key of allKeys) if (!order.includes(key)) order.push(key);
  return order;
}

const DEFAULT_NEWS_POSTS = [{
  id: "attestation-practice-120",
  title: "120 ta yangi mashq testi joylandi",
  body: "Reading, Grammar, Vocabulary, Pragmatika, Pedagogik mahorat va Kasbiy standart yo'nalishlarida yangi testlar bilan muntazam mashq qiling.",
  date: "2026-11-25",
  updatedAt: "2026-11-25"
}];

function newsPosts() {
  let saved;
  try { saved = JSON.parse(metaGet("news_posts_json", JSON.stringify(DEFAULT_NEWS_POSTS))); } catch (e) { saved = DEFAULT_NEWS_POSTS; }
  if (!Array.isArray(saved)) return [];
  return saved.slice(0, 60).map((post, index) => ({
    id: String(post.id || `news-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48),
    title: String(post.title || "").replace(/&(?:amp;)?#39;/g, "'").trim().slice(0, 180),
    body: String(post.body || "").replace(/&(?:amp;)?#39;/g, "'").trim().slice(0, 4000),
    titleEn: String(post.titleEn || "").trim().slice(0, 180),
    bodyEn: String(post.bodyEn || "").trim().slice(0, 4000),
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(post.date || "")) ? String(post.date) : "",
    updatedAt: String(post.updatedAt || post.date || "")
  })).filter((post) => post.id && post.title && post.body).sort((a, b) => b.date.localeCompare(a.date));
}

function newsNavigationLink(user) {
  const ids = newsPosts().map((post) => `${post.id}:${post.updatedAt}`);
  const viewer = user && Number(user.id) ? `user-${Number(user.id)}` : "guest";
  return `<a href="/news" class="news-nav-link" data-news-nav data-news-viewer="${h(viewer)}" data-news-ids="${h(JSON.stringify(ids))}" aria-label="Yangiliklar"><span>Yangiliklar</span><span class="news-nav-badge" data-news-badge hidden></span></a>`;
}

function siteTexts(includeRemoved = false) {
  let saved = {};
  try { saved = JSON.parse(metaGet("site_texts_json", "{}")) || {}; } catch (e) {}
  const removed = new Set(siteCopyRemoved());
  const result = {};
  for (const [key, fallback] of Object.entries(SITE_TEXT_DEFAULTS)) {
    const legacy = "";
    const savedValue = key === "hero_secondary" && saved[key] === "Dastur bilan tanishish" ? fallback : saved[key];
    if (key === "stat_directions" && (!String(savedValue ?? "").trim() || String(savedValue).trim().toLowerCase() === "multilevel")) {
      result[key] = fallback;
      continue;
    }
    result[key] = removed.has(key) && !includeRemoved ? "" : String(savedValue ?? (legacy || fallback)).slice(0, 500);
  }
  return result;
}

function siteCopyRemoved() {
  try {
    const keys = JSON.parse(metaGet("site_copy_removed_json", "[]"));
    return Array.isArray(keys) ? keys.filter((key) => Object.hasOwn(SITE_TEXT_DEFAULTS, key)) : [];
  } catch (e) { return []; }
}

function siteCopyExtras() {
  try {
    const rows = JSON.parse(metaGet("site_copy_extras_json", "[]"));
    if (!Array.isArray(rows)) return [];
    return rows.slice(0, 100).map((row, index) => ({
      id: String(row.id || `copy_${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40),
      group: String(row.group || "hero").slice(0, 40),
      label: String(row.label || "").trim().slice(0, 100),
      text: String(row.text || "").trim().slice(0, 1000)
    })).filter((row) => row.id && row.label && row.text);
  } catch (e) { return []; }
}

function siteCopyExtraMarkup(group) {
  const rows = siteCopyExtras().filter((row) => row.group === group);
  return rows.length ? `<div class="site-copy-extra-public">${rows.map((row) => `<p><b>${h(row.label)}</b> ${h(row.text)}</p>`).join("")}</div>` : "";
}

const REMOVABLE_SITE_BUTTONS = [
  ["nav_home", "Menyu: Bosh sahifa"], ["nav_attestation", "Menyu: Attestatsiya"], ["nav_tkt", "Menyu: TKT"],
  ["nav_duel", "Menyu: Duel"], ["nav_plans", "Menyu: Tariflar"],
  ["nav_leaderboard", "Menyu: Reyting"], ["nav_login", "Menyu: Kirish"], ["hero_register", "Bosh sahifa: ro'yxatdan o'tish"],
  ["hero_directions", "Bosh sahifa: yo'nalishni tanlash"], ["direction_open", "Yo'nalish kartalari: Ochish"],
  ["pricing_all", "Bosh sahifa: barcha tariflar"],
  ["pricing_plan", "Bosh sahifa: tarif kartasi tugmalari"], ["faq_contact", "Bosh sahifa: bog'lanish"],
  ["final_cta", "Bosh sahifa: yakuniy chaqiriq"], ["custom_home_buttons", "Qo'shimcha bosh sahifa bo'limlaridagi tugmalar"],
  ["footer_directions", "Pastki qism: Yo'nalishlar"], ["footer_about", "Pastki qism: Biz haqimizda"],
  ["footer_telegram", "Pastki qism: Telegram"], ["footer_phone", "Pastki qism: telefon"]
];

function removedSiteButtons() {
  try {
    const keys = JSON.parse(metaGet("site_buttons_removed_json", "[]"));
    const valid = new Set(REMOVABLE_SITE_BUTTONS.map(([key]) => key));
    return Array.isArray(keys) ? [...new Set(keys.filter((key) => valid.has(key)))] : [];
  } catch (e) { return []; }
}

function siteButtonVisible(key) {
  return !removedSiteButtons().includes(key);
}

function siteBrandName() {
  return String(siteTexts().site_name || config.siteName || "Habiba teacher").trim().slice(0, 80);
}

const DEFAULT_PLANS = [
  { id: "month", title: "1 oy", days: 30, price: 99000, description: "Barcha kurs va testlarga 1 oy kirish." },
  { id: "quarter", title: "3 oy", days: 90, price: 299000, description: "Barcha kurs va testlarga 3 oy kirish." },
  { id: "year", title: "12 oy", days: 365, price: 799000, description: "Barcha kurs va testlarga 12 oy kirish." }
];

function getPlans() {
  try {
    const saved = JSON.parse(metaGet("plans_json", "[]"));
    return DEFAULT_PLANS.map((plan) => {
      const override = saved.find((item) => item.id === plan.id) || {};
      return { ...plan, price: Math.max(0, Math.round(Number(override.price ?? plan.price))) };
    });
  } catch (e) {
    return DEFAULT_PLANS;
  }
}

function hasPlanAccess(userId) {
  return !!db.prepare("SELECT 1 FROM plan_subscriptions WHERE user_id = ? AND status = 'active' AND expires_at > ? LIMIT 1")
    .get(userId, nowISO());
}

function hasLessonPermission(userId, lessonId) {
  return hasPlanAccess(userId) || !!db.prepare("SELECT 1 FROM purchases WHERE user_id = ? AND lesson_id = ? LIMIT 1")
    .get(userId, lessonId);
}

function isIntroVideoLesson(lessonId) {
  const lesson = db.prepare("SELECT id, course_id, position FROM lessons WHERE id = ? AND type = 'video'").get(lessonId);
  if (!lesson) return false;
  const priorVideos = db.prepare(`SELECT COUNT(*) AS n FROM lessons
    WHERE course_id = ? AND type = 'video' AND (position < ? OR (position = ? AND id < ?))`)
    .get(lesson.course_id, lesson.position, lesson.position, lesson.id);
  return Number(priorVideos && priorVideos.n) < 1;
}

function hasDeviceLimitReached(userId, req) {
  const now = Date.now();
  const cutoff = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("DELETE FROM device_sessions WHERE last_seen <= ?").run(cutoff);
  const currentToken = parseCookies(req).ht_device || "";
  const current = currentToken
    ? db.prepare("SELECT user_id FROM device_sessions WHERE token = ?").get(currentToken)
    : null;
  if (current && Number(current.user_id) === Number(userId)) {
    db.prepare("UPDATE device_sessions SET last_seen = ? WHERE token = ?").run(nowISO(), currentToken);
    return false;
  }
  const activeDevices = Number(db.prepare("SELECT COUNT(*) AS n FROM device_sessions WHERE user_id = ?").get(userId)?.n || 0);
  return activeDevices >= 2;
}

const TEST_PASS_PERCENT = 80;
const ATTESTATION_TEST_PASS_PERCENT = 60;

function testPassPercent(category) {
  return category === "attestation" ? ATTESTATION_TEST_PASS_PERCENT : TEST_PASS_PERCENT;
}

function firstVideoTasksGate(userId, courseId) {
  const videos = db.prepare("SELECT id, position FROM lessons WHERE course_id = ? AND type = 'video' ORDER BY position, id LIMIT 2").all(courseId);
  if (videos.length < 2) return { locked: false };
  const firstVideo = videos[0];
  const firstDone = !!db.prepare("SELECT 1 FROM progress WHERE user_id = ? AND lesson_id = ? AND score IS NULL")
    .get(userId, firstVideo.id);
  if (!firstDone) return { locked: true, lessonId: firstVideo.id, reason: "video" };
  const firstVideoTask = db.prepare(`SELECT id FROM lessons
    WHERE course_id = ? AND type = 'test' AND (position > ? OR (position = ? AND id > ?))
    ORDER BY position, id LIMIT 1`)
    .get(courseId, firstVideo.position, firstVideo.position, firstVideo.id);
  if (firstVideoTask) {
    const result = db.prepare("SELECT score FROM progress WHERE user_id = ? AND lesson_id = ?").get(userId, firstVideoTask.id);
    if (!result || Number(result.score) < TEST_PASS_PERCENT) return { locked: true, lessonId: firstVideoTask.id, reason: "task" };
  }
  return { locked: false };
}

const DEFAULT_CONTRACT_TEXT = `1. Umumiy qoidalar
1.1. Ushbu shartnoma "Habiba teacher" onlayn ta'lim platformasidan foydalanish tartibini belgilaydi.
1.2. Platformadan foydalanishni boshlash orqali siz ushbu shartlar bilan tanishganingizni va ularga rozilik bildirganingizni tasdiqlaysiz.

2. Taqdim etiladigan xizmatlar
2.1. Platforma attestatsiya va TKT yo'nalishlari bo'yicha testlar, metodik materiallar, demo darslar va boshqa o'quv resurslarini taqdim etadi.
2.2. Materiallar faqat shaxsiy ta'lim maqsadlarida foydalanish uchun beriladi.

3. Foydalanuvchining majburiyatlari
3.1. Hisob ma'lumotlari (parol, kirish kodi) maxfiy saqlanishi foydalanuvchining zimmasida.
3.2. Platforma materiallarini ruxsatsiz ko'chirish, tarqatish yoki sotish taqiqlanadi.
3.3. Boshqa foydalanuvchilarga xalaqit berish, tizimga ruxsatsiz kirishga urinish taqiqlanadi.

4. Mualliflik huquqi
4.1. Platformadagi barcha testlar, matnlar, videolar va boshqa materiallar mualliflik huquqi bilan himoyalangan.
4.2. Materiallardan tijoriy maqsadda foydalanish faqat yozma ruxsat bilan amalga oshiriladi.

5. Shaxsiy ma'lumotlar
5.1. Foydalanuvchining ismi, telefon raqami va Telegram ID'si faqat platforma xizmatlarini ko'rsatish uchun ishlatiladi.
5.2. Shaxsiy ma'lumotlar uchinchi shaxslarga ruxsatsiz berilmaydi.

6. Yakuniy qoidalar
6.1. Platforma ma'muriyati xizmat shartlarini yangilash huquqini saqlab qoladi.
6.2. Shartlar buzilganda akkaunt vaqtincha yoki butunlay bloklanishi mumkin.`;

function contractText() {
  return metaGet("contract_text", DEFAULT_CONTRACT_TEXT) || DEFAULT_CONTRACT_TEXT;
}

const db = new DatabaseSync(path.join(DATA_DIR, "platform.db"));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 5000;
  PRAGMA cache_size = -64000;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  pass TEXT NOT NULL,
  telegram_id TEXT,
  created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'attestation',
  is_published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT DEFAULT '',
  video_url TEXT DEFAULT '',
  file_id TEXT DEFAULT '',
  file_name TEXT DEFAULT '',
  file_size INTEGER DEFAULT 0,
  duration_min INTEGER NOT NULL DEFAULT 30,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  o1 TEXT NOT NULL,
  o2 TEXT NOT NULL,
  o3 TEXT NOT NULL,
  o4 TEXT NOT NULL,
  correct INTEGER NOT NULL,
  passage TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS test_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  from_no INTEGER NOT NULL DEFAULT 1,
  to_no INTEGER NOT NULL DEFAULT 0,
  passage TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS progress (
  user_id INTEGER NOT NULL,
  lesson_id INTEGER NOT NULL,
  score INTEGER,
  completed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, lesson_id)
  );

  CREATE TABLE IF NOT EXISTS enrollments (
  user_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, course_id)
  );

  CREATE TABLE IF NOT EXISTS purchases (
  user_id INTEGER NOT NULL,
  lesson_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, lesson_id)
  );

  CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'link',
  url TEXT DEFAULT '',
  file_id TEXT DEFAULT '',
  file_name TEXT DEFAULT '',
  file_size INTEGER DEFAULT 0,
  body TEXT DEFAULT '',
  created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS duels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  lesson_id INTEGER NOT NULL,
  creator_id INTEGER NOT NULL,
  opponent_id INTEGER,
  status TEXT NOT NULL DEFAULT 'waiting',
  created_at TEXT NOT NULL,
  finished_at TEXT
  );

  CREATE TABLE IF NOT EXISTS duel_plays (
  duel_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  score INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  total INTEGER NOT NULL,
  elapsed_ms INTEGER NOT NULL,
  finished_at TEXT NOT NULL,
  PRIMARY KEY (duel_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS duel_starts (
  duel_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  PRIMARY KEY (duel_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  group_no INTEGER NOT NULL DEFAULT 1,
  test_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  size INTEGER NOT NULL DEFAULT 8,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  UNIQUE(day, group_no)
  );

  CREATE TABLE IF NOT EXISTS tournament_entries (
  tournament_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  seed INTEGER NOT NULL,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (tournament_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS tournament_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL,
  round INTEGER NOT NULL,
  slot INTEGER NOT NULL,
  p1 INTEGER,
  p2 INTEGER,
  winner INTEGER,
  s1 INTEGER,
  s2 INTEGER,
  t1 INTEGER,
  t2 INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  finished_at TEXT
  );

  CREATE TABLE IF NOT EXISTS tournament_starts (
  match_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  PRIMARY KEY (match_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
  );
`);

/* Telegram ID   bitta ID, bitta akkaunt */
const userCols = db.prepare("PRAGMA table_info(users)").all();
if (!userCols.some((c) => c.name === "telegram_id")) {
  db.exec("ALTER TABLE users ADD COLUMN telegram_id TEXT");
}
db.exec(
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id) WHERE telegram_id IS NOT NULL AND telegram_id <> ''"
);
const userCols2 = db.prepare("PRAGMA table_info(users)").all();
if (!userCols2.some((c) => c.name === "telegram_username")) {
  db.exec("ALTER TABLE users ADD COLUMN telegram_username TEXT");
}
db.exec(
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_username ON users(telegram_username COLLATE NOCASE) WHERE telegram_username IS NOT NULL AND telegram_username <> ''"
);
const userCols3 = db.prepare("PRAGMA table_info(users)").all();
if (!userCols3.some((c) => c.name === "surname")) {
  db.exec("ALTER TABLE users ADD COLUMN surname TEXT NOT NULL DEFAULT ''");
}
if (!userCols3.some((c) => c.name === "father_name")) {
  db.exec("ALTER TABLE users ADD COLUMN father_name TEXT NOT NULL DEFAULT ''");
}
if (!userCols3.some((c) => c.name === "birth_date")) {
  db.exec("ALTER TABLE users ADD COLUMN birth_date TEXT NOT NULL DEFAULT ''");
}
if (!userCols3.some((c) => c.name === "last_login_at")) {
  db.exec("ALTER TABLE users ADD COLUMN last_login_at TEXT NOT NULL DEFAULT ''");
}
if (!userCols3.some((c) => c.name === "last_nudge_at")) {
  db.exec("ALTER TABLE users ADD COLUMN last_nudge_at TEXT NOT NULL DEFAULT ''");
}
if (!userCols3.some((c) => c.name === "is_blocked")) {
  db.exec("ALTER TABLE users ADD COLUMN is_blocked INTEGER NOT NULL DEFAULT 0");
}
if (!userCols3.some((c) => c.name === "is_author")) {
  db.exec("ALTER TABLE users ADD COLUMN is_author INTEGER NOT NULL DEFAULT 0");
}
db.prepare(`UPDATE users SET is_author = 1
  WHERE lower(trim(name || ' ' || surname || ' ' || father_name)) LIKE '%habiba%qoraboyeva%'
     OR lower(trim(name || ' ' || surname || ' ' || father_name)) LIKE '%qoraboyeva%habiba%'
     OR lower(trim(name || ' ' || surname || ' ' || father_name)) LIKE '%habiba%mo''minjonovna%'
     OR lower(trim(name || ' ' || surname || ' ' || father_name)) LIKE '%mo''minjonovna%habiba%'`).run();
const loginSecurityCols = db.prepare("PRAGMA table_info(users)").all();
if (!loginSecurityCols.some((c) => c.name === "password_failures")) {
  db.exec("ALTER TABLE users ADD COLUMN password_failures INTEGER NOT NULL DEFAULT 0");
}
db.exec(`CREATE TABLE IF NOT EXISTS telegram_users (
  username TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`);
db.exec(`CREATE TABLE IF NOT EXISTS telegram_bot_subscribers (
  chat_id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL
)`);
db.exec(`CREATE TABLE IF NOT EXISTS login_links (
  token TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  chat_id TEXT,
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
)`);
db.exec(`CREATE TABLE IF NOT EXISTS registration_links (
  token TEXT PRIMARY KEY,
  chat_id TEXT,
  created_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
)`);
const loginLinkCols = db.prepare("PRAGMA table_info(login_links)").all();
if (!loginLinkCols.some((c) => c.name === "send_error")) {
  db.exec("ALTER TABLE login_links ADD COLUMN send_error TEXT NOT NULL DEFAULT ''");
}

/* Eski bitta-kunlik turnir jadvalini guruhli jadvalga o'tkazish */
const tournamentCols = db.prepare("PRAGMA table_info(tournaments)").all();
if (!tournamentCols.some((c) => c.name === "group_no")) {
  db.exec(`
  ALTER TABLE tournaments RENAME TO tournaments_legacy;
  CREATE TABLE tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  group_no INTEGER NOT NULL DEFAULT 1,
  test_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  size INTEGER NOT NULL DEFAULT 8,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  UNIQUE(day, group_no)
  );
  INSERT INTO tournaments (id, day, group_no, test_id, status, size, created_at, started_at, finished_at)
  SELECT id, day, 1, test_id, status, 8, created_at, started_at, finished_at FROM tournaments_legacy;
  DROP TABLE tournaments_legacy;
  `);
}

const adminSessionCols = db.prepare("PRAGMA table_info(admin_sessions)").all();
if (!adminSessionCols.some((c) => c.name === "ip")) {
  db.exec("ALTER TABLE admin_sessions ADD COLUMN ip TEXT NOT NULL DEFAULT ''");
}

const contractUserCols = db.prepare("PRAGMA table_info(users)").all();
if (!contractUserCols.some((c) => c.name === "contract_accepted_at")) {
  db.exec("ALTER TABLE users ADD COLUMN contract_accepted_at TEXT NOT NULL DEFAULT ''");
}

db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
db.prepare("DELETE FROM admin_sessions WHERE expires_at < ?").run(Date.now());

db.exec(`CREATE TABLE IF NOT EXISTS duel_questions (
  duel_id INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (duel_id, position)
)`);

db.exec(`CREATE TABLE IF NOT EXISTS tournament_questions (
  tournament_id INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (tournament_id, position)
)`);

const duelCols = db.prepare("PRAGMA table_info(duels)").all();
if (!duelCols.some((c) => c.name === "title")) {
  db.exec("ALTER TABLE duels ADD COLUMN title TEXT NOT NULL DEFAULT ''");
}

db.exec(`CREATE TABLE IF NOT EXISTS device_sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  last_seen TEXT NOT NULL
)`);

db.exec(`CREATE TABLE IF NOT EXISTS login_codes (
  phone TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
)`);

db.exec(`CREATE TABLE IF NOT EXISTS likes (
  user_id INTEGER NOT NULL,
  lesson_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, lesson_id)
)`);

db.exec(`CREATE TABLE IF NOT EXISTS video_watch (
  user_id INTEGER NOT NULL,
  lesson_id INTEGER NOT NULL,
  max_seconds REAL NOT NULL DEFAULT 0,
  duration REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, lesson_id)
)`);
const videoWatchCols = db.prepare("PRAGMA table_info(video_watch)").all();
if (!videoWatchCols.some((c) => c.name === "is_playing")) {
  db.exec("ALTER TABLE video_watch ADD COLUMN is_playing INTEGER NOT NULL DEFAULT 0");
}
if (metaGet("video_watch_guard_version", "") !== "1") {
  db.prepare(`UPDATE video_watch SET max_seconds = 0, duration = 0, updated_at = ?, is_playing = 0
    WHERE NOT EXISTS (SELECT 1 FROM progress p WHERE p.user_id = video_watch.user_id AND p.lesson_id = video_watch.lesson_id AND p.score IS NULL)`)
    .run(nowISO());
  metaSet("video_watch_guard_version", "1");
}

db.exec(`CREATE TABLE IF NOT EXISTS lesson_viewers (
  lesson_id INTEGER NOT NULL,
  viewer_key TEXT NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (lesson_id, viewer_key)
);
CREATE INDEX IF NOT EXISTS idx_lesson_viewers_seen ON lesson_viewers(lesson_id, last_seen);`);

db.exec(`CREATE TABLE IF NOT EXISTS payment_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  plan_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  reviewed_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS plan_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  plan_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
);
CREATE INDEX IF NOT EXISTS idx_plan_subscriptions_user ON plan_subscriptions(user_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user_expiry ON sessions(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_lessons_course_position ON lessons(course_id, position, id);
CREATE INDEX IF NOT EXISTS idx_questions_lesson ON questions(lesson_id, id);
CREATE INDEX IF NOT EXISTS idx_materials_lesson ON materials(lesson_id, id);
CREATE TABLE IF NOT EXISTS test_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  lesson_id INTEGER NOT NULL,
  question_ids TEXT NOT NULL,
  answers_json TEXT NOT NULL DEFAULT '{}',
  score INTEGER,
  created_at TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_test_attempts_user_lesson ON test_attempts(user_id, lesson_id, id);
`);

// Eski bazalarga ustun qo'shish
const lessonCols = db.prepare("PRAGMA table_info(lessons)").all();
if (!lessonCols.some((c) => c.name === "duration_min")) {
  db.exec("ALTER TABLE lessons ADD COLUMN duration_min INTEGER NOT NULL DEFAULT 30");
}

const courseCols = db.prepare("PRAGMA table_info(courses)").all();
if (!courseCols.some((c) => c.name === "category")) {
  db.exec("ALTER TABLE courses ADD COLUMN category TEXT NOT NULL DEFAULT 'attestation'");
}
if (!courseCols.some((c) => c.name === "is_test_group")) {
  db.exec("ALTER TABLE courses ADD COLUMN is_test_group INTEGER NOT NULL DEFAULT 0");
}

/* Test kartochkalari uchun qo'shimcha ustunlar */
const extraLessonCols = [
  ["price", "INTEGER NOT NULL DEFAULT 0"],
  ["is_pro", "INTEGER NOT NULL DEFAULT 0"],
  ["max_score", "INTEGER NOT NULL DEFAULT 100"],
  ["question_count", "INTEGER NOT NULL DEFAULT 0"],
  ["likes", "INTEGER NOT NULL DEFAULT 0"],
  ["views", "INTEGER NOT NULL DEFAULT 0"],
  ["about", "TEXT NOT NULL DEFAULT ''"]
];
for (const [name, def] of extraLessonCols) {
  if (!lessonCols.some((c) => c.name === name)) {
  db.exec(`ALTER TABLE lessons ADD COLUMN ${name} ${def}`);
  }
}

/* Savol matni (passage) ustuni */
const questionCols = db.prepare("PRAGMA table_info(questions)").all();
if (!questionCols.some((c) => c.name === "passage")) {
  db.exec("ALTER TABLE questions ADD COLUMN passage TEXT NOT NULL DEFAULT ''");
}

/* Boshlang'ich katalog   attestatsiya va TKT testlari ro'yxati */
function ensureDemoContent() {
  const already = db.prepare("SELECT value FROM meta WHERE key = 'mk_catalog_v1'").get();
  if (already && already.value === "1") return;

  function ensureCourse({ legacyTitle, title, description, category, isTestGroup = 1 }) {
  let course = db.prepare("SELECT * FROM courses WHERE title = ? ORDER BY id LIMIT 1").get(title);
  if (!course && legacyTitle) {
  course = db.prepare("SELECT * FROM courses WHERE title = ? ORDER BY id LIMIT 1").get(legacyTitle);
  if (course) {
  db.prepare(
  "UPDATE courses SET title = ?, description = ?, category = ?, is_test_group = ? WHERE id = ?"
  ).run(title, description, category, isTestGroup, course.id);
  }
  }
  if (course) {
  db.prepare("UPDATE courses SET description = ?, category = ?, is_test_group = ? WHERE id = ?").run(
  description,
  category,
  isTestGroup,
  course.id
  );
  return course.id;
  }
  const info = db
.prepare("INSERT INTO courses (title, description, category, is_test_group, created_at) VALUES (?, ?, ?, ?, ?)")
.run(title, description, category, isTestGroup, nowISO());
  return Number(info.lastInsertRowid);
  }

  function putTest(courseId, spec, position, legacyTitle) {
  let lesson = db.prepare("SELECT * FROM lessons WHERE title = ? ORDER BY id LIMIT 1").get(spec.title);
  if (!lesson && legacyTitle) {
  lesson = db.prepare("SELECT * FROM lessons WHERE title = ? ORDER BY id LIMIT 1").get(legacyTitle);
  }
  const price = Number(spec.price) || 0;
  const isPro = price > 0 ? 1: 0;
  if (lesson) {
  db.prepare(
  `UPDATE lessons SET course_id = ?, title = ?, type = 'test', duration_min = ?, position = ?,
  price = ?, is_pro = ?, max_score = ?, question_count = ?, likes = ?, views = ?
  WHERE id = ?`
  ).run(
  courseId,
  spec.title,
  spec.duration,
  position,
  price,
  isPro,
  spec.max,
  spec.qcount,
  spec.likes,
  spec.views,
  lesson.id
  );
  return;
  }
  db.prepare(
  `INSERT INTO lessons
  (course_id, title, type, content, duration_min, position, price, is_pro, max_score, question_count, likes, views, created_at)
  VALUES (?, ?, 'test', '', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
  courseId,
  spec.title,
  spec.duration,
  position,
  price,
  isPro,
  spec.max,
  spec.qcount,
  spec.likes,
  spec.views,
  nowISO()
  );
  }

  const t = (title, duration, qcount, max, likes, views, price = 0) => ({
  title,
  duration,
  qcount,
  max,
  likes,
  views,
  price
  });

  const readings = [t("Advanced Passage 1", 60, 9, 0, 0, 50, 2000)];

  const tkt1 = [t("TKT 1-modul mock testi 1", 80, 80, 80, 2, 16)];
  const tkt2 = [t("TKT 2-modul mock testi 1", 80, 80, 80, 0, 9)];
  const tkt3 = [t("TKT 3-modul mock testi 1", 80, 80, 80, 0, 7), t("TKT 3-modul amaliy testi 2", 80, 80, 80, 0, 8)];

  const toifaId = ensureCourse({
  legacyTitle: "Attestatsiya   mock testlar",
  title: "Toifa testlari",
  description: "O'qituvchilar uchun bepul toifa testlari.",
  category: "attestation"
  });
  const readingsId = ensureCourse({
  title: "Attestatsiya Readinglari",
  description: "Attestatsiya uchun advanced reading passage testlari.",
  category: "attestation"
  });
  readings.forEach((spec, i) => putTest(readingsId, spec, i + 1));

  const tkt1Id = ensureCourse({
  legacyTitle: "TKT   mock testlar",
  title: "TKT MODULE 1",
  description: "TKT 1-modul: til tizimi va o'qitish metodikasi asoslari. Har bir testda 80 ta savol.",
  category: "tkt"
  });
  tkt1.forEach((spec, i) => putTest(tkt1Id, spec, i + 1, i === 0 ? "TKT MOCK 1   Methodology": undefined));

  const tkt2Id = ensureCourse({
  title: "TKT MODULE 2",
  description: "TKT 2-modul: dars rejalashtirish va resurslardan foydalanish. Har bir testda 80 ta savol.",
  category: "tkt"
  });
  tkt2.forEach((spec, i) => putTest(tkt2Id, spec, i + 1));

  const tkt3Id = ensureCourse({
  title: "TKT MODULE 3",
  description: "TKT 3-modul: sinfni boshqarish va o'quvchilarni qo'llab-quvvatlash. Har bir testda 80 ta savol.",
  category: "tkt"
  });
  tkt3.forEach((spec, i) => putTest(tkt3Id, spec, i + 1));

  db.prepare("INSERT INTO meta (key, value) VALUES ('mk_catalog_v1', '1') ON CONFLICT(key) DO UPDATE SET value = '1'").run();
  console.log("[seed] attestatsiya va TKT test katalogi qo'shildi");
}

ensureDemoContent();

db.prepare(`UPDATE lessons SET price = 0, is_pro = 0
  WHERE id = (
    SELECT l.id FROM lessons l JOIN courses c ON c.id = l.course_id
    WHERE l.title = 'TKT 1-modul mock testi 1' AND c.title = 'TKT MODULE 1' AND c.category = 'tkt'
    ORDER BY l.id LIMIT 1
  )`).run();

const normalizeAttestationGroupName = (value) => String(value || "").toLocaleLowerCase()
  .replace(/[’'`]/g, "")
  .replace(/\s+/g, " ")
  .trim();

const ATTESTATION_GROUPS = [
  { title: "Reading testlari", aliases: ["reading", "reading testlari", "attestatsiya readinglari"], description: "Reading bo'limi — har bir testda 15 ta savol." },
  { title: "Grammar testlari", aliases: ["grammar", "grammar testlari", "grammatika testlari"], description: "Grammar bo'limi — har bir testda 7 ta savol." },
  { title: "Vocabulary testlari", aliases: ["vocabulary", "vocabulary testi", "vocabulary testlari"], description: "Vocabulary bo'limi — har bir testda 7 ta savol." },
  { title: "Pragmatika testlari", aliases: ["pragmatika", "pragmatika testi", "pragmatika testlari"], description: "Pragmatika bo'limi — har bir testda 6 ta savol." },
  { title: "Pedagogik mahorat testlari", aliases: ["pedagogik mahorat", "pedagogik mahorat testlari", "pedagogik testlari"], description: "Pedagogik mahorat bo'limi — har bir testda 10 ta savol." },
  { title: "Kasbiy standart testlari", aliases: ["kasbiy standart", "kasbiy standart testlari", "kasb mahorat testlari"], description: "Kasbiy standart bo'limi — har bir testda 5 ta savol." }
].map((group) => ({ ...group, aliases: group.aliases.map(normalizeAttestationGroupName) }));

const ATTESTATION_GROUP_PRIORITY = new Map(
  ATTESTATION_GROUPS.flatMap((group, index) => group.aliases.map((alias) => [alias, index]))
);

function ensureAttestationGroups() {
  const courses = db.prepare("SELECT * FROM courses WHERE category = 'attestation'").all();
  for (const group of ATTESTATION_GROUPS) {
    const existing = courses.find((course) => group.aliases.includes(normalizeAttestationGroupName(course.title)));
    if (existing) {
      db.prepare(
        `UPDATE courses SET title = ?, category = 'attestation', is_published = 1,
         description = CASE WHEN TRIM(COALESCE(description, '')) = '' THEN ? ELSE description END
         WHERE id = ?`
      ).run(group.title, group.description, existing.id);
      existing.title = group.title;
      continue;
    }
    const info = db.prepare(
      "INSERT INTO courses (title, description, category, created_at) VALUES (?, ?, 'attestation', ?)"
    ).run(group.title, group.description, nowISO());
    courses.push({ id: Number(info.lastInsertRowid), title: group.title, category: "attestation" });
  }
}

ensureAttestationGroups();

for (const [title, description] of [
  ["TKT MODULE 1", "TKT 1-modul: til tizimi va o'qitish metodikasi asoslari. Har bir testda 80 ta savol."],
  ["TKT MODULE 2", "TKT 2-modul: dars rejalashtirish va resurslardan foydalanish. Har bir testda 80 ta savol."],
  ["TKT MODULE 3", "TKT 3-modul: sinfni boshqarish va o'quvchilarni qo'llab-quvvatlash. Har bir testda 80 ta savol."]
]) {
  db.prepare("UPDATE courses SET description = ? WHERE title = ? AND category = 'tkt'").run(description, title);
}

function seedPreparedTests() {
  const attestationSets = JSON.parse(fs.readFileSync(path.join(__dirname, "seed-data", "attestation-mocks.json"), "utf8"));
  const attestationReplacements = JSON.parse(fs.readFileSync(path.join(__dirname, "seed-data", "attestation-replacements.json"), "utf8"));
  const replacementsByTest = new Map(attestationReplacements.map((replacement) => [
    `${Number(replacement.testNumber)}:${Number(replacement.questionPosition)}`,
    replacement
  ]));
  const sources = [
    [],
    JSON.parse(fs.readFileSync(path.join(__dirname, "seed-data", "tkt-modules-1-2.json"), "utf8")),
    JSON.parse(fs.readFileSync(path.join(__dirname, "seed-data", "tkt-module-3.json"), "utf8")),
  ];
  sources[0].push(...JSON.parse(fs.readFileSync(path.join(__dirname, "seed-data", "attestation-120.json"), "utf8")));
  const readingRows = JSON.parse(fs.readFileSync(path.join(__dirname, "seed-data", "attestation-reading.json"), "utf8"));
  const readingPassages = new Map(readingRows.filter((q) => q.passageId && q.passage).map((q) => [q.passageId, q.passage]));
  const preparedReading = readingRows.map((q) => ({ ...q, passage: readingPassages.get(q.passageId) || q.passage || "" }));
  const attestationSet1 = attestationSets.find((set) => set.category === "attestation" && Number(set.number) === 1);
  const attestationSet3 = attestationSets.find((set) => set.category === "attestation" && Number(set.number) === 3);
  const attestationSet5 = attestationSets.find((set) => set.category === "attestation" && Number(set.number) === 5);
  if (attestationSet1 && attestationSet3 && attestationSet5) {
    sources[0].push({
      category: "attestation",
      number: 11,
      course: "Toifa testlari",
      lesson: "Attestatsiya 2026 · Sinov 1",
      position: 1,
      layout: "attestation-50-sections",
      questions: [
        ...preparedReading,
        ...attestationSet1.questions.slice(15, 35),
        attestationSet1.questions[47], attestationSet1.questions[48], attestationSet1.questions[49],
        attestationSet3.questions[46], attestationSet3.questions[47],
        ...attestationSet1.questions.slice(38, 47),
        attestationSet5.questions[49]
      ]
    });
  }
  for (const set of attestationSets) {
    const sourceNumber = Number(set.number);
    const number = set.category === "mock" ? sourceNumber + 10 : sourceNumber;
    if (!Number.isInteger(number) || number < 2 || number > 20 || !Array.isArray(set.questions) || set.questions.length !== 50) continue;
    const questions = set.questions.map((question, index) => {
      const prepared = replacementsByTest.get(`${number}:${index + 1}`) || question;
      return index < preparedReading.length && preparedReading[index]?.passage
        ? { ...prepared, passage: preparedReading[index].passage }
        : prepared;
    });
    sources[0].push({
      category: "attestation",
      number,
      course: "Toifa testlari",
      lesson: `Attestatsiya 2026 · Sinov ${number}`,
      position: number,
      layout: "attestation-50-sections",
      questions
    });
  }
  const readingSections = [
    ["1-bosqich · Mutaxassislik fani", 1, 35],
    ["2-bosqich · Kasbiy Standartlar", 36, 40],
    ["3-bosqich · Pedagogik Mahorat", 41, 50]
  ];
  const readingMigrationNeeded = metaGet("attestation_reading_layout", "") !== "2026-11-22-v2";
  let migratedReadingSets = 0;
  const replaceReadingSections = (lessonId) => {
    db.prepare("DELETE FROM test_sections WHERE lesson_id = ?").run(lessonId);
    const insertSection = db.prepare("INSERT INTO test_sections (lesson_id, title, from_no, to_no, passage, position) VALUES (?, ?, ?, ?, '', ?)");
    readingSections.forEach(([title, from, to], index) => insertSection.run(lessonId, title, from, to, index + 1));
  };
  const insertQuestion = db.prepare(
    "INSERT INTO questions (lesson_id, text, o1, o2, o3, o4, correct, passage) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const updateReadingQuestion = db.prepare("UPDATE questions SET text = ?, o1 = ?, o2 = ?, o3 = ?, o4 = ?, correct = ?, passage = ? WHERE id = ?");
  let addedSets = 0;
  for (const sets of sources) {
    for (const set of sets) {
      const isAttestationFifty = set.category === "attestation" && set.questions.length === 50 &&
        ((Number(set.number) >= 1 && Number(set.number) <= 10) || set.layout === "attestation-50-sections");
      if (isAttestationFifty && set.layout !== "attestation-50-sections") set.questions.splice(0, preparedReading.length, ...preparedReading);
      const course = db.prepare("SELECT id FROM courses WHERE title = ? ORDER BY id LIMIT 1").get(set.course || (set.category === "mock" ? "2026 KUZ PLATFORMA MOCKLARI" : "Toifa testlari"));
      if (!course) continue;
      let lessonTitle = set.lesson;
      if (!lessonTitle && set.category === "attestation") lessonTitle = `Attestatsiya ${String(set.number).padStart(2, "0")} — Ingliz tili test`;
      if (!lessonTitle && set.category === "mock") lessonTitle = `2026 FALL MOCK ${set.number}`;
      let lesson = db.prepare("SELECT * FROM lessons WHERE course_id = ? AND title = ? ORDER BY id LIMIT 1").get(course.id, lessonTitle);
      if (!lesson) {
        const position = Number(set.position) || Number(set.number) + (set.category === "attestation" ? 7 : 0);
        const duration = Number(set.duration) || (set.category === "tkt" ? 80 : 90);
        const info = db.prepare(
          "INSERT INTO lessons (course_id, title, type, content, duration_min, position, price, is_pro, max_score, question_count, created_at) VALUES (?, ?, 'test', '', ?, ?, 0, 0, ?, ?, ?)"
        ).run(course.id, lessonTitle, duration, position, set.questions.length, set.questions.length, nowISO());
        lesson = { id: Number(info.lastInsertRowid), question_count: 0 };
      }
      const currentCount = Number(db.prepare("SELECT COUNT(*) AS n FROM questions WHERE lesson_id = ?").get(lesson.id)?.n || 0);
      if (set.category === "attestation" && set.bankVersion === "unique-v2" &&
          metaGet("attestation_120_questions_v2", "") !== "1" && currentCount >= set.questions.length) {
        const existingRows = db.prepare("SELECT id FROM questions WHERE lesson_id = ? ORDER BY id").all(lesson.id);
        const updatePreparedQuestion = db.prepare(
          "UPDATE questions SET text = ?, o1 = ?, o2 = ?, o3 = ?, o4 = ?, correct = ?, passage = ? WHERE id = ?"
        );
        set.questions.forEach((question, index) => {
          const row = existingRows[index];
          if (!row) return;
          const correct = typeof question.answer === "string" ? "ABCD".indexOf(question.answer.toUpperCase()) + 1 : Number(question.correct);
          updatePreparedQuestion.run(question.q || question.text, question.a || question.options?.[0], question.b || question.options?.[1],
            question.c || question.options?.[2], question.d || question.options?.[3], correct, question.passage || "", row.id);
        });
        db.prepare("UPDATE lessons SET question_count = ?, max_score = ?, duration_min = ? WHERE id = ?")
          .run(set.questions.length, set.questions.length, Number(set.duration) || 90, lesson.id);
      }
      if (isAttestationFifty && readingMigrationNeeded && currentCount >= preparedReading.length) {
        const existingReading = db.prepare("SELECT id FROM questions WHERE lesson_id = ? ORDER BY id LIMIT 15").all(lesson.id);
        existingReading.forEach((row, index) => {
          const q = preparedReading[index];
          updateReadingQuestion.run(q.q, q.a, q.b, q.c, q.d, "ABCD".indexOf(q.answer.toUpperCase()) + 1, q.passage || "", row.id);
        });
      }
      if (currentCount >= set.questions.length) {
        if (set.category === "attestation" && set.layout === "attestation-50-sections" &&
            metaGet("attestation_first15_passages_2026_11_v2", "") !== "1") {
          const existingRows = db.prepare("SELECT id, passage FROM questions WHERE lesson_id = ? ORDER BY id").all(lesson.id);
          const updatePassage = db.prepare("UPDATE questions SET passage = ? WHERE id = ?");
          for (let index = 0; index < Math.min(15, set.questions.length, existingRows.length); index += 1) {
            const passage = String(set.questions[index].passage || "");
            if (passage && existingRows[index].passage !== passage) updatePassage.run(passage, existingRows[index].id);
          }
        }
        if (set.category === "attestation" && set.layout === "attestation-50-sections" &&
            metaGet("attestation_unique_questions_2026_11", "") !== "1") {
          const existingRows = db.prepare("SELECT id FROM questions WHERE lesson_id = ? ORDER BY id").all(lesson.id);
          const updateAttestationQuestion = db.prepare("UPDATE questions SET text = ?, o1 = ?, o2 = ?, o3 = ?, o4 = ?, correct = ?, passage = ? WHERE id = ?");
          for (const replacement of attestationReplacements.filter((item) => Number(item.testNumber) === Number(set.number))) {
            const row = existingRows[Number(replacement.questionPosition) - 1];
            if (!row) continue;
            updateAttestationQuestion.run(replacement.q, replacement.a, replacement.b, replacement.c, replacement.d,
              "ABCD".indexOf(replacement.answer.toUpperCase()) + 1, replacement.passage || "", row.id);
          }
        }
        if (isAttestationFifty && readingMigrationNeeded) {
          replaceReadingSections(lesson.id);
          if (readingMigrationNeeded) migratedReadingSets += 1;
        }
        if (set.category === "tkt") {
          db.prepare("UPDATE lessons SET question_count = ?, max_score = ?, duration_min = 80 WHERE id = ?")
            .run(set.questions.length, set.questions.length, lesson.id);
          const existingQuestions = db.prepare("SELECT id, text, passage FROM questions WHERE lesson_id = ? ORDER BY id").all(lesson.id);
          const updatePassage = db.prepare("UPDATE questions SET passage = ? WHERE id = ?");
          existingQuestions.forEach((row, index) => {
            const sourceQuestion = set.questions[index];
            if (sourceQuestion && row.text === sourceQuestion.q && row.passage !== (sourceQuestion.passage || "")) {
              updatePassage.run(sourceQuestion.passage || "", row.id);
            }
          });
        }
        continue;
      }
      db.exec("BEGIN IMMEDIATE");
      try {
        for (const question of set.questions.slice(currentCount)) {
          const correct = typeof question.answer === "string" ? "ABCD".indexOf(question.answer.toUpperCase()) + 1 : Number(question.correct);
          insertQuestion.run(lesson.id, question.q || question.text, question.a || question.options?.[0], question.b || question.options?.[1], question.c || question.options?.[2], question.d || question.options?.[3], correct, question.passage || "");
        }
        const count = set.questions.length;
        db.prepare("UPDATE lessons SET type = 'test', question_count = ?, max_score = ?, duration_min = ? WHERE id = ?")
          .run(count, count, set.category === "tkt" ? 80 : 90, lesson.id);
        if (isAttestationFifty) {
          replaceReadingSections(lesson.id);
          if (readingMigrationNeeded && count === 50) migratedReadingSets += 1;
        }
        db.exec("COMMIT");
        addedSets += 1;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
  }
  if (metaGet("attestation_unique_questions_2026_11", "") !== "1") {
    const expected = new Set(attestationReplacements.map((item) => Number(item.testNumber)));
    const migrated = [...expected].filter((number) => {
      const lesson = db.prepare("SELECT id FROM lessons WHERE title = ? ORDER BY id LIMIT 1").get(`Attestatsiya 2026 · Sinov ${number}`);
      return lesson && Number(db.prepare("SELECT COUNT(*) AS n FROM questions WHERE lesson_id = ?").get(lesson.id)?.n || 0) >= 50;
    });
    if (migrated.length === expected.size) metaSet("attestation_unique_questions_2026_11", "1");
  }
  if (metaGet("attestation_first15_passages_2026_11_v2", "") !== "1") {
    const expected = new Set(sources[0].filter((set) => Number(set.number) >= 2 && Number(set.number) <= 20).map((set) => Number(set.number)));
    const migrated = [...expected].filter((number) => {
      const lesson = db.prepare("SELECT id FROM lessons WHERE title = ? ORDER BY id LIMIT 1").get(`Attestatsiya 2026 · Sinov ${number}`);
      if (!lesson) return false;
      const rows = db.prepare("SELECT passage FROM questions WHERE lesson_id = ? ORDER BY id LIMIT 15").all(lesson.id);
      return rows.length === 15 && rows.every((row) => String(row.passage || "").trim());
    });
    if (migrated.length === expected.size) metaSet("attestation_first15_passages_2026_11_v2", "1");
  }
  const expectedReadingSets = sources[0].filter((set) => set.category === "attestation" &&
    set.questions.length === 50 && ((Number(set.number) >= 1 && Number(set.number) <= 10) || set.layout === "attestation-50-sections")).length;
  if (readingMigrationNeeded && migratedReadingSets >= expectedReadingSets) metaSet("attestation_reading_layout", "2026-11-22-v2");
  const expectedUniqueSets = sources[0].filter((set) => set.category === "attestation" && set.bankVersion === "unique-v2");
  const refreshedUniqueSets = expectedUniqueSets.filter((set) => {
    const lesson = db.prepare("SELECT id FROM lessons WHERE course_id = ? AND title = ? ORDER BY id LIMIT 1")
      .get(db.prepare("SELECT id FROM courses WHERE title = ? ORDER BY id LIMIT 1").get(set.course)?.id, set.lesson);
    return lesson && Number(db.prepare("SELECT COUNT(*) AS n FROM questions WHERE lesson_id = ?").get(lesson.id)?.n || 0) >= set.questions.length;
  });
  if (expectedUniqueSets.length === 120 && refreshedUniqueSets.length === expectedUniqueSets.length) {
    metaSet("attestation_120_questions_v2", "1");
  }
  if (addedSets) console.log(`[seed] ${addedSets} new test sets added from prepared question banks`);
}

seedPreparedTests();

function replaceToifaTestBank() {
  const migrationKey = "toifa_test_bank_replaced_2026_11";
  if (metaGet(migrationKey, "") === "1") return;
  const course = db.prepare("SELECT id FROM courses WHERE title = 'Toifa testlari' ORDER BY id LIMIT 1").get();
  if (!course) return;
  const replacement = db.prepare("SELECT id FROM lessons WHERE course_id = ? AND title = ? AND type = 'test' ORDER BY id LIMIT 1")
    .get(course.id, "Attestatsiya 2026 · Sinov 1");
  if (!replacement) return;
  const oldLessons = db.prepare("SELECT id FROM lessons WHERE course_id = ? AND type = 'test' AND id <> ? AND title NOT LIKE 'Attestatsiya 2026 · Sinov %'")
    .all(course.id, replacement.id);
  const lessonIds = oldLessons.map((lesson) => Number(lesson.id));
  db.exec("BEGIN IMMEDIATE");
  try {
    if (lessonIds.length) {
      const marks = lessonIds.map(() => "?").join(",");
      const questionIds = db.prepare(`SELECT id FROM questions WHERE lesson_id IN (${marks})`).all(...lessonIds).map((q) => Number(q.id));
      const duelIds = db.prepare(`SELECT id FROM duels WHERE lesson_id IN (${marks})`).all(...lessonIds).map((d) => Number(d.id));
      const tournamentIds = db.prepare(`SELECT id FROM tournaments WHERE test_id IN (${marks})`).all(...lessonIds).map((tournament) => Number(tournament.id));
      if (duelIds.length) {
        const duelMarks = duelIds.map(() => "?").join(",");
        db.prepare(`DELETE FROM duel_questions WHERE duel_id IN (${duelMarks})`).run(...duelIds);
        db.prepare(`DELETE FROM duel_starts WHERE duel_id IN (${duelMarks})`).run(...duelIds);
        db.prepare(`DELETE FROM duel_plays WHERE duel_id IN (${duelMarks})`).run(...duelIds);
        db.prepare(`DELETE FROM duels WHERE id IN (${duelMarks})`).run(...duelIds);
      }
      if (tournamentIds.length) {
        const tournamentMarks = tournamentIds.map(() => "?").join(",");
        const matchIds = db.prepare(`SELECT id FROM tournament_matches WHERE tournament_id IN (${tournamentMarks})`).all(...tournamentIds).map((match) => Number(match.id));
        if (matchIds.length) {
          const matchMarks = matchIds.map(() => "?").join(",");
          db.prepare(`DELETE FROM tournament_starts WHERE match_id IN (${matchMarks})`).run(...matchIds);
        }
        db.prepare(`DELETE FROM tournament_matches WHERE tournament_id IN (${tournamentMarks})`).run(...tournamentIds);
        db.prepare(`DELETE FROM tournament_entries WHERE tournament_id IN (${tournamentMarks})`).run(...tournamentIds);
        db.prepare(`DELETE FROM tournament_questions WHERE tournament_id IN (${tournamentMarks})`).run(...tournamentIds);
        db.prepare(`DELETE FROM tournaments WHERE id IN (${tournamentMarks})`).run(...tournamentIds);
      }
      if (questionIds.length) {
        const questionMarks = questionIds.map(() => "?").join(",");
        db.prepare(`DELETE FROM duel_questions WHERE question_id IN (${questionMarks})`).run(...questionIds);
        db.prepare(`DELETE FROM tournament_questions WHERE question_id IN (${questionMarks})`).run(...questionIds);
      }
      db.prepare(`DELETE FROM test_attempts WHERE lesson_id IN (${marks})`).run(...lessonIds);
      db.prepare(`DELETE FROM progress WHERE lesson_id IN (${marks})`).run(...lessonIds);
      db.prepare(`DELETE FROM purchases WHERE lesson_id IN (${marks})`).run(...lessonIds);
      db.prepare(`DELETE FROM likes WHERE lesson_id IN (${marks})`).run(...lessonIds);
      db.prepare(`DELETE FROM video_watch WHERE lesson_id IN (${marks})`).run(...lessonIds);
      db.prepare(`DELETE FROM lesson_viewers WHERE lesson_id IN (${marks})`).run(...lessonIds);
      db.prepare(`DELETE FROM test_sections WHERE lesson_id IN (${marks})`).run(...lessonIds);
      db.prepare(`DELETE FROM materials WHERE lesson_id IN (${marks})`).run(...lessonIds);
      db.prepare(`DELETE FROM questions WHERE lesson_id IN (${marks})`).run(...lessonIds);
      db.prepare(`DELETE FROM lessons WHERE id IN (${marks})`).run(...lessonIds);
    }
    db.prepare("UPDATE lessons SET position = 1 WHERE id = ?").run(replacement.id);
    metaSet(migrationKey, "1");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

replaceToifaTestBank();

function removeAttestationMockTests() {
  const migrationKey = "attestation_mock_tests_removed_2026_11";
  if (metaGet(migrationKey, "") === "1") return;
  const course = db.prepare("SELECT id FROM courses WHERE title = '2026 KUZ PLATFORMA MOCKLARI' ORDER BY id LIMIT 1").get();
  if (!course) {
    metaSet(migrationKey, "1");
    return;
  }
  const lessonIds = db.prepare("SELECT id FROM lessons WHERE course_id = ? AND type = 'test'").all(course.id).map((row) => Number(row.id));
  db.exec("BEGIN IMMEDIATE");
  try {
    if (lessonIds.length) {
      const marks = lessonIds.map(() => "?").join(",");
      const questionIds = db.prepare(`SELECT id FROM questions WHERE lesson_id IN (${marks})`).all(...lessonIds).map((row) => Number(row.id));
      const duelIds = db.prepare(`SELECT id FROM duels WHERE lesson_id IN (${marks})`).all(...lessonIds).map((row) => Number(row.id));
      const tournamentIds = db.prepare(`SELECT id FROM tournaments WHERE test_id IN (${marks})`).all(...lessonIds).map((row) => Number(row.id));
      if (duelIds.length) {
        const duelMarks = duelIds.map(() => "?").join(",");
        db.prepare(`DELETE FROM duel_questions WHERE duel_id IN (${duelMarks})`).run(...duelIds);
        db.prepare(`DELETE FROM duel_starts WHERE duel_id IN (${duelMarks})`).run(...duelIds);
        db.prepare(`DELETE FROM duel_plays WHERE duel_id IN (${duelMarks})`).run(...duelIds);
        db.prepare(`DELETE FROM duels WHERE id IN (${duelMarks})`).run(...duelIds);
      }
      if (tournamentIds.length) {
        const tournamentMarks = tournamentIds.map(() => "?").join(",");
        const matchIds = db.prepare(`SELECT id FROM tournament_matches WHERE tournament_id IN (${tournamentMarks})`).all(...tournamentIds).map((row) => Number(row.id));
        if (matchIds.length) {
          const matchMarks = matchIds.map(() => "?").join(",");
          db.prepare(`DELETE FROM tournament_starts WHERE match_id IN (${matchMarks})`).run(...matchIds);
        }
        db.prepare(`DELETE FROM tournament_matches WHERE tournament_id IN (${tournamentMarks})`).run(...tournamentIds);
        db.prepare(`DELETE FROM tournament_entries WHERE tournament_id IN (${tournamentMarks})`).run(...tournamentIds);
        db.prepare(`DELETE FROM tournament_questions WHERE tournament_id IN (${tournamentMarks})`).run(...tournamentIds);
        db.prepare(`DELETE FROM tournaments WHERE id IN (${tournamentMarks})`).run(...tournamentIds);
      }
      if (questionIds.length) {
        const questionMarks = questionIds.map(() => "?").join(",");
        db.prepare(`DELETE FROM duel_questions WHERE question_id IN (${questionMarks})`).run(...questionIds);
        db.prepare(`DELETE FROM tournament_questions WHERE question_id IN (${questionMarks})`).run(...questionIds);
      }
      for (const table of ["test_attempts", "progress", "purchases", "likes", "video_watch", "lesson_viewers", "test_sections", "materials", "questions"]) {
        db.prepare(`DELETE FROM ${table} WHERE lesson_id IN (${marks})`).run(...lessonIds);
      }
      db.prepare(`DELETE FROM lessons WHERE id IN (${marks})`).run(...lessonIds);
    }
    metaSet(migrationKey, "1");
    db.exec("COMMIT");
    console.log(`[migration] removed ${lessonIds.length} legacy mock tests`);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

removeAttestationMockTests();

function removeLegacyDirections() {
  const migrationKey = "legacy_cpd_bsb_chsb_removed_2026_11";
  if (metaGet(migrationKey, "") === "1") return;
  const courseIds = db.prepare("SELECT id FROM courses WHERE category IN ('cpd','other','bsb-chsb','bsb','chsb')")
    .all().map((row) => Number(row.id));
  db.exec("BEGIN IMMEDIATE");
  try {
    if (courseIds.length) {
      const marks = courseIds.map(() => "?").join(",");
      const lessonIds = db.prepare(`SELECT id FROM lessons WHERE course_id IN (${marks})`).all(...courseIds).map((row) => Number(row.id));
      if (lessonIds.length) {
        const lessonMarks = lessonIds.map(() => "?").join(",");
        const questionIds = db.prepare(`SELECT id FROM questions WHERE lesson_id IN (${lessonMarks})`).all(...lessonIds).map((row) => Number(row.id));
        const duelIds = db.prepare(`SELECT id FROM duels WHERE lesson_id IN (${lessonMarks})`).all(...lessonIds).map((row) => Number(row.id));
        const tournamentIds = db.prepare(`SELECT id FROM tournaments WHERE test_id IN (${lessonMarks})`).all(...lessonIds).map((row) => Number(row.id));
        if (duelIds.length) {
          const duelMarks = duelIds.map(() => "?").join(",");
          for (const table of ["duel_questions", "duel_starts", "duel_plays", "duels"]) {
            db.prepare(`DELETE FROM ${table} WHERE duel_id IN (${duelMarks})`).run(...duelIds);
          }
        }
        if (tournamentIds.length) {
          const tournamentMarks = tournamentIds.map(() => "?").join(",");
          const matchIds = db.prepare(`SELECT id FROM tournament_matches WHERE tournament_id IN (${tournamentMarks})`).all(...tournamentIds).map((row) => Number(row.id));
          if (matchIds.length) {
            const matchMarks = matchIds.map(() => "?").join(",");
            db.prepare(`DELETE FROM tournament_starts WHERE match_id IN (${matchMarks})`).run(...matchIds);
          }
          for (const table of ["tournament_matches", "tournament_entries", "tournament_questions", "tournaments"]) {
            db.prepare(`DELETE FROM ${table} WHERE tournament_id IN (${tournamentMarks})`).run(...tournamentIds);
          }
        }
        if (questionIds.length) {
          const questionMarks = questionIds.map(() => "?").join(",");
          db.prepare(`DELETE FROM duel_questions WHERE question_id IN (${questionMarks})`).run(...questionIds);
          db.prepare(`DELETE FROM tournament_questions WHERE question_id IN (${questionMarks})`).run(...questionIds);
        }
        for (const table of ["test_attempts", "progress", "purchases", "likes", "video_watch", "lesson_viewers", "test_sections", "materials", "questions"]) {
          db.prepare(`DELETE FROM ${table} WHERE lesson_id IN (${lessonMarks})`).run(...lessonIds);
        }
        db.prepare(`DELETE FROM lessons WHERE id IN (${lessonMarks})`).run(...lessonIds);
      }
      db.prepare(`DELETE FROM enrollments WHERE course_id IN (${marks})`).run(...courseIds);
      db.prepare(`DELETE FROM courses WHERE id IN (${marks})`).run(...courseIds);
    }
    metaSet(migrationKey, "1");
    db.exec("COMMIT");
    if (courseIds.length) console.log(`[migration] removed ${courseIds.length} CPD/BSB/CHSB courses and their content`);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

removeLegacyDirections();

/* Test guruhi kurslarini umumiy kurslar ro'yxatidan yashirish */
db.prepare(
  `UPDATE courses SET is_test_group = 1
  WHERE title IN ('Toifa testlari', '2026 KUZ PLATFORMA MOCKLARI', 'Attestatsiya Readinglari',
  'TKT MODULE 1', 'TKT MODULE 2', 'TKT MODULE 3')`
).run();

/* ------------------------------------------------------------------ utils */
const h = (v) =>
  String(v == null ? "": v)
.replace(/&/g, "&amp;")
.replace(/</g, "&lt;")
.replace(/>/g, "&gt;")
.replace(/"/g, "&quot;")
.replace(/'/g, "&#39;");

const nl2br = (s) => h(s).replace(/\r?\n/g, "<br>");
const testReadingHtml = (s) => h(s)
  .replace(/(neuroplasticity|magnetic resonance imaging \(MRI\)|MRI|spontaneous speech|crack|unstable|surge|This environmental degradation|These creative solutions|Furthermore|This economic pressure)/gi, '<mark class="reading-highlight">$1</mark>')
  .replace(/\r?\n/g, "<br>");

function renderLessonMarkdown(value) {
  const source = String(value == null ? "" : value).replace(/\r\n?/g, "\n");
  const inline = (line) => h(line)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/\*(?!\*)(.+?)\*(?!\*)/g, "<em>$1</em>")
    .replace(/(^|[^_])_([^_]+)_($|[^_])/g, "$1<em>$2</em>$3");
  const cells = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
  const isTableRule = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
  const lines = source.split("\n");
  const blocks = [];
  let paragraph = [];
  let listType = "";
  let listItems = [];
  let quote = [];
  let code = [];
  let inCode = false;
  const flushParagraph = () => {
    if (paragraph.length) blocks.push(`<p>${paragraph.map(inline).join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!listItems.length) return;
    blocks.push(`<${listType}>${listItems.map((item) => `<li>${inline(item)}</li>`).join("")}</${listType}>`);
    listItems = [];
    listType = "";
  };
  const flushQuote = () => {
    if (quote.length) blocks.push(`<blockquote>${quote.map(inline).join("<br>")}</blockquote>`);
    quote = [];
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*```/.test(line) || /^\s*~~~/.test(line)) {
      flushParagraph(); flushList(); flushQuote();
      if (inCode) {
        blocks.push(`<pre><code>${h(code.join("\n"))}</code></pre>`);
        code = [];
        inCode = false;
      } else inCode = true;
      continue;
    }
    if (inCode) { code.push(line); continue; }
    if (!line.trim()) { flushParagraph(); flushList(); flushQuote(); continue; }
    if (i + 1 < lines.length && line.includes("|") && isTableRule(lines[i + 1])) {
      flushParagraph(); flushList(); flushQuote();
      const headers = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) { rows.push(cells(lines[i])); i += 1; }
      i -= 1;
      blocks.push(`<div class="lesson-table-wrap"><table><thead><tr>${headers.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${headers.map((_, n) => `<td>${inline(row[n] || "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushParagraph(); flushList(); flushQuote();
      const level = Math.min(heading[1].length, 4) + 1;
      blocks.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) { flushParagraph(); flushList(); flushQuote(); blocks.push("<hr>"); continue; }
    const item = line.match(/^\s*(?:[-+*]|\d+[.)])\s+(.+)$/);
    if (item) {
      flushParagraph(); flushQuote();
      const nextType = /^\s*\d/.test(line) ? "ol" : "ul";
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      listItems.push(item[1]);
      continue;
    }
    const quoted = line.match(/^\s*>\s?(.*)$/);
    if (quoted) { flushParagraph(); flushList(); quote.push(quoted[1]); continue; }
    flushList(); flushQuote(); paragraph.push(line);
  }
  if (inCode) blocks.push(`<pre><code>${h(code.join("\n"))}</code></pre>`);
  flushParagraph(); flushList(); flushQuote();
  return blocks.join("\n");
}

function safeNext(value) {
  const next = String(value || "");
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next: "";
}

function detectLang(req) {
  const value = parseCookies(req).ht_lang;
  return LANG_CODES.includes(value) ? value: "uz";
}

const TYPE_LABEL = { text: "Matn", pdf: "PDF", video: "Video", test: "Test" };

function adminBulkSaveBar(itemLabel, count) {
  if (!count) return "";
  return `<div class="admin-test-savebar"><button class="btn btn-primary" id="saveAllTestEdits" type="button">O'zgarishlarni saqlash</button><span class="muted small" id="testSaveStatus" aria-live="polite"></span></div>
  <script>(function(){var button=document.getElementById('saveAllTestEdits');if(!button)return;var status=document.getElementById('testSaveStatus');var saveLabel=${JSON.stringify(itemLabel)};button.addEventListener('click',async function(){var forms=Array.from(document.querySelectorAll('form[data-bulk-save]'));if(!forms.length)return;button.disabled=true;button.textContent='Saqlanmoqda...';if(status)status.textContent='';try{for(var form of forms){var values=new URLSearchParams(new FormData(form));var response=await fetch(form.action,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:values.toString()});if(!response.ok)throw new Error('save');}button.textContent='Saqlandi';if(status)status.textContent="Barcha "+saveLabel+" o'zgarishlari saqlandi.";setTimeout(function(){location.reload();},500);}catch(e){button.disabled=false;button.textContent='Qayta saqlash';if(status)status.textContent='Saqlashda xatolik yuz berdi. Qayta urinib ko'ring.';}});})();</script>`;
}
const DIRECTIONS = [
  { id: "attestation", title: "Attestatsiya", description: "Ingliz tili o'qituvchilari uchun toifa attestatsiyasiga tayyorgarlik." },
  { id: "tkt", title: "TKT", description: "Teaching Knowledge Test modullari va metodika bo'yicha sinovlar." }
];
const DIRECTION_IDS = DIRECTIONS.map((direction) => direction.id);
const CAT_LABEL = { attestation: "Attestatsiya", tkt: "TKT" };
function categoryLabel(category) {
  return CAT_LABEL[category] || "Attestatsiya";
}

function directionCategories(category) {
  return [category];
}

function icon(name) {
  const icons = {
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M6.5 15H19"/>',
  play: '<circle cx="12" cy="12" r="8.5"/><path d="m10 8.5 5 3.5-5 3.5z"/>',
  quiz: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.2a2.6 2.6 0 1 1 3.8 2.4c-.8.4-1.2.9-1.2 1.9"/><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none"/>',
  heart:
  '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8Z"/>',
  eye: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  tag: '<path d="M20 13 11 22l-8-8 9-9h8z"/><circle cx="16" cy="8" r="1.4"/>',
  file: '<path d="M14 3H6a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.5-1.5V8.5z"/><path d="M14 3v5.5h5.5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  swords: '<path d="m14.5 4.5 5 5M4 20l5-5M4 4l7 7M20 20l-7-7"/><path d="m16 16 4 4M4 20l2-2M18 4l2 2"/>',
  layers: '<path d="m12 3 8 4.5-8 4.5-8-4.5z"/><path d="m4 12 8 4.5 8-4.5"/><path d="m4 16.5 8 4.5 8-4.5"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || ""}</svg>`;
}

function send(res, status, body, headers = {}) {
  if (res.lang && res.lang !== "uz" && typeof body === "string" && body.includes("<!DOCTYPE html>")) {
  body = translateHtml(body, res.lang);
  }
  res.writeHead(status, {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
...headers
  });
  res.end(body);
}

function redirect(res, location, extraHeaders = {}) {
  res.writeHead(303, { Location: location,...extraHeaders });
  res.end();
}

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || "";
  raw.split(";").forEach((part) => {
  const i = part.indexOf("=");
  if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function clientIp(req) {
  const forwarded = String(req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket.remoteAddress || "unknown";
}

function cookie(name, value, maxAge, req) {
  const secure = (req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
  const age = maxAge ? `; Max-Age=${maxAge}` : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax${age}${
  secure ? "; Secure": ""
  }`;
}

function accessCode() {
  return metaGet("access_code", "2026") || "2026";
}

function accessToken(code) {
  return createHmac("sha256", config.telegramBotToken || "ht-access")
.update(String(code || ""))
.digest("hex");
}

function hasPlatformAccess(req) {
  const token = parseCookies(req).ht_access;
  return !!token && token === accessToken(accessCode());
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch (e) {
  return false;
  }
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

const MEDIA_SECRET = randomBytes(32);
const LOGIN_SECRET = randomBytes(32);
function loginCodeHash(phone, code) {
  return createHmac("sha256", LOGIN_SECRET).update(`${phone}:${code}`).digest("hex");
}
function mediaToken(lessonId, userId) {
  const exp = Math.floor(Date.now() / 1000) + 14400;
  const sig = createHmac("sha256", MEDIA_SECRET)
    .update(`${lessonId}:${userId}:${exp}`)
    .digest("hex")
    .slice(0, 32);
  return `${exp}.${sig}`;
}

function mediaTokenValid(lessonId, userId, token) {
  const [expRaw, sig] = String(token || "").split(".");
  const exp = Number(expRaw);
  if (!exp || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = createHmac("sha256", MEDIA_SECRET)
    .update(`${lessonId}:${userId}:${exp}`)
    .digest("hex")
    .slice(0, 32);
  return safeEqual(sig || "", expected);
}

function telegramUserFromInitData(initData) {
  try {
  const params = new URLSearchParams(String(initData || ""));
  const hash = params.get("hash");
  if (!hash || !config.telegramBotToken) return null;
  params.delete("hash");
  const dataCheckString = [...params.entries()]
.sort(([a], [b]) => a.localeCompare(b))
.map(([key, value]) => `${key}=${value}`)
.join("\n");
  const secret = createHmac("sha256", "WebAppData").update(config.telegramBotToken).digest();
  const calculated = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (calculated.length !== hash.length || !timingSafeEqual(Buffer.from(calculated), Buffer.from(hash))) {
  return null;
  }
  const user = JSON.parse(params.get("user") || "null");
  return user && user.id ? user: null;
  } catch (e) {
  return null;
  }
}

function normalizePhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("998")) digits = digits.slice(3);
  else if (digits.length === 10 && digits.startsWith("8")) digits = digits.slice(1);
  if (digits.length !== 9) return digits;
  return "998" + digits;
}

// Eski yozuvlarda +998, bo'shliq yoki ajratgichlar saqlangan bo'lsa ham,
// ayni raqam bilan akkaunt topilsin. Yangi akkauntlar esa doim kanonik raqamda saqlanadi.
function findUserByPhone(phone, columns = "*") {
  const canonical = normalizePhone(phone);
  const exact = db.prepare(`SELECT ${columns} FROM users WHERE phone = ?`).get(canonical);
  if (exact) return exact;
  return db.prepare(`SELECT ${columns} FROM users`).all().find((row) => normalizePhone(row.phone) === canonical) || null;
}

function formatLocalPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("998")) digits = digits.slice(3);
  else if (digits.length === 10 && digits.startsWith("8")) digits = digits.slice(1);
  digits = digits.slice(0, 9);
  return [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)]
    .filter(Boolean)
    .join(" ");
}

function validPhone(digits) {
  return /^998\d{9}$/.test(digits);
}

function validPhoneInput(value) {
  const raw = String(value || "").trim();
  if (!raw || !/^[+\d\s()-]+$/.test(raw)) return false;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("998")) digits = digits.slice(3);
  else if (digits.length === 10 && digits.startsWith("8")) digits = digits.slice(1);
  return /^\d{9}$/.test(digits);
}

function normalizeBirthDate(value) {
  const match = String(value || "").trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return "";
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText), month = Number(monthText), year = Number(yearText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  const today = tashkentClock().day;
  if (`${yearText}-${monthText}-${dayText}` > today) return "";
  return `${yearText}-${monthText}-${dayText}`;
}

function passwordPolicyError(password) {
  if (password.length < 8) return "Parol kamida 8 ta belgidan iborat bo'lishi kerak.";
  if (password.length > 64) return "Parol 64 ta belgidan oshmasligi kerak.";
  if (!/[A-Z]/.test(password)) return "Parolda kamida bitta katta lotin harfi bo'lishi kerak.";
  if (!/[a-z]/.test(password)) return "Parolda kamida bitta kichik lotin harfi bo'lishi kerak.";
  if (!/[0-9]/.test(password)) return "Parolda kamida bitta raqam bo'lishi kerak.";
  if (!/[^A-Za-z0-9\s]/.test(password)) return "Parolda kamida bitta maxsus belgi bo'lishi kerak.";
  return "";
}

function passwordRequirementsMarkup() {
  return '<small class="password-hint">Kamida 8 ta belgi: katta va kichik lotin harfi, raqam hamda maxsus belgi. Eng ko\'pi 64 ta belgi.</small>';
}
function registrationPasswordInput(name, autocomplete, placeholder = "") {
  return `<span class="password-input-wrap"><input name="${h(name)}" type="password" required minlength="8" maxlength="64" autocomplete="${h(autocomplete)}"${placeholder ? ` placeholder="${h(placeholder)}"` : ""}><button class="password-toggle" type="button" data-password-toggle aria-label="Parolni ko'rsat" aria-pressed="false" onclick="var i=this.parentElement.querySelector('input');if(!i)return;var show=i.type==='password';i.type=show?'text':'password';this.setAttribute('aria-pressed',String(show));var en=document.documentElement.lang==='en';this.setAttribute('aria-label',show?(en?'Hide password':'Parolni yashir'):(en?'Show password':'Parolni ko‘rsat'))"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></span>`;
}

function resetPasswordForm(phone, token, error = "") {
  return `<section class="login-modern"><div class="login-card">
    <h1 class="login-title">Yangi parol o'rnating</h1>
    <p class="login-sub">Telegram tasdiqlash kodi qabul qilindi. Yangi parolni shu yerda belgilang.</p>
    ${error ? alertBox(error, "error") : ""}
    <form method="post" action="/login/reset/password" class="login-form" autocomplete="on">
      <input type="hidden" name="phone" value="${h(phone)}">
      <input type="hidden" name="reset_token" value="${h(token)}">
      <div class="field"><label>Yangi parol</label><input name="password" type="password" required minlength="8" maxlength="64" autocomplete="new-password">${passwordRequirementsMarkup()}</div>
      <div class="field"><label>Parolni tasdiqlang</label><input name="password_confirm" type="password" required minlength="8" maxlength="64" autocomplete="new-password"></div>
      <button class="btn-continue" type="submit">Parolni saqlash</button>
    </form>
  </div></section>`;
}

function normalizeTelegramUsername(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\/(t\.me|telegram\.me)\//i, "")
    .replace(/^@+/, "")
    .replace(/[^A-Za-z0-9_]/g, "")
    .slice(0, 32);
}

function validTelegramUsername(name) {
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(name);
}

function botLink() {
  const username = String(config.telegramBotUsername || "").replace(/^@/, "");
  if (username) return `https://t.me/${username}`;
  return String(config.telegram || "https://t.me/");
}

function botStartLink(payload) {
  const base = botLink();
  if (!base.includes("t.me/")) return base;
  return `${base}?start=${encodeURIComponent(payload)}`;
}

function duelBotStartLink(code) {
  const username = String(config.telegramBotUsername || "").replace(/^@/, "");
  return username ? `https://t.me/${username}?start=duel_${encodeURIComponent(code)}` : "";
}

function duelTelegramShareUrl(code, inviterName = "") {
  const base = platformPublicUrl() || "https://habibateacher.uz";
  const duelUrl = `${base}/duel/${encodeURIComponent(code)}`;
  const duel = getDuel(code);
  const inviter = duel && db.prepare("SELECT telegram_username FROM users WHERE id = ?").get(duel.creator_id);
  const username = String(inviter?.telegram_username || "").replace(/^@+/, "").trim();
  const name = `${inviterName}${username ? ` (@${username})` : ""}`;
  const text = `${name ? `${name} sizni ` : "Sizni "}Habiba Teacher platformasida duelga chaqiryapti! Havolani ochib, taklifni qabul qiling.`;
  return `https://t.me/share/url?url=${encodeURIComponent(duelUrl)}&text=${encodeURIComponent(text)}`;
}

function resolveTelegramChatId(userRow) {
  if (!userRow) return "";
  if (userRow.telegram_id) return String(userRow.telegram_id);
  if (!userRow.telegram_username) return "";
  const row = db
    .prepare("SELECT chat_id FROM telegram_users WHERE username = ? COLLATE NOCASE")
    .get(String(userRow.telegram_username).toLowerCase());
  if (!row) return "";
  db.prepare("UPDATE users SET telegram_id = ? WHERE id = ?").run(row.chat_id, userRow.id);
  userRow.telegram_id = row.chat_id;
  return String(row.chat_id);
}

/* --------------------------------------------------------------- sessions */
function currentUser(req) {
  const token = parseCookies(req).ht_session;
  if (!token) return null;
  const row = db
.prepare(
  `SELECT u.id, u.name, u.phone, u.created_at, u.contract_accepted_at, u.is_blocked, u.is_author
  FROM sessions s JOIN users u ON u.id = s.user_id
  WHERE s.token = ? AND s.expires_at > ?`
  )
.get(token, Date.now());
  return row && !Number(row.is_blocked) ? row : null;
}

function isAdmin(req) {
  const token = parseCookies(req).ht_admin;
  if (!token) return false;
  const row = db
.prepare("SELECT 1 AS ok FROM admin_sessions WHERE token = ? AND expires_at > ?")
.get(token, Date.now());
  return !!row;
}

function createUserSession(res, userId, req) {
  const token = randomBytes(32).toString("hex");
  const maxAge = 3 * 24 * 60 * 60;
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(
  token,
  userId,
  Date.now() + maxAge * 1000
  );
  db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(nowISO(), userId);
  res.setHeader("Set-Cookie", cookie("ht_session", token, maxAge, req));
}

function createDeviceSession(res, userId, req) {
  const existingToken = parseCookies(req).ht_device || "";
  const existing = existingToken ? db.prepare("SELECT user_id FROM device_sessions WHERE token = ?").get(existingToken) : null;
  if (existing && Number(existing.user_id) === Number(userId)) {
    db.prepare("UPDATE device_sessions SET last_seen = ? WHERE token = ?").run(nowISO(), existingToken);
    return;
  }
  const token = randomBytes(32).toString("hex");
  db.prepare("INSERT INTO device_sessions (token, user_id, created_at, last_seen) VALUES (?, ?, ?, ?)").run(
    token,
    userId,
    nowISO(),
    nowISO()
  );
  const value = cookie("ht_device", token, 3 * 24 * 60 * 60, req);
  const prev = res.getHeader("Set-Cookie");
  res.setHeader("Set-Cookie", prev ? [].concat(prev, value) : value);
}

function createAdminSession(res, req) {
  const token = randomBytes(32).toString("hex");
  const maxAge = 2 * 60 * 60;
  db.prepare("INSERT INTO admin_sessions (token, expires_at) VALUES (?, ?)").run(
  token,
  Date.now() + maxAge * 1000
  );
  res.setHeader("Set-Cookie", cookie("ht_admin", token, null, req));
}

function clearCookie(res, name) {
  const value = `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  const prev = res.getHeader("Set-Cookie");
  res.setHeader("Set-Cookie", prev ? [].concat(prev, value) : value);
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
  return new URL(origin).host === req.headers.host;
  } catch (e) {
  return false;
  }
}

/* ---------------------------------------------------------- login limiting */
const attempts = new Map();

function lockedFor(ip) {
  const rec = attempts.get(ip);
  if (!rec) return 0;
  if (rec.until > Date.now()) return Math.ceil((rec.until - Date.now()) / 1000);
  attempts.delete(ip);
  return 0;
}

function noteFailure(ip) {
  const rec = attempts.get(ip) || { count: 0, until: 0 };
  rec.count += 1;
  if (rec.count >= 5) {
  rec.until = Date.now() + 5 * 60 * 1000;
  rec.count = 0;
  }
  attempts.set(ip, rec);
}

function clearFailures(ip) {
  attempts.delete(ip);
}

/* ------------------------------------------------------------------ views */
function navFor(user, admin, publicPage = false) {
  const copy = siteTexts();
  if (admin && !publicPage) {
  return `<nav class="nav">
  <a href="/admin" class="active">Admin</a>
  <a href="/admin/students">O'quvchilar</a>
  <a href="/admin/site-settings">Sayt sozlamalari</a>
  <a href="/leaderboard">Reyting</a>
  <a href="/">Saytni ko'rish</a>
  <form method="post" action="/admin/logout"><button class="link" type="submit">Chiqish</button></form>
  </nav>`;
  }

  const links = `
  ${siteButtonVisible("nav_home") && String(copy.nav_home || "").trim() ? `<a href="/">${h(copy.nav_home)}</a>` : ""}
  ${newsNavigationLink(user)}
  ${siteButtonVisible("nav_attestation") && String(copy.nav_attestation || "").trim() ? `<a href="/attestation">${h(copy.nav_attestation)}</a>` : ""}
  ${siteButtonVisible("nav_tkt") && String(copy.nav_tkt || "").trim() ? `<a href="/tkt">${h(copy.nav_tkt)}</a>` : ""}
  ${siteButtonVisible("nav_duel") && String(copy.nav_duel || "").trim() ? `<a href="/duel">${h(copy.nav_duel)}</a>` : ""}
  ${siteButtonVisible("nav_plans") && String(copy.nav_plans || "").trim() ? `<a href="/plans">${h(copy.nav_plans)}</a>` : ""}
  ${siteButtonVisible("nav_leaderboard") && String(copy.nav_leaderboard || "").trim() ? `<a href="/leaderboard">${h(copy.nav_leaderboard)}</a>` : ""}`;

  if (user) {
  return `<nav class="nav nav-student">
  ${siteButtonVisible("nav_home") && String(copy.nav_home || "").trim() ? `<a href="/">${h(copy.nav_home)}</a>` : ""}
  ${newsNavigationLink(user)}
  ${siteButtonVisible("nav_attestation") && String(copy.nav_attestation || "").trim() ? `<a href="/attestation">${h(copy.nav_attestation)}</a>` : ""}
  ${siteButtonVisible("nav_tkt") && String(copy.nav_tkt || "").trim() ? `<a href="/tkt">${h(copy.nav_tkt)}</a>` : ""}
  ${siteButtonVisible("nav_duel") && String(copy.nav_duel || "").trim() ? `<a href="/duel">${h(copy.nav_duel)}</a>` : ""}
  <a href="/dashboard">${h(siteTexts().dashboard_page_title || "Kabinet")}</a>
  ${Number(user.is_author) ? `<a href="/author">Muallif paneli</a>` : ""}
  ${siteButtonVisible("nav_leaderboard") && String(copy.nav_leaderboard || "").trim() ? `<a href="/leaderboard">${h(copy.nav_leaderboard)}</a>` : ""}
  ${siteButtonVisible("nav_plans") && String(copy.nav_plans || "").trim() ? `<a class="btn btn-sm student-plan" href="/plans">${h(copy.nav_plans)}</a>` : ""}
  <span class="who">${h(user.name)}</span>
  <form method="post" action="/logout"><button class="link" type="submit">Chiqish</button></form>
  </nav>`;
  }

  return `<nav class="nav">${links}
  ${siteButtonVisible("nav_login") ? `<a class="btn btn-sm" href="/login">Kirish</a>` : ""}
  </nav>`;
}

function layout(opts) {
  const { title, body, admin = false } = opts;
  const copy = siteTexts();
  const user = opts.user || null;
  const isStudentPage = Boolean(user) && !admin;
  const isDashboard = body.includes('class="dash-hero"');
  const publicPage = Object.prototype.hasOwnProperty.call(opts, "user");
  const appInstallGate = !admin && !String(title).startsWith("Admin") && (!user || user.contract_accepted_at) ? `<div class="install-gate" id="appInstallGate" hidden role="dialog" aria-modal="true" aria-labelledby="appInstallTitle"><div class="install-gate-card"><span class="eyebrow">HABIBA TEACHER ILOVASI</span><h2 id="appInstallTitle">Ilovani qurilmangizga o'rnating</h2><p>Platformaga tez kirish va testlarni qulay ishlatish uchun Habiba Teacher ilovasini bosh ekranga qo'shing.</p><div class="actions"><button class="btn btn-primary" type="button" data-install-now>Ilovani o'rnatish</button><button class="btn btn-ghost" type="button" data-install-later>Hozircha davom etish</button></div><p class="muted small install-gate-help">iPhone yoki iPad'da Share tugmasini bosib, “Add to Home Screen”ni tanlang.</p></div></div><script>(function(){var gate=document.getElementById('appInstallGate');if(!gate)return;var installPrompt=null;var standalone=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone;if(standalone)return;try{if(sessionStorage.getItem('ht_install_gate_seen')==='1')return}catch(e){}if('serviceWorker' in navigator)navigator.serviceWorker.register('/service-worker.js?v=26').catch(function(){});window.addEventListener('beforeinstallprompt',function(event){event.preventDefault();installPrompt=event});function close(){gate.hidden=true;document.body.classList.remove('install-gate-open');try{sessionStorage.setItem('ht_install_gate_seen','1')}catch(e){}}gate.hidden=false;document.body.classList.add('install-gate-open');gate.querySelector('[data-install-later]').addEventListener('click',close);gate.querySelector('[data-install-now]').addEventListener('click',async function(){if(installPrompt){var prompt=installPrompt;installPrompt=null;await prompt.prompt();await prompt.userChoice;close();return}var english=document.documentElement.lang==='en';window.alert(english?( /iPhone|iPad|iPod/i.test(navigator.userAgent)?"Tap Share and choose 'Add to Home Screen'.":"In your browser menu, choose 'Install app' or 'Add to Home screen'."):(/iPhone|iPad|iPod/i.test(navigator.userAgent)?"Share tugmasini bosing va 'Add to Home Screen'ni tanlang.":"Brauzer menyusidan 'Ilovani o'rnatish' yoki 'Bosh ekranga qo'shish'ni tanlang."));close()})})();</script>` : "";
  const seo = opts.seo || {};
  const description = seo.description || "Habiba teacher — O'zbekistondagi ingliz tili o'qituvchilari uchun attestatsiya testlari, TKT tayyorgarligi, metodika va onlayn kurslar.";
  const canonical = seo.path ? `https://habibateacher.uz${seo.path}` : "";
  const openGraphUrl = seo.ogUrl || canonical;
  const robots = seo.noindex || !seo.path || !publicPage || user ? "noindex, nofollow" : "index, follow, max-image-preview:large";
  const seoTags = `
<meta name="description" content="${h(description)}">
<meta name="robots" content="${robots}">
<meta name="googlebot" content="${robots}">
<meta name="yandex" content="${robots}">
${seo.keywords ? `<meta name="keywords" content="${h(seo.keywords)}">` : ""}
${canonical ? `<link rel="canonical" href="${canonical}">` : ""}
<meta property="og:type" content="website">
<meta property="og:site_name" content="${h(siteBrandName())}">
<meta property="og:title" content="${h(seo.title || `${title} | ${siteBrandName()}`)}">
<meta property="og:description" content="${h(description)}">
${openGraphUrl ? `<meta property="og:url" content="${openGraphUrl}">` : ""}
${canonical === "https://habibateacher.uz/" ? '<meta property="og:image" content="https://habibateacher.uz/img/habiba-portrait.jpg?v=20261124-2">' : ""}
<meta name="twitter:card" content="summary_large_image">`;
  return `<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#080611">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="apple-touch-icon" href="/img/habiba-app-icon-192.png">
<title>${h(title)}   ${h(siteBrandName())}</title>
${seoTags}
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='9' fill='%2312b5a6'/%3E%3Ctext x='16' y='22' font-family='Arial' font-size='18' font-weight='bold' text-anchor='middle' fill='%2303211d'%3EH%3C/text%3E%3C/svg%3E">
<script async src="https://telegram.org/js/telegram-web-app.js"></script>
<script>try{document.documentElement.dataset.theme=localStorage.getItem('ht_theme')||'dark';}catch(e){document.documentElement.dataset.theme='dark';}</script>
<link rel="stylesheet" href="/assets/platform.css?v=20261125bright1">
</head>
<body${admin && !publicPage ? ` class="admin-page"` : isStudentPage ? ` class="student-page${isDashboard ? " is-dashboard" : ""}"` : ""}>
<header class="topbar">
  <div class="wrap bar">
  <a class="brand" href="${admin ? "/admin": user ? "/attestation": "/"}">
  <span class="mark">H</span>
  <span>${h(siteBrandName())}</span>
  <span class="tag">${admin ? "Admin": "Platforma"}</span>
  </a>
  <div class="bar-right">
  ${navFor(user, admin, publicPage)}
  <div class="prefs">
  <div class="lang-switch" aria-label="Til">
  <a href="/lang/uz" class="lang-uz">UZ</a>
  <a href="/lang/en" class="lang-en">EN</a>
  </div>
  <button class="theme-toggle" type="button" data-theme-toggle aria-label="Kunduzgi va tungi rejim">
  <span class="theme-sun"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></span>
  <span class="theme-moon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z"/></svg></span>
  </button>
  </div>
  ${isDashboard ? "" : `<button class="app-refresh" type="button" data-app-refresh aria-label="Ilovani serverdan yangilash" title="Serverdagi so'nggi o'zgarishlarni yuklash"><span aria-hidden="true">⟳</span><b>Yangilash</b></button>`}
  ${publicPage && siteButtonVisible("nav_login") ? `<a class="mobile-header-login" href="${user ? "/dashboard" : "/login"}">${user ? h(siteTexts().dashboard_page_title || "Kabinet") : "Kirish"}</a>` : ""}
  <button class="menu-toggle" type="button" id="menuToggle" aria-label="Menyu" aria-expanded="false">
  <span></span><span></span><span></span>
  </button>
  </div>
  </div>
  <div class="mobile-menu" id="mobileMenu" hidden>
  <nav class="mobile-links">
  ${
  admin && !publicPage
  ? `<a href="/admin">Admin</a><a href="/admin/students">O'quvchilar</a><a href="/admin/site-settings">Sayt sozlamalari</a><a href="/leaderboard">Reyting</a><a href="/">Saytni ko'rish</a>
  <form method="post" action="/admin/logout"><button class="mobile-link-btn" type="submit">Chiqish</button></form>`
   : `${siteButtonVisible("nav_home") && String(copy.nav_home || "").trim() ? `<a href="/">${h(copy.nav_home)}</a>` : ""}${newsNavigationLink(user)}
  ${siteButtonVisible("nav_attestation") && String(copy.nav_attestation || "").trim() ? `<a href="/attestation">${h(copy.nav_attestation)}</a>` : ""}
  ${siteButtonVisible("nav_tkt") && String(copy.nav_tkt || "").trim() ? `<a href="/tkt">${h(copy.nav_tkt)}</a>` : ""}
  ${siteButtonVisible("nav_duel") && String(copy.nav_duel || "").trim() ? `<a href="/duel">${h(copy.nav_duel)}</a>` : ""}
  ${siteButtonVisible("nav_plans") && String(copy.nav_plans || "").trim() ? `<a href="/plans">${h(copy.nav_plans)}</a>` : ""}
  ${siteButtonVisible("nav_leaderboard") && String(copy.nav_leaderboard || "").trim() ? `<a href="/leaderboard">${h(copy.nav_leaderboard)}</a>` : ""}
  ${
  user
  ? `<div class="mobile-user">${h(user.name)}</div>
  <a href="/dashboard">${h(siteTexts().dashboard_page_title || "Kabinet")}</a>
  <form method="post" action="/logout"><button class="mobile-link-btn" type="submit">Chiqish</button></form>`
: ""
  }`
  }
  </nav>
  <div class="mobile-prefs">
  <div class="lang-switch" aria-label="Til">
  <a href="/lang/uz" class="lang-uz">UZ</a>
  <a href="/lang/en" class="lang-en">EN</a>
  </div>
  <button class="theme-toggle" type="button" data-theme-toggle aria-label="Kunduzgi va tungi rejim">
  <span class="theme-sun"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></span>
  <span class="theme-moon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8Z"/></svg></span>
  </button>
  </div>
  </div>
</header>
<main class="wrap page${body.includes('class="landing-home"') ? " page-home" : ""}">
${body.includes("home-hero") ? "" : `<a class="page-back" href="/" onclick="if(history.length>1){history.back();return false;}">&larr; Orqaga</a>`}
${body}
</main>
<footer class="site-footer">
  <div class="wrap footer-grid">
  <div class="footer-brand">
  <a class="brand" href="/">
  <span class="mark">H</span>
  <span>${h(siteBrandName())}</span>
  </a>
  <p>${h(copy.footer_tagline)}</p>
  <p class="footer-donation-note">Ustozlarimizga ko‘mak bo‘lsin deya, ushbu materiallar Habiba Mo'minjonovna tomonidan taqdim etildi.</p>
  </div>
  <nav class="footer-links">
  ${siteButtonVisible("nav_home") && String(copy.nav_home || "").trim() ? `<a href="/">${h(copy.nav_home)}</a>` : ""}
  ${newsNavigationLink(user)}
  ${siteButtonVisible("footer_directions") ? `<a href="/#directions">Yo'nalishlar</a>` : ""}
  ${siteButtonVisible("nav_attestation") && String(copy.nav_attestation || "").trim() ? `<a href="/attestation">${h(copy.nav_attestation)}</a>` : ""}
  ${siteButtonVisible("nav_tkt") && String(copy.nav_tkt || "").trim() ? `<a href="/tkt">${h(copy.nav_tkt)}</a>` : ""}
  ${siteButtonVisible("nav_duel") && String(copy.nav_duel || "").trim() ? `<a href="/duel">${h(copy.nav_duel)}</a>` : ""}
  ${siteButtonVisible("nav_plans") && String(copy.nav_plans || "").trim() ? `<a href="/plans">${h(copy.nav_plans)}</a>` : ""}
  ${siteButtonVisible("nav_leaderboard") && String(copy.nav_leaderboard || "").trim() ? `<a href="/leaderboard">${h(copy.nav_leaderboard)}</a>` : ""}
  ${siteButtonVisible("footer_about") && String(copy.footer_about || "").trim() ? `<a href="/#about">${h(copy.footer_about)}</a>` : ""}
  </nav>
  <div class="footer-contact">
  ${siteButtonVisible("footer_telegram") && config.telegram ? `<a href="${h(config.telegram)}" target="_blank" rel="noopener">Telegram</a>` : ""}
  ${siteButtonVisible("footer_phone") && config.phone ? `<a href="tel:${h(String(config.phone).replace(/[^\d+]/g, ""))}">${h(config.phone)}</a>` : ""}
  </div>
  </div>
</footer>
${
user && !user.contract_accepted_at
? `<div class="contract-overlay" id="contractOverlay">
<div class="contract-modal">
<div class="contract-head">
<span class="contract-ico">H</span>
<div><b>Ta'lim shartnomasi</b><small>Davom etish uchun shartnomani o'qing va qabul qiling</small></div>
</div>
<div class="contract-body">${nl2br(contractText())}</div>
<form method="post" action="/contract/accept" class="contract-foot">
<label class="contract-check"><input type="checkbox" id="contractAgree"> <span>Shartnoma shartlariga to'liq roziman</span></label>
<button class="btn btn-primary" type="submit" id="contractBtn" disabled>Qabul qilaman</button>
</form>
</div>
</div>
<script>
(function () {
var c = document.getElementById('contractAgree');
var b = document.getElementById('contractBtn');
if (!c || !b) return;
c.addEventListener('change', function () { b.disabled = !c.checked; });
})();
</script>`
: ""
}
${appInstallGate}
<script>(function(){var links=Array.prototype.slice.call(document.querySelectorAll('[data-news-nav]'));if(!links.length)return;var english=document.documentElement.lang==='en';var first=links[0];var viewer=first.getAttribute('data-news-viewer')||'guest';var key='ht_news_seen_v2_'+viewer;var ids=[];var seen=[];try{ids=JSON.parse(first.getAttribute('data-news-ids')||'[]');seen=JSON.parse(localStorage.getItem(key)||'[]')}catch(e){}if(!Array.isArray(ids))ids=[];if(!Array.isArray(seen))seen=[];if(location.pathname==='/news'){seen=Array.from(new Set(seen.concat(ids)));try{localStorage.setItem(key,JSON.stringify(seen))}catch(e){}}var unread=ids.filter(function(id){return seen.indexOf(id)<0}).length;links.forEach(function(link){var badge=link.querySelector('[data-news-badge]');link.classList.toggle('has-unread',unread>0);link.setAttribute('aria-label',unread?(english?unread+' new updates':'Yangiliklar, '+unread+' ta yangi xabar'):(english?'News':'Yangiliklar'));if(badge){badge.hidden=unread===0;badge.textContent=unread?String(unread):''}})})();</script>
<script>
(function () {
  document.querySelectorAll('input[data-phone]').forEach(function (input) {
  function format() {
  var d = input.value.replace(/\\D/g, '');
  if (d.indexOf('998') === 0) d = d.slice(3);
  if (d.length > 9 && d.charAt(0) === '8') d = d.slice(1);
  d = d.slice(0, 9);
  var out = '+998';
  if (d.length) out += ' ' + d.slice(0, 2);
  if (d.length > 2) out += ' ' + d.slice(2, 5);
  if (d.length > 5) out += ' ' + d.slice(5, 7);
  if (d.length > 7) out += ' ' + d.slice(7, 9);
  input.value = out;
  }
  input.addEventListener('focus', function () {
  if (!input.value.trim()) input.value = '+998 ';
  });
  input.addEventListener('input', format);
  input.addEventListener('blur', function () {
  if (input.value.replace(/\\D/g, '') === '998') input.value = '';
  });
  });

  document.querySelectorAll('[data-theme-toggle]').forEach(function (themeBtn) {
  themeBtn.addEventListener('click', function () {
  var root = document.documentElement;
  var light = root.getAttribute('data-theme') === 'light';
  if (light) {
  root.setAttribute('data-theme', 'dark');
  try { localStorage.setItem('ht_theme', 'dark'); } catch (e) {}
  } else {
  root.setAttribute('data-theme', 'light');
  try { localStorage.setItem('ht_theme', 'light'); } catch (e) {}
  }
  });
  });

  var menuToggle = document.getElementById('menuToggle');
  var mobileMenu = document.getElementById('mobileMenu');
  if (menuToggle && mobileMenu) {
  function setMenu(open) {
  mobileMenu.hidden = !open;
  menuToggle.classList.toggle('open', open);
  menuToggle.setAttribute('aria-expanded', open ? 'true': 'false');
  document.body.style.overflow = open ? 'hidden': '';
  }
  menuToggle.addEventListener('click', function () { setMenu(mobileMenu.hidden); });
  mobileMenu.querySelectorAll('a,.mobile-links button').forEach(function (el) {
  el.addEventListener('click', function () {
  if (!el.closest('form')) setMenu(false);
  });
  });
  document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && !mobileMenu.hidden) setMenu(false);
  });
  }

  function fillTelegramFields() {
  if (!window.Telegram || !window.Telegram.WebApp) return false;
  try {
  var tg = window.Telegram.WebApp;
  tg.ready();
  var tgUser = tg.initDataUnsafe && tg.initDataUnsafe.user;
  if (tgUser && tgUser.id) {
  var tgIdInput = document.querySelector('input[name="telegram_id"]');
  if (tgIdInput && !tgIdInput.value) tgIdInput.value = tgUser.id;
  var tgDataInput = document.querySelector('input[name="tg_init_data"]');
  if (tgDataInput) tgDataInput.value = tg.initData || '';
  }
  return true;
  } catch (e) {
  return false;
  }
  }
  if (!fillTelegramFields()) {
  var tgTries = 0;
  var tgTimer = setInterval(function () {
  if (fillTelegramFields() || ++tgTries > 20) clearInterval(tgTimer);
  }, 300);
  }

  document.querySelectorAll('[data-birth-date]').forEach(function (input) {
    function formatDate(value) {
      var digits = String(value || '').replace(/\\D/g, '').slice(0, 8);
      if (digits.length <= 2) return digits;
      if (digits.length <= 4) return digits.slice(0, 2) + '.' + digits.slice(2);
      return digits.slice(0, 2) + '.' + digits.slice(2, 4) + '.' + digits.slice(4);
    }
    function applyMask() {
      var start = input.selectionStart || 0;
      var digitsBefore = input.value.slice(0, start).replace(/\\D/g, '').length;
      var formatted = formatDate(input.value);
      input.value = formatted;
      var position = 0, seen = 0;
      while (position < formatted.length && seen < digitsBefore) {
        if (/\\d/.test(formatted[position])) seen += 1;
        position += 1;
      }
      if (formatted[position] === '.') position += 1;
      input.setSelectionRange(position, position);
    }
    input.value = formatDate(input.value);
    input.addEventListener('input', applyMask);
  });

  document.querySelectorAll('[data-copy]').forEach(function (btn) {
  btn.addEventListener('click', function () {
  var value = btn.getAttribute('data-copy');
  if (navigator.clipboard) navigator.clipboard.writeText(value).then(function () {
  var old = btn.textContent;
  btn.textContent = document.documentElement.lang === 'en' ? 'Copied!' : 'Nusxalandi S ';
  setTimeout(function () { btn.textContent = old; }, 1600);
  });
  });
  });

  document.querySelectorAll('[data-share]').forEach(function (btn) {
  btn.addEventListener('click', function () {
  var text = btn.getAttribute('data-share');
  if (navigator.share) {
  navigator.share({ title: 'Duel', text: text }).catch(function () {});
  } else {
  var ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  document.body.removeChild(ta);
  var old = btn.textContent;
  btn.textContent = document.documentElement.lang === 'en' ? 'Copied!' : 'Nusxalandi S ';
  setTimeout(function () { btn.textContent = old; }, 1600);
  }
  });
  });
})();
</script>
<script>
(function () {
  function paint(el, data) {
    var count = el.querySelector('b');
    if (count) count.textContent = data.likes;
    el.classList.toggle('liked', !!data.liked);
  }
  document.querySelectorAll('[data-like]').forEach(function (el) {
    fetch('/like/' + el.dataset.like + '/status', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.ok) paint(el, d); })
      .catch(function () {});
  });
  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-like]') : null;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    fetch('/like/' + el.dataset.like, { method: 'POST', headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (r.status === 401) {
          location.href = '/login?next=' + encodeURIComponent(location.pathname);
          return null;
        }
        return r.json();
      })
      .then(function (d) { if (d && d.ok) paint(el, d); })
      .catch(function () {});
  });
})();
</script>
<script>
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js?v=26').then(function (registration) { registration.update().catch(function () {}); }).catch(function () {});
document.querySelectorAll('[data-app-refresh]').forEach(function (button) {
  button.addEventListener('click', async function () {
    if (button.disabled) return;
    var oldText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span aria-hidden="true">⟳</span><b>' + (document.documentElement.lang === 'en' ? 'Updating...' : 'Yangilanmoqda...') + '</b>';
    try {
      if ('serviceWorker' in navigator) {
        var registration = await navigator.serviceWorker.getRegistration();
        if (registration) await registration.update();
      }
    } catch (e) {}
    button.innerHTML = '<span aria-hidden="true">✓</span><b>' + (document.documentElement.lang === 'en' ? 'Updated' : 'Yangilandi') + '</b>';
    window.location.reload();
    setTimeout(function () { button.disabled = false; button.innerHTML = oldText; }, 2500);
  });
});
</script>
</body>
</html>`;
}

function authCard(title, subtitle, formHtml, altHtml = "", backHref = "") {
  return `<div class="auth-card">
  ${backHref ? `<a class="back auth-back" href="${h(backHref)}">  Orqaga</a>`: ""}
  <h1>${h(title)}</h1>
  <p class="muted">${subtitle}</p>
  ${formHtml}
  ${altHtml}
  </div>`;
}

function alertBox(message, type = "error") {
  if (!message) return "";
  return `<div class="alert ${type}">${h(message)}</div>`;
}

function typeBadge(type) {
  return `<span class="badge type-${h(type)}">${TYPE_LABEL[type] || h(type)}</span>`;
}

function videoEmbed(url, videoId = "") {
  const m = String(url).match(
  /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{6,})/
  );
  if (m) {
  return `<div class="video youtube-video"><div id="lessonYoutube" data-video-id="${h(m[1])}"></div></div>`;
  }
  return `<video id="${h(videoId)}" class="video" controls preload="metadata" controlsList="nodownload" src="${h(url)}"></video>`;
}

/* ------------------------------------------------------------- form parser */
async function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
  let size = 0;
  const chunks = [];
  req.on("data", (chunk) => {
  size += chunk.length;
  if (size > limit) {
  reject(new Error("too_large"));
  req.destroy();
  return;
  }
  chunks.push(chunk);
  });
  req.on("end", () => resolve(Buffer.concat(chunks)));
  req.on("error", reject);
  });
}

async function readForm(req) {
  const ct = String(req.headers["content-type"] || "").toLowerCase();

  if (ct.includes("application/x-www-form-urlencoded")) {
  const raw = (await readRaw(req, 1024 * 1024)).toString("utf8");
  return { fields: Object.fromEntries(new URLSearchParams(raw)), files: {} };
  }

  if (ct.includes("multipart/form-data")) {
  const declared = Number(req.headers["content-length"] || 0);
  if (declared && declared > MAX_MULTIPART_BODY) throw new Error("too_large");

  const request = new Request("http://localhost/upload", {
  method: "POST",
  headers: { "content-type": req.headers["content-type"] },
  body: Readable.toWeb(req),
  duplex: "half"
  });

  const fd = await request.formData();
  const fields = {};
  const files = {};
  for (const [key, value] of fd.entries()) {
  if (typeof value === "string") {
  fields[key] = value;
  } else {
  files[key] = {
  name: value.name || "file",
  type: value.type || "",
  size: value.size || 0,
  buffer: Buffer.from(await value.arrayBuffer())
  };
  }
  }
  return { fields, files };
  }

  return { fields: {}, files: {} };
}

/* --------------------------------------------------------------- queries */
function courseProgress(userId, courseId) {
  const row = db
.prepare(
  `SELECT
  (SELECT COUNT(*) FROM lessons WHERE course_id = ?) AS total,
  (SELECT COUNT(*) FROM progress p JOIN lessons l ON l.id = p.lesson_id JOIN courses c ON c.id = l.course_id
  WHERE l.course_id = ? AND p.user_id = ? AND (l.type <> 'test' OR p.score >= CASE WHEN c.category = 'attestation' THEN ${ATTESTATION_TEST_PASS_PERCENT} ELSE ${TEST_PASS_PERCENT} END)) AS done`
  )
.get(courseId, courseId, userId);
  return { total: row.total || 0, done: row.done || 0 };
}

function progressBar(done, total) {
  const percent = total ? Math.round((done / total) * 100): 0;
  return `<div class="progress"><span style="width:${percent}%"></span></div>
  <div class="progress-meta"><span>${percent}% tugatilgan</span><span>${done}/${total} dars</span></div>`;
}

function publicCourseCard(course, user) {
  const href = user ? `/course/${course.id}`: "/login";
  return `<a class="card course-card" href="${href}">
  <div class="course-top">
  <div class="course-ico">${icon("layers")}</div>
  <span class="badge">${course.lesson_count || 0} dars</span>
  </div>
  <h3>${h(course.title)}</h3>
  <p class="muted">${h(course.description || "Kurs tavsifi yo'q")}</p>
  <span class="card-link">Ochish   </span>
  </a>`;
}

/* ------------------------------------------------------------ test cards */
function formatDuration(min) {
  const total = Math.max(0, Number(min) || 0);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours && minutes) return `${hours} soat ${minutes} daqiqa`;
  if (hours) return `${hours} soat`;
  return `${minutes} daqiqa`;
}

const formatSum = (value) => String(Number(value) || 0).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/* --------------------------------------------------------------------- AI */
function testOwned(userId, lessonId) {
  return hasPlanAccess(userId);
}

function moduleHref(lesson) {
  const course = db.prepare("SELECT category FROM courses WHERE id = ?").get(lesson.course_id);
  const category = course && DIRECTION_IDS.includes(course.category) ? course.category : "attestation";
  return `/${category}`;
}

function testCard(test, owned = false, locked = false, unlockTestId = 0) {
  const isPro = Number(test.price) > 0;
  const count = Number(test.question_count) || Number(test.qcount) || 0;
  const score = Number(test.max_score) || 0;
  const priceLabel = owned ? "Ochilgan": isPro ? `${formatSum(test.price)} so'm`: "Bepul";
  const targetId = locked && unlockTestId ? Number(unlockTestId) : Number(test.id);
  return `<a class="test-card ${isPro ? "pro": "free"}${locked ? " test-locked" : ""}" href="/test/${targetId}"${locked ? ` aria-label="${h(test.title)} yopiq. Avval oldingi testni bajaring."` : ""}>
  <span class="test-flag">${locked ? "🔒" : isPro ? "PRO": "FREE"}</span>
  <h3>${h(test.title)}</h3>
  <div class="test-params">
  <div><span>Ajratilgan vaqt:</span><b>${formatDuration(test.duration_min)}</b></div>
  <div><span>Savollar soni:</span><b>${count} ta</b></div>
  <div><span>Eng yuqori ball:</span><b>${score} ballik</b></div>
  </div>
  <div class="test-engagement">
  <span class="like-btn" data-like="${test.id}" role="button" tabindex="0" title="Yoqdi">${icon("heart")} <b>${Number(test.likes) || 0}</b></span>
  <span>${icon("eye")} ${Number(test.views) || 0}</span>
  </div>
  <span class="test-price">${locked ? "Avval oldingi testni bajaring" : priceLabel}</span>
  </a>`;
}

function formatSize(bytes) {
  const size = Number(bytes) || 0;
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

async function notifyTelegram(text, keyboard = null, force = false) {
  if (!force && config.notifyOnFinish === false) return false;
  const token = config.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = config.telegramChatId || process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;
  try {
  const payload = {
  chat_id: chatId,
  text,
  parse_mode: "HTML",
  disable_web_page_preview: true
  };
  if (keyboard) payload.reply_markup = keyboard;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) {
  console.error("[telegram] send failed", res.status, (await res.text()).slice(0, 200));
  return false;
  }
  console.log("[telegram] xabar yuborildi");
  return true;
  } catch (e) {
  console.error("[telegram]", e.message);
  return false;
  }
}

function platformPublicUrl() {
  try {
  const file = path.join(DATA_DIR, "public-url.txt");
  if (fs.existsSync(file)) {
  const value = fs.readFileSync(file, "utf8").trim();
  if (/^https?:\/\//i.test(value)) return value.replace(/\/+$/, "");
  }
  } catch (e) {}
  return String(config.appUrl || "").replace(/\/+$/, "");
}

/* ---------------------------------------------------- public tunnel manager */
const CLOUDFLARED_BIN = process.env.CLOUDFLARED_BIN || "C:\\Users\\i7TechStore\\cloudflared.exe";
let tunnelChild = null;
let tunnelTask = null;
let tunnelUrl = "";

function savePublicUrl(url) {
  const clean = String(url || "").replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(clean)) return "";
  tunnelUrl = clean;
  try {
  fs.writeFileSync(path.join(DATA_DIR, "public-url.txt"), clean, "utf8");
  } catch (e) {}
  try {
  const file = path.join(__dirname, "config.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  data.appUrl = clean;
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
  config.appUrl = clean;
  } catch (e) {}
  return clean;
}

async function publicUrlAlive(url) {
  if (!url) return false;
  try {
  const res = await fetch(url.replace(/\/+$/, "") + "/", { signal: AbortSignal.timeout(8000) });
  return res.status < 500;
  } catch (e) {
  return false;
  }
}

function startTunnelProcess() {
  return new Promise((resolve) => {
  let done = false;
  const finish = (url) => {
  if (done) return;
  done = true;
  resolve(url || "");
  };
  let child;
  try {
  child = spawn(
  CLOUDFLARED_BIN,
  ["tunnel", "--url", `http://127.0.0.1:${PORT}`, "--no-autoupdate", "--protocol", "http2"],
  { windowsHide: true }
  );
  } catch (e) {
  finish("");
  return;
  }
  tunnelChild = child;
  let buffer = "";
  const onData = (chunk) => {
  buffer = (buffer + String(chunk)).slice(-30000);
  const match = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  if (match) {
  savePublicUrl(match[0]);
  finish(match[0]);
  }
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  child.on("error", () => finish(""));
  child.on("exit", () => {
  tunnelChild = null;
  finish("");
  });
  setTimeout(() => finish(tunnelUrl || ""), 30000);
  });
}

async function ensurePublicTunnel() {
  const current = platformPublicUrl();
  if (current && (await publicUrlAlive(current))) return current;
  if (tunnelTask) return tunnelTask;
  tunnelTask = (async () => {
  try {
  if (tunnelChild) {
  try {
  tunnelChild.kill();
  } catch (e) {}
  tunnelChild = null;
  }
  const url = await startTunnelProcess();
  if (url && url !== current) {
  telegramApi("sendMessage", {
  chat_id: config.telegramChatId,
  text: `" Platforma manzili yangilandi:\n${url}`,
  disable_web_page_preview: true,
  reply_markup: botKeyboard()
  }).catch(() => {});
  }
  return url || platformPublicUrl();
  } finally {
  tunnelTask = null;
  }
  })();
  return tunnelTask;
}

function startTunnelWatchdog() {
  ensurePublicTunnel().catch(() => {});
  setInterval(() => {
  ensurePublicTunnel().catch(() => {});
  }, 120000);
}

async function telegramApi(method, payload) {
  const token = config.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || "";
  if (!token) {
  console.error(`[telegram] ${method} failed: TELEGRAM_BOT_TOKEN is not configured`);
  return { ok: false, description: "Bot token is not configured" };
  }
  try {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload || {}),
  signal: AbortSignal.timeout(35000)
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || !data.ok) {
  console.error(`[telegram] ${method} failed (${data && data.error_code || res.status}): ${String(data && data.description || "Invalid Telegram API response").slice(0, 240)}`);
  }
  return data;
  } catch (e) {
  console.error("[bot]", e.message);
  return null;
  }
}

async function notifyNewsSubscribers(title, body) {
  const cleanTitle = String(title || "").trim().slice(0, 180);
  const cleanBody = String(body || "").trim().slice(0, 3800);
  if (!cleanTitle || !cleanBody) return;
  const message = `${cleanTitle}\n\n${cleanBody}`;
  const token = config.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || "";
  if (!token) {
    console.error("[telegram] news broadcast skipped: bot token is not configured");
    return;
  }
  const targets = new Set([
    ...db.prepare("SELECT chat_id FROM telegram_bot_subscribers").all().map((row) => String(row.chat_id || "").trim()),
    ...db.prepare("SELECT telegram_id FROM users WHERE telegram_id IS NOT NULL AND telegram_id <> ''").all().map((row) => String(row.telegram_id || "").trim()),
    String(config.telegramChatId || process.env.TELEGRAM_CHAT_ID || "").trim()
  ].filter(Boolean));
  if (!targets.size) {
    console.error("[telegram] news broadcast skipped: no bot subscribers or linked Telegram users");
    return;
  }
  let sent = 0;
  for (const chatId of targets) {
    const result = await telegramApi("sendMessage", { chat_id: chatId, text: message });
    if (result && result.ok) sent += 1;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  console.log(`[telegram] news broadcast finished: ${sent}/${targets.size} delivered`);
}

async function sendLoginCode(chatId, code) {
  const response = await telegramApi("sendMessage", {
    chat_id: chatId,
    text: `<b>Kirish kodi</b>\n\n<code>${code}</code>\n\nKod 5 daqiqa amal qiladi. Nusxalash uchun kodni bosing.`,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: "Nusxalash", copy_text: { text: code } }]] }
  });
  return Boolean(response && response.ok);
}

function telegramDuelKeyboard(path) {
  const base = platformPublicUrl();
  if (!base) return null;
  const url = base + path;
  return { inline_keyboard: [[{ text: "Brauzerda ochish", url }]] };
}

function duelPlayerLabel(userId, fallback = "O'quvchi") {
  const player = db.prepare("SELECT name, telegram_username FROM users WHERE id = ?").get(userId);
  if (!player) return h(fallback);
  const username = String(player.telegram_username || "").replace(/^@+/, "").trim();
  const firstName = String(player.name || fallback).trim().split(/\s+/)[0] || fallback;
  return `${h(firstName)}${username ? ` (@${h(username)})` : ""}`;
}

function telegramPublicName(name, username = "", fallback = "O'quvchi") {
  const firstName = String(name || fallback).trim().split(/\s+/)[0] || fallback;
  const cleanUsername = String(username || "").replace(/^@+/, "").trim();
  return `${h(firstName)}${cleanUsername ? ` (@${h(cleanUsername)})` : ""}`;
}

async function sendUserMessage(userId, text, path) {
  const user = db.prepare("SELECT telegram_id FROM users WHERE id = ?").get(userId);
  if (!user || !user.telegram_id) return false;
  const keyboard = telegramDuelKeyboard(path);
  const payload = {
  chat_id: user.telegram_id,
  text,
  parse_mode: "HTML",
  disable_web_page_preview: true
  };
  if (keyboard) payload.reply_markup = keyboard;
  let data = await telegramApi("sendMessage", payload);
  return !!(data && data.ok);
}

async function notifyTournamentMatchPlayers(tournamentId, round, matchId = null, phase = "ready") {
  const tournament = db.prepare("SELECT * FROM tournaments WHERE id = ?").get(tournamentId);
  if (!tournament) return;
  const matches = db
.prepare(
  `SELECT m.*, u1.name AS p1name, u1.telegram_username AS p1username,
  u2.name AS p2name, u2.telegram_username AS p2username
  FROM tournament_matches m
  LEFT JOIN users u1 ON u1.id = m.p1
  LEFT JOIN users u2 ON u2.id = m.p2
  WHERE m.tournament_id = ? AND m.round = ? AND m.status = 'ready' ${matchId ? "AND m.id = ?" : ""}`
  )
.all(...(matchId ? [tournamentId, round, matchId] : [tournamentId, round]));
  for (const match of matches) {
  const label = tournamentRoundName(tournament.size, round);
  for (const playerId of [match.p1, match.p2]) {
  if (!playerId) continue;
  const flag = `tour_${phase}_${match.id}_${playerId}`;
  if (metaGet(flag, "") === "1") continue;
  metaSet(flag, "1");
  const opponentName = playerId === match.p1 ? match.p2name : match.p1name;
  const opponentUsername = playerId === match.p1 ? match.p2username : match.p1username;
  const opponent = `${h(String(opponentName || "?").trim().split(/\s+/)[0])}${opponentUsername ? ` (@${h(opponentUsername)})` : ""}`;
  await sendUserMessage(
  playerId,
  `${phase === "reminder" ? "⏳ <b>Duelga 5 daqiqa qoldi!</b>" : phase === "started" ? "🔔 <b>Duel boshlandi!</b>" : `🏆 <b>${label} juftligi tayyor</b>`}\n${phase === "started" ? "30 daqiqa ichida kiring." : ""}\nRaqibingiz: <b>${opponent}</b>\n15 ta aralash savol. Har savolga 60 soniya.`,
  `/duel/tournament/match/${match.id}`
  );
  }
  }
}

function botKeyboard() {
  const url = platformPublicUrl();
  if (!url) return null;
  return { inline_keyboard: [[{ text: "Brauzerda ochish", url }]] };
}

async function sendBotWelcome(chatId, name) {
  const url = platformPublicUrl();
  if (!url) {
  await telegramApi("sendMessage", {
  chat_id: chatId,
  text: "Platforma manzili hali sozlanmagan. Administrator bilan bog'laning."
  });
  return;
  }
  await telegramApi("sendMessage", {
  chat_id: chatId,
  text: `Assalomu alaykum${name ? `, ${name}`: ""}!\n\nHabiba teacher — ingliz tili o'qituvchilarini imtihonga tayyorlov platformasi. Platformani brauzerda ochish uchun pastdagi tugmani bosing.`,
  parse_mode: "HTML",
  disable_web_page_preview: true,
  reply_markup: botKeyboard()
  });
}

async function handleDuelInviteStart(chatId, rawCode) {
  const code = String(rawCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const duel = getDuel(code);
  if (!duel || duel.status !== "waiting" || duel.opponent_id) {
    await telegramApi("sendMessage", { chat_id: chatId, text: "Bu duel taklifi eskirgan yoki raqib topilgan. Platformada yangi duel yarating." });
    return;
  }
  const creator = db.prepare("SELECT id, name, telegram_id, telegram_username FROM users WHERE id = ?").get(duel.creator_id);
  const creatorChatId = resolveTelegramChatId(creator);
  if (!creator || !creatorChatId || String(creatorChatId) !== String(chatId)) {
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: "Telegram akkauntingiz Habiba Teacher profilingizga ulanmagan. Platformada ko'rsatilgan Telegram username yoki ID ni tekshirib, botga /start yuboring."
    });
    return;
  }
  const duelUrl = `${platformPublicUrl() || "https://habibateacher.uz"}/duel/${encodeURIComponent(code)}`;
  const response = await telegramApi("sendMessage", {
    chat_id: chatId,
    text: `Duel tayyor, ${String(creator.name || "o'quvchi").trim().split(/\s+/)[0]}${creator.telegram_username ? ` (@${creator.telegram_username})` : ""}! Raqibingizni kontaktlardan tanlang.`,
    reply_markup: {
      inline_keyboard: [
        [{
          text: "Telegram kontaktini tanlash",
          switch_inline_query_chosen_chat: { query: `duel_${code}`, allow_user_chats: true }
        }],
        [{ text: "Brauzerda ochish", url: duelUrl }]
      ]
    },
    disable_web_page_preview: true
  });
  if (!response || !response.ok) {
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: `Taklif havolasi: ${duelUrl}\nBot kontakt tanlashi ishlamasa, @BotFather orqali botning Inline Mode sozlamasini yoqing.`,
      disable_web_page_preview: true
    });
  }
}

async function handleDuelInlineQuery(inlineQuery) {
  const match = String(inlineQuery.query || "").trim().match(/^duel_([A-Z0-9]{6})$/i);
  const results = [];
  if (match) {
    const code = match[1].toUpperCase();
    const duel = getDuel(code);
    const creator = duel && db.prepare("SELECT id, telegram_id, telegram_username FROM users WHERE id = ?").get(duel.creator_id);
    const creatorChatId = resolveTelegramChatId(creator);
    if (
      duel && duel.status === "waiting" && !duel.opponent_id && creator &&
      String(creatorChatId || "") === String(inlineQuery.from?.id || "")
    ) {
      const duelUrl = `${platformPublicUrl() || "https://habibateacher.uz"}/duel/${encodeURIComponent(code)}`;
      const questionCount = Math.min(10, Number(duel.total_questions) || 10);
      const creatorLabel = duelPlayerLabel(duel.creator_id);
      const inviteText = `⚔️ <b>${creatorLabel}</b> sizni Habiba Teacher'da duelga chaqiryapti!\n\n📚 Test: <b>${h(duel.lesson_title || "Aralash test")}</b>\n🔢 Savollar: ${questionCount}\n\nTaklifni qabul qilish uchun brauzerda oching.`;
      results.push({
        type: "article",
        id: `duel_${code}`,
        title: `${String(duel.creator_name || "O'quvchi").trim().split(/\s+/)[0]}${creator.telegram_username ? ` (@${creator.telegram_username})` : ""} sizni duelga chaqiryapti`,
        description: `${duel.lesson_title || "Aralash test"} · ${questionCount} ta savol`,
        input_message_content: {
          message_text: inviteText,
          parse_mode: "HTML",
          disable_web_page_preview: true
        },
        reply_markup: {
          inline_keyboard: [[{ text: "Brauzerda ochish", url: duelUrl }]]
        }
      });
    }
  }
  await telegramApi("answerInlineQuery", {
    inline_query_id: inlineQuery.id,
    results,
    cache_time: 0,
    is_personal: true
  });
}

async function handleBotUpdate(update) {
  if (update.inline_query) {
    await handleDuelInlineQuery(update.inline_query);
    return;
  }
  const message = update.message || update.edited_message;
  if (!message) return;
  const chatId = message.chat?.id;
  const text = String(message.text || "").trim();
  const name = message.from?.first_name || "";
  if (!chatId) return;
  const fromUsername = String(message.from?.username || "").trim().toLowerCase();
  if (fromUsername) {
    db.prepare(
      "INSERT INTO telegram_users (username, chat_id, updated_at) VALUES (?, ?, ?) ON CONFLICT(username) DO UPDATE SET chat_id = excluded.chat_id, updated_at = excluded.updated_at"
    ).run(fromUsername, String(chatId), nowISO());
    const pending = db
      .prepare(
        "SELECT id FROM users WHERE telegram_username = ? COLLATE NOCASE AND (telegram_id IS NULL OR telegram_id = '')"
      )
      .get(fromUsername);
    if (pending) {
      db.prepare("UPDATE users SET telegram_id = ? WHERE id = ?").run(String(chatId), pending.id);
    }
  }
  const parts = text.split(/\s+/);
  const cmd = parts[0].toLowerCase().replace(/@.*$/, "");
  const payload = parts[1] || "";

  if (cmd === "/start") {
    db.prepare("INSERT INTO telegram_bot_subscribers (chat_id, started_at) VALUES (?, ?) ON CONFLICT(chat_id) DO NOTHING")
      .run(String(chatId), nowISO());
  }

  if ((cmd === "/start" || cmd === "/login") && payload.startsWith("login_")) {
    await handleTelegramLoginLink(chatId, payload.slice(6), message.from);
    return;
  }

  if (cmd === "/start" && payload.startsWith("register_")) {
    const token = payload.slice("register_".length);
    const link = db.prepare("SELECT * FROM registration_links WHERE token = ? AND used = 0").get(token);
    if (!link || Number(link.expires_at) < Date.now()) {
      await telegramApi("sendMessage", { chat_id: chatId, text: "Tasdiqlash havolasi eskirgan. Ro'yxatdan o'tish sahifasini qayta ochib, botga yana /start bosing." });
      return;
    }
    db.prepare("UPDATE registration_links SET chat_id = ? WHERE token = ? AND used = 0").run(String(chatId), token);
    await telegramApi("sendMessage", { chat_id: chatId, text: "✅ Botga /start bosdingiz. Endi ro'yxatdan o'tish sahifasiga qayting — Telegram tasdiqlandi." });
    return;
  }

  if (cmd === "/start" && payload.startsWith("duel_")) {
    await handleDuelInviteStart(chatId, payload.slice(5));
    return;
  }

  if (cmd === "/start" || cmd === "/platform" || cmd === "/kirish") {
  if (!(await publicUrlAlive(platformPublicUrl()))) {
  try {
  fs.writeFileSync(path.join(DATA_DIR, "restart-tunnel.flag"), "1", "utf8");
  } catch (e) {}
  for (let i = 0; i < 10; i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  if (await publicUrlAlive(platformPublicUrl())) break;
  }
  }
  await sendBotWelcome(chatId, name);
  return;
  }
  if (cmd === "/myid") {
  await telegramApi("sendMessage", {
  chat_id: chatId,
  text: `Sizning Telegram ID: ${chatId}`
  });
  return;
  }
  if (cmd === "/help") {
  await telegramApi("sendMessage", {
  chat_id: chatId,
  text: "Buyruqlar:\n/start   platformaga kirish\n/myid   Telegram ID\n/help   yordam"
  });
  return;
  }
  await sendBotWelcome(chatId, name);
}

async function handleTelegramLoginLink(chatId, token, from) {
  const link = db.prepare("SELECT * FROM login_links WHERE token = ?").get(token);
  if (!link || Number(link.used) === 1 || Number(link.expires_at) < Date.now()) {
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: "Havola eskirgan. Saytga qaytib, qaytadan urinib ko'ring."
    });
    return;
  }
  const userRow = findUserByPhone(link.phone, "id, name");
  if (!userRow) {
    await telegramApi("sendMessage", {
      chat_id: chatId,
      text: "Bu telefon raqam bo'yicha akkaunt topilmadi. Saytda ro'yxatdan o'ting."
    });
    return;
  }
  const username = String(from?.username || "").trim().toLowerCase();
  const code = String(randomInt(100000, 1000000));
  if (!(await sendLoginCode(chatId, code))) {
    db.prepare("UPDATE login_links SET send_error = 'telegram_send_failed' WHERE token = ?").run(token);
    return;
  }
  db.prepare("UPDATE login_links SET chat_id = ?, used = 1, send_error = '' WHERE token = ?").run(String(chatId), token);
  db.prepare("UPDATE users SET telegram_id = ? WHERE id = ?").run(String(chatId), userRow.id);
  if (username) {
    db.prepare(
      "INSERT INTO telegram_users (username, chat_id, updated_at) VALUES (?, ?, ?) ON CONFLICT(username) DO UPDATE SET chat_id = excluded.chat_id, updated_at = excluded.updated_at"
    ).run(username, String(chatId), nowISO());
  }
  db.prepare(
    `INSERT INTO login_codes (phone, code_hash, expires_at, attempts, created_at)
     VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(phone) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, created_at = excluded.created_at`
  ).run(link.phone, loginCodeHash(link.phone, code), Date.now() + 5 * 60 * 1000, nowISO());
}

function startPlatformBot() {
  const token = config.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || "";
  if (!token) {
  console.error("[bot] not started: TELEGRAM_BOT_TOKEN is not configured");
  return;
  }
  let offset = Number(metaGet("bot_offset", "0")) || 0;
  const loop = async () => {
  const identity = await telegramApi("getMe", {});
  if (!identity || !identity.ok) {
  console.error("[bot] stopped: Telegram rejected the bot token; check TELEGRAM_BOT_TOKEN in the service variables");
  return;
  }
  const webhook = await telegramApi("getWebhookInfo", {});
  if (webhook && webhook.ok && webhook.result && webhook.result.url) {
  console.error("[bot] stopped: a Telegram webhook is active; disable it before this app can poll updates");
  return;
  }
  console.log(`[bot] @${identity.result.username} connected`);
  while (true) {
  try {
  const params = new URLSearchParams({
    timeout: "25",
    offset: String(offset),
    allowed_updates: JSON.stringify(["message", "inline_query"])
  });
  const res = await fetch(
  `https://api.telegram.org/bot${token}/getUpdates?${params}`,
  { signal: AbortSignal.timeout(35000) }
  );
  const data = await res.json().catch(() => null);
  if (data && data.ok && Array.isArray(data.result)) {
  for (const update of data.result) {
  offset = update.update_id + 1;
  metaSet("bot_offset", offset);
  await handleBotUpdate(update);
  }
  } else {
  console.error(`[bot] getUpdates failed (${data && data.error_code || res.status}): ${String(data && data.description || "Invalid Telegram API response").slice(0, 240)}`);
  }
  } catch (e) {
  console.error("[bot]", e.message);
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  };
  loop();
}

function testResultStats(lessonId, category = "") {
  const rows = db
.prepare("SELECT score FROM progress WHERE lesson_id = ? AND score IS NOT NULL")
.all(lessonId);
  const ranges = category === "attestation"
    ? [
        { label: "Oliy toifa · 80–100%", min: 80, max: 100 },
        { label: "Birinchi toifa · 70–79%", min: 70, max: 79 },
        { label: "Ikkinchi toifa · 0–69%", min: 0, max: 69 }
      ]
    : [
        { label: "70% va yuqori", min: 70, max: 100 },
        { label: "51–69%", min: 51, max: 69 },
        { label: "31–50%", min: 31, max: 50 },
        { label: "11–30%", min: 11, max: 30 },
        { label: "0–10%", min: 0, max: 10 }
      ];
  const buckets = ranges.map((b) => ({...b, count: rows.filter((r) => r.score >= b.min && r.score <= b.max).length }));
  const top = db
.prepare(
  `SELECT u.id, u.name, p.score
  FROM progress p JOIN users u ON u.id = p.user_id
  WHERE p.lesson_id = ? AND p.score IS NOT NULL
  ORDER BY p.score DESC, p.completed_at ASC LIMIT 10`
  )
.all(lessonId);
  return { buckets, top, total: rows.length };
}

function materialRows(materials) {
  const labels = { pdf: "PDF", link: "Havola", text: "Matn" };
  const icons = { pdf: "file", link: "link", text: "book" };
  return materials
.map(
  (m) => `<a class="material-row" href="/materials/${m.id}"${
  m.type === "link" ? ` target="_blank" rel="noopener"`: ""
  }>
  <span class="material-ico">${icon(icons[m.type] || "file")}</span>
  <span class="material-main"><b>${h(m.title)}</b><small>${labels[m.type] || "Fayl"}${
  m.file_size ? `. ${formatSize(m.file_size)}`: ""
  }</small></span>
  <span class="material-open">Ochish   </span>
  </a>`
  )
.join("");
}

function testLanding(lesson, { user, admin, owned }) {
  const course = db.prepare("SELECT title, category FROM courses WHERE id = ?").get(lesson.course_id);
  const cat = course && course.category === "tkt" ? "TKT": "Attestatsiya";
  const price = Number(lesson.price) || 0;
  const isPro = price > 0;
  const qcount =
  Number(lesson.question_count) ||
  db.prepare("SELECT COUNT(*) AS n FROM questions WHERE lesson_id = ?").get(lesson.id).n;
  const maxScore = Number(lesson.max_score) || 0;
  const about =
  String(lesson.about || "").trim() ||
  `${course ? course.title: "Testlar"} bo'limidagi test. Jami savollar ${qcount} ta, ajratilgan vaqt   ${formatDuration(
  lesson.duration_min
  )}. Natija test yakunlangach avtomatik hisoblanadi va reytingga qo'shiladi.`;
  const stats = testResultStats(lesson.id, course && course.category);
  const maxCount = Math.max(1,...stats.buckets.map((b) => b.count));
  const progressRow = user
  ? db.prepare("SELECT score FROM progress WHERE user_id = ? AND lesson_id = ?").get(user.id, lesson.id)
: null;
  const materials = db.prepare("SELECT * FROM materials WHERE lesson_id = ? ORDER BY id").all(lesson.id);
  const canSeeMaterials = !!admin || !isPro || !!owned;
  const startHref = `/test/${lesson.id}?start=1`;
  const loginHref = `/login?next=${encodeURIComponent(startHref)}`;

  let action;
  if (!user) {
  action = `<p class="muted small">Testga kirish uchun tizimga kiring</p>
  <a class="btn btn-primary" href="${loginHref}">Kirish</a>`;
  } else if (owned) {
  action = `<a class="btn btn-primary" href="${startHref}">${progressRow ? "Qayta topshirish": "Testni boshlash"}</a>
  ${
  progressRow
  ? `<p class="muted small">Sizning natijangiz: <b>${progressRow.score}%</b></p>`
: `<p class="muted small">Tayyor bo'lsangiz, testni boshlang.</p>`
  }`;
  } else {
  action = `<p class="muted small">Pullik testlarni yechish uchun faol tarif sotib oling.</p>
  <a class="btn btn-primary" href="/plans">Tariflarni ko'rish</a>`;
  }

  const distRows = stats.buckets
.map(
  (b) => `<div class="dist-row">
  <span>${b.label}</span>
  <div class="dist-bar"><i style="width:${Math.round((b.count / maxCount) * 100)}%"></i></div>
  <b>${b.count}</b>
  </div>`
  )
.join("");

  const topRows = stats.top.length
  ? stats.top
.map((r, i) => {
  const shown = maxScore > 0 ? `${Math.round((r.score / 100) * maxScore)} / ${maxScore}`: `${r.score}%`;
  return `<div class="top-row${user && user.id === r.id ? " me": ""}">
  <span class="top-rank${i < 3 ? " top": ""}">${i + 1}</span>
  <b>${h(r.name)}</b>
  <span class="top-score">${shown}</span>
  </div>`;
  })
.join("")
: `<p class="muted small">Hozircha natijalar yo'q. Birinchi bo'lib topshiring.</p>`;

  const materialCard =
  canSeeMaterials && (materials.length || admin)
  ? `<article class="card test-materials">
  <div class="card-head">
  <h2>Materiallar</h2>
  ${admin ? `<a class="btn btn-sm" href="/admin/lesson/${lesson.id}/materials">Boshqarish</a>`: ""}
  </div>
  ${
  materials.length
  ? `<div class="material-list">${materialRows(materials)}</div>`
: `<p class="muted small">Hozircha material yo'q. Admin panelda qo'shishingiz mumkin.</p>`
  }
  </article>`
: isPro && !owned
  ? `<article class="card test-materials">
  <div class="card-head"><h2>Materiallar</h2></div>
  <p class="muted small">Materiallar test ochilgach ko'rinadi.</p>
  </article>`
: "";

  return `<section class="test-detail">
  <div class="wrap">
  <a class="back" href="${moduleHref(lesson)}">  ${cat}</a>
  <div class="test-detail-grid">
  <div class="test-detail-main">
  <article class="card test-info">
  <span class="pill">${isPro ? "Narx": "Bepul"}</span>
  <h1>${h(lesson.title)}</h1>
  <div class="test-social">
  <span class="like-btn" data-like="${lesson.id}" role="button" tabindex="0" title="Yoqdi">${icon("heart")} <b>${Number(lesson.likes) || 0}</b></span>
  <span>${icon("eye")} ${Number(lesson.views) || 0} Ko'rishlar</span>
  </div>
  <div class="test-meta4">
  <div>${icon("clock")}<span>Ajratilgan vaqt</span><b>${formatDuration(lesson.duration_min)}</b></div>
  <div>${icon("list")}<span>Savollar soni</span><b>${qcount} ta</b></div>
  <div>${icon("star")}<span>Eng yuqori ball</span><b>${maxScore} ball</b></div>
  <div>${icon("tag")}<span>Narx</span><b>${isPro ? `${formatSum(price)} so'm`: "Bepul"}</b></div>
  </div>
  <div class="test-about">
  <h2>Test haqida</h2>
  <div class="prose">${nl2br(about)}</div>
  ${admin ? `<a class="card-link" href="/admin/lesson/${lesson.id}/materials">Tavsif va materiallarni tahrirlash   </a>`: ""}
  </div>
  </article>
  ${materialCard}
  <article class="card test-distribution">
  <h2>Natijalar taqsimoti</h2>
  <p class="muted small">Har bir ishtirokchining eng yaxshi natijasi asosida</p>
  <div class="dist-list">${distRows}</div>
  <p class="muted small">Jami qatnashganlar: ${stats.total} ta</p>
  </article>
  </div>
  <aside class="test-detail-side">
  <div class="card test-buy">
  <div class="test-buy-price">${isPro ? `${formatSum(price)} so'm`: "Bepul"}</div>
  ${action}
  ${
  isPro
  ? `<div class="test-plan">
  <b>Bu testni tarif bilan oching</b>
  <p class="muted small">Bitta tarif   barcha pullik testlar uchun.</p>
  <div class="test-plan-price">299 000 so'm <span>/ 3 oy</span></div>
  <a class="card-link" href="/plans">Tarifni ko'rish   </a>
  </div>`
: ""
  }
  <p class="muted small">Savollar uchun: ${h(config.phone || "")}</p>
  </div>
  <div class="card test-top">
  <h2>Eng yaxshi 10 ishtirokchi</h2>
  <div class="top-list">${topRows}</div>
  </div>
  </aside>
  </div>
  </div>
  </section>`;
}

function duelCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function getDuel(code) {
  return db
.prepare(
  `SELECT d.*, COALESCE(NULLIF(d.title, ''), l.title) AS lesson_title, l.course_id, l.duration_min,
  (SELECT COUNT(*) FROM duel_questions dq WHERE dq.duel_id = d.id) AS total_questions,
  uc.name AS creator_name, uo.name AS opponent_name
  FROM duels d
  JOIN lessons l ON l.id = d.lesson_id
  JOIN users uc ON uc.id = d.creator_id
  LEFT JOIN users uo ON uo.id = d.opponent_id
  WHERE d.code = ?`
  )
.get(code);
}

function duelPlays(duelId) {
  return Object.fromEntries(
  db
.prepare("SELECT * FROM duel_plays WHERE duel_id = ?")
.all(duelId)
.map((row) => [row.user_id, row])
  );
}

function duelInitial(name) {
  return String(name || "?").trim().charAt(0).toUpperCase() || "?";
}

function duelPlayerCard(duel, userId, name, play, isMe) {
  const seconds = play ? Math.max(0, Math.round(play.elapsed_ms / 1000)): 0;
  return `<div class="duel-player${isMe ? " me": ""}${!name ? " empty": ""}">
  <span class="duel-avatar">${name ? h(duelInitial(name)): "?"}</span>
  <b>${name ? h(name): "Raqib kutilmoqda"}</b>
  <small>${
  play
  ? `${play.correct}/${play.total} to'g'ri. ${seconds} soniya`
: name
  ? "Hali o'ynamadi"
: "Kodni do'stingizga yuboring"
  }</small>
  </div>`;
}

function duelRoomPage(duel, user) {
  const isCreator = duel.creator_id === user.id;
  const opponentId = isCreator ? duel.opponent_id: duel.creator_id;
  if (!isCreator && duel.opponent_id !== user.id) {
  if (duel.status === "waiting" && !duel.opponent_id) {
  return `<section class="page-hero center duel-accept-hero">
    <span class="eyebrow">Duel taklifi</span>
    <h1>${h(duel.creator_name || "Do'stingiz")} sizni duelga chaqiryapti</h1>
    <p class="lead">${h(duel.lesson_title || "Aralash test")} · ${Math.min(10, Number(duel.total_questions) || 10)} ta savol</p>
    <form method="post" action="/duel/${h(duel.code)}/accept"><button class="btn btn-primary btn-lg" type="submit">Taklifni qabul qilish</button></form>
  </section>`;
  }
  return `<section class="page-hero center"><h1>Bu duel sizga tegishli emas</h1><p class="lead">Maxsus kod bilan yangi duelga qo'shiling.</p><a class="btn btn-primary" href="/duel">Duel sahifasi</a></section>`;
  }

  const plays = duelPlays(duel.id);
  const myPlay = plays[user.id];
  const oppPlay = opponentId ? plays[opponentId]: null;
  const creatorPlay = plays[duel.creator_id];
  const opponentPlay = duel.opponent_id ? plays[duel.opponent_id]: null;
  let winner = null;
  if (creatorPlay && opponentPlay) {
  if (creatorPlay.correct !== opponentPlay.correct) {
  winner = creatorPlay.correct > opponentPlay.correct ? duel.creator_id: duel.opponent_id;
  } else if (creatorPlay.elapsed_ms !== opponentPlay.elapsed_ms) {
  winner = creatorPlay.elapsed_ms < opponentPlay.elapsed_ms ? duel.creator_id: duel.opponent_id;
  }
  }

  const creatorCard = duelPlayerCard(duel, duel.creator_id, duel.creator_name, creatorPlay, user.id === duel.creator_id);
  const opponentCard = duelPlayerCard(
  duel,
  duel.opponent_id,
  duel.opponent_name,
  opponentPlay,
  user.id === duel.opponent_id
  );

  let action = "";
  if (duel.status === "waiting" || !duel.opponent_id) {
  const botInvite = config.telegramBotToken && config.telegramBotUsername;
  const inviteUrl = botInvite
    ? duelBotStartLink(duel.code)
    : duelTelegramShareUrl(duel.code, duel.creator_name || user.name);
  const duelUrl = `${platformPublicUrl() || "https://habibateacher.uz"}/duel/${encodeURIComponent(duel.code)}`;
  action = `<div class="duel-invite card">
  <span class="eyebrow">Taklif kodi</span>
  <div class="duel-code">
  <b>${h(duel.code)}</b>
  <button class="btn btn-sm" type="button" data-copy="${h(duel.code)}">Nusxalash</button>
  <button class="btn btn-sm" type="button" data-copy="${h(duelUrl)}">Havolani nusxalash</button>
  </div>
  ${isCreator ? `<a class="btn btn-primary duel-invite-telegram" href="${h(inviteUrl)}" target="_blank" rel="noopener">${botInvite ? "Telegram botda raqibni tanlash" : "Telegramda raqibni tanlash"} &#8599;</a>` : ""}
  <p class="muted small">${botInvite ? "Telegram bot kontakt tanlash oynasini ochadi. Taklif xabarini yuborish uchun Telegram'da bot natijasini tanlang." : "Telegram ulashish oynasida do'stingizni tanlab taklif havolasini yuboring."}</p>
  ${isCreator && !botInvite ? `<p class="muted small duel-bot-note">Bot nomi va tokeni sozlangach, taklif bot nomidan yuboriladi.</p>` : ""}
  ${
  isCreator
  ? `<form method="post" action="/duel/${h(duel.code)}/delete" onsubmit="return confirm(document.documentElement.lang==='en'?'Cancel this duel?':'Duel bekor qilinsinmi?')">
  <button class="btn btn-sm btn-danger" type="submit">Duelni bekor qilish</button>
  </form>`
: ""
  }
  </div>`;
  } else if (duel.status === "finished" || (creatorPlay && opponentPlay)) {
  const verdict =
  winner === null
  ? "Durang!"
: winner === user.id
  ? "G'alaba!"
: "Mag'lubiyat";
  action = `<div class="duel-result ${winner === user.id ? "win": winner ? "lose": "draw"}">
  <span class="duel-result-ico">${winner === user.id ? "x ": winner ? "x ": "x"}</span>
  <h2>${verdict}</h2>
  <p class="muted">${
  winner ? `G'olib: <b>${h(winner === duel.creator_id ? duel.creator_name: duel.opponent_name)}</b>`: "Ikkalangiz teng natija ko'rsatdingiz."
  }</p>
  <div class="actions">
  <a class="btn btn-primary" href="/duel">Yangi duel</a>
  <a class="btn btn-ghost" href="/attestation">Testlarga o'tish</a>
  </div>
  </div>`;
  } else if (myPlay) {
  action = `<div class="duel-wait">
  <span class="duel-spinner"></span>
  <h2>Raqib natijasi kutilmoqda</h2>
  <p class="muted">Sizning natijangiz: <b>${myPlay.correct}/${myPlay.total}</b>. ${Math.round(
  myPlay.elapsed_ms / 1000
  )} soniya</p>
  <a class="btn btn-ghost" href="/duel">Duel sahifasi</a>
  </div>`;
  } else {
  action = `<div class="duel-start">
  <h2>Tayyormisiz?</h2>
  <p class="muted">${Math.min(10, Number(duel.total_questions) || 10)} savol. har biriga 60 soniya. natija vaqti ham hisobga olinadi.</p>
  <a class="btn btn-primary btn-lg" href="/duel/${h(duel.code)}/start">Duelni boshlash a </a>
  </div>`;
  }

  return `<section class="duel-hero">
  <div class="wrap">
  <a class="back" href="/duel">  Duel</a>
  <span class="eyebrow">1 vs 1. ${h(duel.lesson_title)}</span>
  <h1>Duel xonasi</h1>
  <p class="lead">Kod: <b>${h(duel.code)}</b>. ${
  duel.status === "waiting" ? "Raqib kutilmoqda": duel.status === "finished" ? "Yakunlangan": "Jonli"
  }</p>
  </div>
  </section>
  <section class="section tight">
  <div class="wrap">
  <div class="duel-vs">
  ${creatorCard}
  <div class="vs-badge">VS</div>
  ${opponentCard}
  </div>
  ${action}
  </div>
  </section>`;
}

function todayKey() {
  return new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
}

function tournamentTest() {
  return db
.prepare(
  `SELECT l.id FROM lessons l JOIN courses c ON c.id = l.course_id
  WHERE l.type = 'test' AND l.price = 0 AND c.is_published = 1
  AND (SELECT COUNT(*) FROM questions q WHERE q.lesson_id = l.id) > 0
  ORDER BY l.id LIMIT 1`
  )
.get();
}

const TOURNAMENT_CAP = 16;
const TOURNAMENT_QUESTIONS = 15;

function tournamentQuestions(tournamentId) {
  return db
    .prepare(
      "SELECT q.* FROM tournament_questions tq JOIN questions q ON q.id = tq.question_id WHERE tq.tournament_id = ? ORDER BY tq.position"
    )
    .all(tournamentId);
}

function prepareTournamentQuestions(tournamentId) {
  db.prepare("DELETE FROM tournament_questions WHERE tournament_id = ?").run(tournamentId);
  const picked = db
    .prepare("SELECT id FROM questions ORDER BY RANDOM() LIMIT ?")
    .all(TOURNAMENT_QUESTIONS);
  const insert = db.prepare(
    "INSERT OR IGNORE INTO tournament_questions (tournament_id, question_id, position) VALUES (?, ?, ?)"
  );
  picked.forEach((q, i) => insert.run(tournamentId, q.id, i + 1));
  return picked.length;
}

function ensureOpenTournament() {
  const day = todayKey();
  const open = db
.prepare(
  `SELECT t.* FROM tournaments t
  WHERE t.day = ? AND t.status = 'open'
  AND (SELECT COUNT(*) FROM tournament_entries e WHERE e.tournament_id = t.id) < 32
  ORDER BY t.group_no LIMIT 1`
  )
.get(day);
  if (open) return open;
  const last = db.prepare("SELECT COALESCE(MAX(group_no), 0) AS n FROM tournaments WHERE day = ?").get(day).n;
  const test = tournamentTest();
  const info = db
.prepare(
  "INSERT INTO tournaments (day, group_no, test_id, status, size, created_at) VALUES (?, ?, ?, 'open', 32, ?)"
  )
.run(day, Number(last) + 1, test ? test.id: 0, nowISO());
  return db.prepare("SELECT * FROM tournaments WHERE id = ?").get(Number(info.lastInsertRowid));
}

function ensureTournament() {
  const day = todayKey();
  const latest = db
.prepare("SELECT * FROM tournaments WHERE day = ? ORDER BY group_no DESC LIMIT 1")
.get(day);
  return latest || ensureOpenTournament();
}

function tournamentGroups(day = todayKey()) {
  return db.prepare("SELECT * FROM tournaments WHERE day = ? ORDER BY group_no").all(day);
}

function ensureJoinableTournament() {
  for (const tournament of tournamentGroups()) {
  const entries = tournamentEntries(tournament.id);
  if (entries.length >= TOURNAMENT_CAP) continue;
  const matches = tournamentMatches(tournament.id);
  const hasScores = matches.some((m) => m.s1 != null || m.s2 != null);
  if (tournament.status === "open" || (tournament.status === "live" && !hasScores)) return tournament;
  }
  return ensureOpenTournament();
}

function tournamentEntries(tid) {
  return db
.prepare(
  `SELECT e.*, u.name FROM tournament_entries e JOIN users u ON u.id = e.user_id
  WHERE e.tournament_id = ? ORDER BY e.seed`
  )
.all(tid);
}

function autoEnrollTournament(tournament) {
  if (!tournament || tournament.status !== "open") return tournamentEntries(tournament ? tournament.id : 0);
  const entries = tournamentEntries(tournament.id);
  if (entries.length >= TOURNAMENT_CAP) return entries;
  const enrolledToday = new Set(
    db
      .prepare(
        "SELECT e.user_id FROM tournament_entries e JOIN tournaments t ON t.id = e.tournament_id WHERE t.day = ?"
      )
      .all(tournament.day)
      .map((r) => r.user_id)
  );
  const users = db
    .prepare("SELECT id FROM users ORDER BY id")
    .all()
    .filter((u) => !enrolledToday.has(u.id));
  for (let i = users.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [users[i], users[j]] = [users[j], users[i]];
  }
  const insert = db.prepare(
    "INSERT OR IGNORE INTO tournament_entries (tournament_id, user_id, seed, joined_at) VALUES (?, ?, ?, ?)"
  );
  let seed = entries.length;
  for (const u of users) {
    if (seed >= TOURNAMENT_CAP) break;
    seed += 1;
    insert.run(tournament.id, u.id, seed, nowISO());
  }
  const fresh = tournamentEntries(tournament.id);
  if (fresh.length !== entries.length) {
    db.prepare("UPDATE tournaments SET size = ? WHERE id = ?").run(16, tournament.id);
  }
  return fresh;
}

function autoEnrollAll() {
  if (tashkentClock().minutes >= 1080) return;
  const day = todayKey();
  const enrolledToday = new Set(
    db
      .prepare(
        "SELECT e.user_id FROM tournament_entries e JOIN tournaments t ON t.id = e.tournament_id WHERE t.day = ?"
      )
      .all(day)
      .map((r) => r.user_id)
  );
  const pending = db.prepare("SELECT id FROM users").all().filter((u) => !enrolledToday.has(u.id));
  if (!pending.length) return;
  for (let i = 0; i < 20; i += 1) {
    const groups = tournamentGroups();
    let target = groups.find(
      (g) => g.status === "open" && tournamentEntries(g.id).length < TOURNAMENT_CAP
    );
    if (!target) {
      const hasOpen = groups.some((g) => g.status === "open");
      if (!hasOpen) {
        target = ensureOpenTournament();
      } else {
        const created = ensureOpenTournament();
        if (!created || tournamentEntries(created.id).length >= TOURNAMENT_CAP) break;
        target = created;
      }
    }
    if (!target) break;
    const before = tournamentEntries(target.id).length;
    autoEnrollTournament(target);
    if (tournamentEntries(target.id).length === before) break;
  }
}

function tournamentMatches(tid) {
  return db
.prepare("SELECT * FROM tournament_matches WHERE tournament_id = ? ORDER BY round, slot")
.all(tid);
}

function tournamentRoundName(size, round) {
  const rounds = Math.log2(size);
  if (round === rounds) return "FINAL";
  const left = size / 2 ** round;
  if (left === 2) return "1/2 FINAL";
  if (left === 4) return "1/4 FINAL";
  return `1/${left} FINAL`;
}

function bracketRoundTimes(size) {
  const rounds = Math.log2(size);
  const first = 10 * 60;
  const last = 16 * 60;
  const step = rounds > 1 ? (last - first) / (rounds - 1): 0;
  return Array.from({ length: rounds }, (_, i) => {
  const total = Math.round(first + step * i);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  });
}

function propagateTournament(tid) {
  const tournament = db.prepare("SELECT * FROM tournaments WHERE id = ?").get(tid);
  if (!tournament) return;
  const matches = tournamentMatches(tid);
  const byKey = new Map(matches.map((m) => [`${m.round}:${m.slot}`, m]));
  const rounds = Math.log2(tournament.size);
  for (let r = 1; r < rounds; r += 1) {
  for (const m of matches.filter((x) => x.round === r)) {
  if (!m.winner) continue;
  const next = byKey.get(`${r + 1}:${Math.floor(m.slot / 2)}`);
  if (!next) continue;
  const field = m.slot % 2 === 0 ? "p1": "p2";
  if (!next[field]) {
  db.prepare(`UPDATE tournament_matches SET ${field} = ? WHERE id = ?`).run(m.winner, next.id);
  next[field] = m.winner;
  }
  }
  for (const m of matches.filter((x) => x.round === r + 1)) {
  const a = byKey.get(`${r}:${m.slot * 2}`);
  const b = byKey.get(`${r}:${m.slot * 2 + 1}`);
  if (m.p1 && !m.p2 && b && !b.p1 && !b.p2 && !b.winner) {
  db.prepare("UPDATE tournament_matches SET winner = ?, status = 'bye', finished_at = ? WHERE id = ?").run(
  m.p1,
  nowISO(),
  m.id
  );
  m.winner = m.p1;
  m.status = "bye";
  } else if (m.p2 && !m.p1 && a && !a.p1 && !a.p2 && !a.winner) {
  db.prepare("UPDATE tournament_matches SET winner = ?, status = 'bye', finished_at = ? WHERE id = ?").run(
  m.p2,
  nowISO(),
  m.id
  );
  m.winner = m.p2;
  m.status = "bye";
  } else if (m.p1 && m.p2 && m.status === "pending") {
  db.prepare("UPDATE tournament_matches SET status = 'ready' WHERE id = ?").run(m.id);
  m.status = "ready";
  const startsAt = bracketRoundTimes(tournament.size)[r].split(":").map(Number);
  const startMinute = startsAt[0] * 60 + startsAt[1];
  const phase = tashkentClock().minutes >= startMinute ? "started" : "ready";
  notifyTournamentMatchPlayers(tid, r + 1, m.id, phase).catch(() => {});
  }
  }
  }
  const final = matches.find((m) => m.round === rounds);
  const finalNow = db
.prepare("SELECT * FROM tournament_matches WHERE tournament_id = ? AND round = ?")
.get(tid, rounds);
  if (finalNow && finalNow.winner) {
  db.prepare("UPDATE tournaments SET status = 'finished', finished_at = ? WHERE id = ? AND status != 'finished'").run(
  nowISO(),
  tid
  );
  }
}

function nextPowerOfTwo(count) {
  let size = 32;
  while (size < count && size < 128) size *= 2;
  return size;
}

function seedOrder(size) {
  let order = [0];
  while (order.length < size) {
  const n = order.length * 2;
  const next = [];
  for (const value of order) {
  next.push(value, n - 1 - value);
  }
  order = next;
  }
  return order;
}

function startTournament(tid) {
  const tournament = db.prepare("SELECT * FROM tournaments WHERE id = ?").get(tid);
  const entries = tournamentEntries(tid);
  if (!tournament || tournament.status !== "open" || entries.length < 2) return false;
  const size = Math.max(32, nextPowerOfTwo(entries.length));
  const order = seedOrder(size);
  const slots = new Array(size).fill(null);
  entries.slice(0, size).forEach((e, i) => {
  slots[order[i]] = e.user_id;
  });
  db.prepare("UPDATE tournaments SET status = 'live', size = ?, started_at = ? WHERE id = ?").run(
  size,
  nowISO(),
  tid
  );
  prepareTournamentQuestions(tid);
  db.prepare("DELETE FROM tournament_matches WHERE tournament_id = ?").run(tid);
  const rounds = Math.log2(size);
  for (let r = 1; r <= rounds; r += 1) {
  const count = size / 2 ** r;
  for (let s = 0; s < count; s += 1) {
  let p1 = null;
  let p2 = null;
  let status = "pending";
  let winner = null;
  if (r === 1) {
  p1 = slots[s * 2];
  p2 = slots[s * 2 + 1];
  if (p1 && p2) status = "ready";
  else if (p1) {
  status = "bye";
  winner = p1;
  } else if (p2) {
  status = "bye";
  winner = p2;
  }
  }
  db.prepare(
  "INSERT INTO tournament_matches (tournament_id, round, slot, p1, p2, winner, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(tid, r, s, p1, p2, winner, status, nowISO());
  }
  }
  propagateTournament(tid);
  notifyTournamentMatchPlayers(tid, 1).catch(() => {});
  return true;
}

function bracketMatchCard(match, names, user) {
  const p1 = match.p1 ? names[match.p1]: null;
  const p2 = match.p2 ? names[match.p2]: null;
  const score = (id, s) => (id && s != null ? `<em>${s}</em>`: "");
  const canPlay =
  match.status === "ready" &&
  user &&
  (match.p1 === user.id || match.p2 === user.id) &&
  (match.p1 !== user.id || match.s1 == null) &&
  (match.p2 !== user.id || match.s2 == null);
  return `<div class="bracket-match ${match.status}${match.winner ? " done": ""}">
  <div class="bracket-player${match.winner === match.p1 && match.p1 ? " win": ""}">
  <span>${p1 ? h(p1): " "}</span>${score(match.p1, match.s1)}
  </div>
  <div class="bracket-player${match.winner === match.p2 && match.p2 ? " win": ""}">
  <span>${p2 ? h(p2): " "}</span>${score(match.p2, match.s2)}
  </div>
  ${canPlay ? `<a class="bracket-play" href="/duel/tournament/match/${match.id}">O'ynash</a>`: ""}
  ${match.status === "bye" ? `<span class="bracket-tag">BYE</span>`: ""}
  ${match.status === "ready" && !canPlay ? `<span class="bracket-tag live">Kutilmoqda</span>`: ""}
  </div>`;
}

function bracketPreview(size = 8) {
  const card = `<div class="bracket-match"><div class="bracket-player"><span> </span></div><div class="bracket-player"><span> </span></div></div>`;
  const rounds = Math.log2(size);
  const times = bracketRoundTimes(size);
  const columns = [];
  for (let r = 1; r <= rounds; r += 1) {
  const count = size / 2 ** r;
  columns.push(`<div class="bracket-round"><div class="bracket-title${r === rounds ? " final": ""}">${tournamentRoundName(
  size,
  r
  )}${r === rounds ? ` <span class="bracket-cup">x </span>`: ""}</div><div class="bracket-time"> ${times[r - 1]}</div><div class="bracket-list">${card.repeat(
  count
  )}</div></div>`);
  }
  columns.push(`<div class="bracket-round winner-round"><div class="bracket-title final">G'OLIB</div><div class="bracket-time">x </div><div class="bracket-list"><div class="bracket-winner"><span class="bracket-trophy">x </span><b> </b><small>G'olib shu yerda</small></div></div></div>`);
  return `<div class="bracket-scroll"><div class="bracket">${columns.join("")}</div></div>`;
}

function tournamentPage(tournament, user, admin, groups = []) {
  const entries = tournamentEntries(tournament.id);
  const matches = tournamentMatches(tournament.id);
  const names = Object.fromEntries(
  db.prepare("SELECT id, name FROM users").all().map((u) => [u.id, u.name])
  );
  const joined = user && entries.some((e) => e.user_id === user.id);
  const hasScores = matches.some((m) => m.s1 != null || m.s2 != null);
  const lateOpen = tournament.status === "open" || (tournament.status === "live" && !hasScores);
  const testLabel = `Aralash test · ${TOURNAMENT_QUESTIONS} savol`;
  const rounds = tournament.status === "open" ? 0: Math.log2(tournament.size);
  const champion = matches.find((m) => m.round === rounds && m.winner);

  let banner = "";
  if (admin && tournament.status === "open") {
  banner = `<div class="card tour-join">
  <div><b>Turnirni boshqarish</b><p class="muted small">${entries.length} ishtirokchi. Boshlash uchun kamida 2 ishtirokchi kerak.</p></div>
  <form method="post" action="/duel/tournament/start"><button class="btn btn-primary" type="submit" ${
  entries.length >= 2 ? "": "disabled"
  }>Turnirni boshlash</button></form>
  </div>`;
  } else if (!user) {
  banner = `<div class="card empty"><b>Turnirda qatnashish uchun tizimga kiring.</b><div class="actions" style="justify-content:center;margin-top:12px"><a class="btn btn-primary" href="/login?next=/duel/tournament">Kirish</a></div></div>`;
  } else if (lateOpen && !joined) {
  banner = `<div class="card empty"><b>Siz bugungi turnirda qatnashmayapsiz.</b><p class="muted small">${entries.length} ishtirokchi. Turnir 09:00 da avtomatik boshlanadi.</p></div>`;
  } else if (lateOpen) {
  banner = `<div class="card tour-join"><div><b>Siz avtomatik qatnashasiz S&</b><p class="muted small">${entries.length} ishtirokchi. Turnir 09:00 da avtomatik boshlanadi   qo'shilish tugmasini bosish shart emas.</p></div>${
  admin
  ? `<form method="post" action="/duel/tournament/start"><button class="btn btn-primary" type="submit" ${
  entries.length >= 2 ? "": "disabled"
  }>Turnirni boshlash</button></form>`
: ""
  }</div>`;
  } else if (tournament.status === "finished") {
  banner = `<div class="card tour-champion"><span class="tour-cup">x </span><div><span class="eyebrow">Kunlik duel g'olibi</span><h2>${h(
  champion ? names[champion.winner] || "G'olib": "Aniqlanmadi"
  )}</h2><p class="muted small">${h(tournament.day)}. ${h(testLabel)}</p></div></div>`;
  }

  const columns = [];
  if (rounds) {
  const times = bracketRoundTimes(tournament.size);
  for (let r = 1; r <= rounds; r += 1) {
  const list = matches.filter((m) => m.round === r).sort((a, b) => a.slot - b.slot);
  columns.push(`<div class="bracket-round">
  <div class="bracket-title${r === rounds ? " final": ""}">${tournamentRoundName(tournament.size, r)}${
  r === rounds ? ` <span class="bracket-cup">x </span>`: ""
  }</div>
  <div class="bracket-time"> ${times[r - 1]}</div>
  <div class="bracket-list">${list.map((m) => bracketMatchCard(m, names, user)).join("")}</div>
  </div>`);
  }
  const winnerName = champion ? names[champion.winner] || "G'olib": "";
  columns.push(`<div class="bracket-round winner-round">
  <div class="bracket-title final">G'OLIB</div>
  <div class="bracket-time">x  ${champion ? "Aniqlangan": "Kutilmoqda"}</div>
  <div class="bracket-list"><div class="bracket-winner${winnerName ? " done": ""}">
  <span class="bracket-trophy">x </span>
  <b>${winnerName ? h(winnerName): " "}</b>
  <small>${winnerName ? "Turnir g'olibi": "G'olib shu yerda"}</small>
  </div></div>
  </div>`);
  }

  const participants = entries.length
  ? entries
.map(
  (e, i) => `<span class="tour-chip"><b>${i + 1}</b> ${h(e.name)}${e.user_id === (user && user.id) ? ". siz": ""}</span>`
  )
.join("")
: `<span class="muted">Hozircha ishtirokchilar yo'q.</span>`;

  return `<section class="duel-hero tour-hero">
  <div class="wrap">
  <a class="back" href="/duel">  Duel</a>
  <span class="eyebrow">Kunlik pley-off. ${h(tournament.day)}</span>
  <h1>Kunlik duel${groups.length > 1 ? `. ${tournament.group_no}-guruh`: ""}</h1>
  <p class="lead">${h(testLabel)}. ${entries.length} ishtirokchi. finalga qadar sxema.</p>
  </div>
  </section>
  ${
  groups.length > 1
  ? `<div class="wrap tour-tabs">${groups
.map(
  (g) =>
  `<a class="tour-tab${g.id === tournament.id ? " active": ""}" href="/duel/tournament?g=${
  g.group_no
  }">${g.group_no}-guruh</a>`
  )
.join("")}</div>`
: ""
  }
  <section class="section tight">
  <div class="wrap">
  ${banner}
  <div class="tour-participants">${participants}</div>
  ${
  tournament.status === "open"
  ? `${bracketPreview(nextPowerOfTwo(Math.max(32, entries.length)))}<p class="muted small center">Barcha ro'yxatdan o'tgan a'zolar avtomatik qo'shiladi. Turnir 09:00 da boshlanadi.</p>`
: `<div class="bracket-scroll"><div class="bracket">${columns.join("")}</div></div>`
  }
  <p class="muted small center" style="margin-top:16px">Har bir match ${TOURNAMENT_QUESTIONS} ta aralash savol. Har savolga 60 soniya. ko'proq to'g'ri javob, teng bo'lsa tezroq o'yinchi yutadi.</p>
  </div>
  </section>`;
}

function tournamentMatchPage(match, tournament, questions, user) {
  const total = questions.length;
  const limit = Math.max(1, total) * 60;
  const names = Object.fromEntries(
  db.prepare("SELECT id, name FROM users WHERE id IN (?, ?)").all(match.p1, match.p2).map((u) => [u.id, u.name])
  );
  const slides = questions
.map(
  (q, i) => `<section class="q-slide${i === 0 ? " is-active": ""}" data-i="${i}">
  <div class="q-label">${i + 1}-savol</div>
  <h2 class="q-title">${h(q.text)}</h2>
  <div class="q-options">
  ${[1, 2, 3, 4]
.map(
  (n) => `<label class="q-opt"><input type="radio" name="q${q.id}" value="${n}"><span class="q-letter">${"ABCD"[n - 1]}</span><span class="q-text">${h(q["o" + n])}</span></label>`
  )
.join("")}
  </div>
  </section>`
  )
.join("");
  const body = `
  <header class="test-header">
  <a class="test-brand" href="/duel/tournament"><span class="mark">H</span><b>Kunlik duel</b></a>
  <div class="test-mid"><b>${h(names[match.p1] || "?")} vs ${h(names[match.p2] || "?")}</b><span id="qCounter">1 / ${total} savol</span></div>
  <div class="test-tools"><span class="duel-live">${tournamentRoundName(tournament.size, match.round)}</span><a class="test-exit" href="/duel/tournament">Chiqish</a><div class="test-timer" id="timer">--:--</div></div>
  </header>
  <main class="test-main single">
  <section class="test-pane">
  <form method="post" action="/duel/tournament/match/${match.id}/submit" id="tourForm">
  <input type="hidden" name="tour_total" value="${total}">
  ${slides}
  <div class="test-nav">
  <button type="button" class="tbtn" id="prevBtn">  Oldingi</button>
  <div class="q-dots" id="dots"></div>
  <button type="button" class="tbtn primary" id="nextBtn">Keyingi   </button>
  <button type="submit" class="tbtn primary" id="finishBtn" hidden>Yakunlash</button>
  </div>
  </form>
  </section>
  </main>
  <script>
  (function () {
  var slides = Array.prototype.slice.call(document.querySelectorAll('.q-slide'));
  var counter = document.getElementById('qCounter');
  var prev = document.getElementById('prevBtn');
  var next = document.getElementById('nextBtn');
  var finish = document.getElementById('finishBtn');
  var form = document.getElementById('tourForm');
  var dots = document.getElementById('dots');
  var index = 0;
  slides.forEach(function (s, i) { var d = document.createElement('span'); d.className = 'q-dot' + (i === 0 ? ' active': ''); dots.appendChild(d); });
  var dotEls = Array.prototype.slice.call(dots.children);
  function refresh() {
  counter.textContent = (index + 1) + ' / ' + slides.length + (document.documentElement.lang === 'en' ? ' questions' : ' savol');
  prev.disabled = index === 0;
  next.hidden = index === slides.length - 1;
  finish.hidden = index !== slides.length - 1;
  dotEls.forEach(function (d, i) { d.classList.toggle('active', i === index); d.classList.toggle('answered', !!slides[i].querySelector('input:checked')); });
  }
  function show(n) { index = Math.max(0, Math.min(slides.length - 1, n)); slides.forEach(function (s, i) { s.classList.toggle('is-active', i === index); }); refresh(); }
  prev.addEventListener('click', function () { show(index - 1); });
  next.addEventListener('click', function () { show(index + 1); });
  document.querySelectorAll('.q-opt input').forEach(function (i) { i.addEventListener('change', refresh); });
  form.addEventListener('submit', function (e) {
  var unanswered = slides.filter(function (s) { return !s.querySelector('input:checked'); }).length;
  if (unanswered && !confirm((document.documentElement.lang === 'en' ? unanswered + ' questions unanswered. Submit anyway?' : unanswered + ' ta savol javobsiz. Baribir yakunlaysizmi?'))) e.preventDefault();
  });
  var left = ${limit};
  var timer = document.getElementById('timer');
  function tick() {
  var m = Math.floor(left / 60);
  var s = left % 60;
  timer.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  if (left <= 0) { form.submit(); return; }
  left -= 1;
  }
  tick();
  setInterval(tick, 1000);
  })();
  </script>`;
  return testDocument({ title: "Kunlik duel", body });
}

function tashkentClock() {
  const d = new Date(Date.now() + 5 * 3600000);
  return {
  day: d.toISOString().slice(0, 10),
  minutes: d.getUTCHours() * 60 + d.getUTCMinutes()
  };
}

function tournamentPairingLines(tournamentId, round) {
  const rows = db
.prepare(
  `SELECT m.slot, m.p1, m.p2, m.winner, m.status,
  u1.name AS p1name, u1.telegram_username AS p1username,
  u2.name AS p2name, u2.telegram_username AS p2username
  FROM tournament_matches m
  LEFT JOIN users u1 ON u1.id = m.p1
  LEFT JOIN users u2 ON u2.id = m.p2
  WHERE m.tournament_id = ? AND m.round = ?
  ORDER BY m.slot`
  )
.all(tournamentId, round);
  if (!rows.length) return "Juftliklar hali tayyor emas.";
  return rows
.map((m, i) => {
  const a = m.p1name ? telegramPublicName(m.p1name, m.p1username) : " ";
  const b = m.p2name ? telegramPublicName(m.p2name, m.p2username) : "raqib yo'q";
  return `${i + 1}. ${a} vs ${b}`;
  })
.join("\n");
}

async function sendTournamentSchedule(tournament) {
  const entries = tournamentEntries(tournament.id);
  const times = bracketRoundTimes(tournament.size);
  const schedule = times.map((time, i) => `${time}   ${tournamentRoundName(tournament.size, i + 1)}`).join("\n");
  const text = `<b>Bugungi duel kubogi</b>
${h(tournament.day)}
Aralash test · ${TOURNAMENT_QUESTIONS} savol
${entries.length} ishtirokchi

 <b>Kun jadvali</b>
09:00   start
${schedule}
17:15   g'olib
18:00   yakun

<b>${tournamentRoundName(tournament.size, 1)} juftliklari</b>
${tournamentPairingLines(tournament.id, 1)}

Duelni ochish: /duel/tournament`;
  await notifyTelegram(
  text,
  telegramDuelKeyboard(`/duel/tournament?g=${tournament.group_no}`, "Turnirni ochish")
  );
}

async function sendTournamentRound(tournament, round) {
  const label = tournamentRoundName(tournament.size, round);
  const text = `<b>${label} boshlandi</b>
${h(tournament.day)}

${tournamentPairingLines(tournament.id, round)}

Duelni ochish: /duel/tournament`;
  await notifyTelegram(
  text,
  telegramDuelKeyboard(`/duel/tournament?g=${tournament.group_no}`, "Turnirni ochish")
  );
}

async function sendTournamentWinner(tournament) {
  const rounds = Math.log2(tournament.size);
  const final = db
.prepare("SELECT * FROM tournament_matches WHERE tournament_id = ? AND round = ?")
.get(tournament.id, rounds);
  if (!final || !final.winner) {
  await notifyTelegram(`<b>Bugungi duel kubogi</b>\nFinal hali yakunlanmagan. 18:00 gacha davom etadi.`);
  return;
  }
  const winner = db.prepare("SELECT name, telegram_username FROM users WHERE id = ?").get(final.winner);
  await notifyTelegram(`<b>Bugungi duel kubogi g'olibi: ${telegramPublicName(winner?.name, winner?.telegram_username, "?")}!</b>
${h(tournament.day)}

Tabriklaymiz! Keyingi kubok   keyingi ish kuni, juftlar 09:00 da, duellar 10:00 dan.`);
}

async function closeTournament(tournament) {
  const rounds = Math.log2(tournament.size);
  const final = db
.prepare("SELECT * FROM tournament_matches WHERE tournament_id = ? AND round = ?")
.get(tournament.id, rounds);
  db.prepare("UPDATE tournaments SET status = 'finished', finished_at = ? WHERE id = ?").run(
  nowISO(),
  tournament.id
  );
  return final ? final.winner: null;
}

async function tournamentTick() {
  const clock = tashkentClock();
  let groups = tournamentGroups(clock.day);
  if (!groups.length) {
  ensureOpenTournament();
  groups = tournamentGroups(clock.day);
  }

  for (const tournament of groups) {
  const flag = (key) => `tour_${tournament.day}_${tournament.group_no}_${key}`;
  const label = tournament.group_no > 1 ? ` (${tournament.group_no}-guruh)`: "";

  if (tournament.status === "open") autoEnrollAll();

  if (tournament.status === "open" && clock.minutes >= 540 && clock.minutes < 1080) {
  const entries = tournamentEntries(tournament.id);
  if (entries.length >= 2) {
  if (startTournament(tournament.id)) {
  const fresh = db.prepare("SELECT * FROM tournaments WHERE id = ?").get(tournament.id);
  if (metaGet(flag("start")) !== "1") {
  metaSet(flag("start"), "1");
  await sendTournamentSchedule(fresh);
  }
  }
  } else if (metaGet(flag("need")) !== "1") {
  metaSet(flag("need"), "1");
  await notifyTelegram(
  `<b>Bugungi duel kubogi${label}</b>\nTurnir 09:00 da boshlanishi kerak edi, lekin hozircha ${entries.length} ishtirokchi bor.\nKamida 2 ishtirokchi kerak. /duel/tournament`
  );
  }
  }

  if (tournament.status === "live") {
  const rounds = Math.log2(tournament.size);
  const roundTimes = bracketRoundTimes(tournament.size).map((time) => {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
  });
  for (let r = 1; r <= rounds; r += 1) {
  const key = `r${r}`;
  if (clock.minutes >= roundTimes[r - 1] && metaGet(flag(key)) !== "1") {
  metaSet(flag(key), "1");
  await sendTournamentRound(tournament, r);
  }
  if (clock.minutes >= roundTimes[r - 1] - 5 && clock.minutes < roundTimes[r - 1] && metaGet(flag(`r${r}_reminder`)) !== "1") {
  metaSet(flag(`r${r}_reminder`), "1");
  const matches = db.prepare("SELECT id FROM tournament_matches WHERE tournament_id = ? AND round = ? AND status = 'ready'").all(tournament.id, r);
  for (const match of matches) await notifyTournamentMatchPlayers(tournament.id, r, match.id, "reminder");
  }
  if (clock.minutes >= roundTimes[r - 1] && metaGet(flag(`r${r}_started`)) !== "1") {
  metaSet(flag(`r${r}_started`), "1");
  const matches = db.prepare("SELECT id FROM tournament_matches WHERE tournament_id = ? AND round = ? AND status = 'ready'").all(tournament.id, r);
  for (const match of matches) await notifyTournamentMatchPlayers(tournament.id, r, match.id, "started");
  }
  }
  if (clock.minutes >= 1035 && metaGet(flag("winner")) !== "1") {
  metaSet(flag("winner"), "1");
  await sendTournamentWinner(tournament);
  }
  }

  if (clock.minutes >= 1080 && tournament.status !== "finished") {
  const winnerId = await closeTournament(tournament);
  metaSet(flag("closed"), "1");
  if (winnerId) {
  const winner = db.prepare("SELECT name, telegram_username FROM users WHERE id = ?").get(winnerId);
  await notifyTelegram(
  `<b>Kunlik duel yakunlandi${label}</b>\nG'olib: <b>${telegramPublicName(winner?.name, winner?.telegram_username, "?")}</b>\n18:00 da turnir yopildi.`
  );
  } else {
  await notifyTelegram(
  `<b>Kunlik duel yakunlandi${label}</b>\n18:00 da turnir yopildi. Bugun g'olib aniqlanmadi.`
  );
  }
  }
  }
}

function startTournamentScheduler() {
  setTimeout(() => {
  tournamentTick().catch((e) => console.error("[tour]", e.message));
  }, 5000);
  setInterval(() => {
  tournamentTick().catch((e) => console.error("[tour]", e.message));
  }, 60 * 1000);
}

/* --------------------------------------------------- daily Telegram reminders */
function dayRange(day) {
  const start = new Date(`${day}T00:00:00+05:00`);
  const end = new Date(start.getTime() + 24 * 3600 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function activeUserIdsToday(day) {
  const { start, end } = dayRange(day);
  const ids = new Set();
  db.prepare("SELECT DISTINCT user_id FROM progress WHERE completed_at >= ? AND completed_at < ?")
.all(start, end)
.forEach((row) => ids.add(row.user_id));
  db.prepare(
  `SELECT DISTINCT e.user_id FROM tournament_entries e
  JOIN tournaments t ON t.id = e.tournament_id
  WHERE t.day = ? AND EXISTS (
  SELECT 1 FROM tournament_matches m
  WHERE m.tournament_id = t.id AND (m.p1 = e.user_id OR m.p2 = e.user_id)
  AND (m.s1 IS NOT NULL OR m.s2 IS NOT NULL)
  )`
  )
.all(day)
.forEach((row) => ids.add(row.user_id));
  return ids;
}

function tournamentWinnerToday(day) {
  const final = db
.prepare(
  `SELECT m.winner, u.name, u.telegram_username FROM tournament_matches m
  JOIN tournaments t ON t.id = m.tournament_id
  LEFT JOIN users u ON u.id = m.winner
  WHERE t.day = ? AND m.winner IS NOT NULL
  ORDER BY t.group_no DESC, m.round DESC LIMIT 1`
  )
.get(day);
  return final && final.name ? telegramPublicName(final.name, final.telegram_username): "";
}

async function reminderStep(key, at, handler) {
  const clock = tashkentClock();
  if (clock.minutes < at || clock.minutes > at + 90) return;
  const flag = `rem_${clock.day}_${key}`;
  if (metaGet(flag) === "1") return;
  metaSet(flag, "1");
  await handler(clock.day);
}

async function reminderTick() {
  const clock = tashkentClock();
  const day = clock.day;
  const telegramUsers = db
.prepare("SELECT id, name, telegram_id, telegram_username FROM users WHERE telegram_id IS NOT NULL AND telegram_id <> ''")
.all();
  if (!telegramUsers.length) return;

  const send = async (list, textFor, path, label) => {
  for (const user of list) {
  await sendUserMessage(user.id, textFor(user), path, label).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 80));
  }
  };

  await reminderStep("09", 540, async () => {
  const active = activeUserIdsToday(day);
  const list = telegramUsers.filter((u) => !active.has(u.id));
  if (!list.length) return;
  await send(
  list,
  (u) => `<b>Assalomu alaykum, ${telegramPublicName(u.name, u.telegram_username)}!</b>\n\nBugungi bosqich boshlandi va soat <b>18:00</b> gacha davom etadi.\nBugun allaqachon <b>${active.size}</b> kishi qatnashdi.\n\nBosqichni hoziroq boshlang!`,
  "/duel/tournament",
  "Bosqichni boshlash"
  );
  });

  await reminderStep("12", 720, async () => {
  const active = activeUserIdsToday(day);
  const list = telegramUsers.filter((u) => !active.has(u.id));
  if (!list.length) return;
  await send(
  list,
  (u) => `<b>${telegramPublicName(u.name, u.telegram_username)}</b>, bugun hali qatnashmadingiz.\n\nBosqich <b>18:00</b> gacha ochiq.\nBugun <b>${active.size}</b> kishi allaqachon qatnashdi.\n\nVaqtni boy bermang!`,
  "/duel/tournament",
  "Bosqichni ochish"
  );
  });

  await reminderStep("17", 1020, async () => {
  const active = activeUserIdsToday(day);
  const list = telegramUsers.filter((u) => !active.has(u.id));
  if (!list.length) return;
  await send(
  list,
  (u) => `<b>${telegramPublicName(u.name, u.telegram_username)}</b>, bugungi bosqich hali bajarilmagan!\n\nBosqich <b>18:00</b> da yopiladi — atigi <b>1 soat</b> qoldi.\nBugun <b>${active.size}</b> kishi qatnashdi.\n\nHoziroq qo'shiling!`,
  "/duel/tournament",
  "Bosqichni ochish"
  );
  });

  await reminderStep("18", 1081, async () => {
  const active = activeUserIdsToday(day);
  const winner = tournamentWinnerToday(day);
  const weekly = new Date(`${day}T12:00:00+05:00`).getUTCDay() === 0;
  await send(
  telegramUsers,
  (u) =>
  `<b>Kun yakunlandi.</b>\n\nBugun <b>${active.size}</b> kishi qatnashdi.${
  winner ? `\nKun g'olibi: <b>${winner}</b>`: ""
  }\n\n${
  weekly
  ? "Hafta yakunlandi. <b>Dushanba 09:00</b> da yangi hafta boshlanadi. Qaytib keling!"
: "Ertaga <b>09:00</b> da yangi bosqich boshlanadi. Qaytib keling!"
  }`,
  "/leaderboard",
  "Natijalarni ko'rish"
  );
  });
}

async function engagementTick() {
  const clock = tashkentClock();
  const day = clock.day;

  /* Dars tugatmaganlarga kunlik eslatma */
  await reminderStep("lesson", 1140, async () => {
    const { start, end } = dayRange(day);
    const doneToday = new Set(
      db
        .prepare("SELECT DISTINCT user_id FROM progress WHERE completed_at >= ? AND completed_at < ?")
        .all(start, end)
        .map((r) => r.user_id)
    );
    const list = db
      .prepare("SELECT id, name FROM users WHERE telegram_id IS NOT NULL AND telegram_id <> ''")
      .all()
      .filter((u) => !doneToday.has(u.id));
    for (const user of list) {
      await sendUserMessage(
        user.id,
        `<b>${h(user.name)}</b>, bugun hali dars tugatmadingiz.\n\nBugungi rejani bajaring — yangi dars va testlar sizni kutmoqda.`,
        "/dashboard",
        "Darsni boshlash"
      ).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  });

  /* 3 kundan ortiq kirmaganlarga haftalik eslatma */
  await reminderStep("inactive", 600, async () => {
    const inactiveCutoff = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    const nudgeCutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const list = db
      .prepare(
        `SELECT id, name FROM users
         WHERE telegram_id IS NOT NULL AND telegram_id <> ''
         AND COALESCE(NULLIF(last_login_at, ''), created_at) < ?
         AND (last_nudge_at IS NULL OR last_nudge_at = '' OR last_nudge_at < ?)`
      )
      .all(inactiveCutoff, nudgeCutoff);
    for (const user of list) {
      db.prepare("UPDATE users SET last_nudge_at = ? WHERE id = ?").run(nowISO(), user.id);
      await sendUserMessage(
        user.id,
        `<b>${h(user.name)}</b>, sizni sog'indik!\n\nOxirgi kirishdan 3 kundan ko'proq vaqt o'tdi. Bugungi darsni davom ettiring.`,
        "/dashboard",
        "Davom ettirish"
      ).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  });
}

function startEngagementScheduler() {
  setTimeout(() => {
    engagementTick().catch((e) => console.error("[engage]", e.message));
  }, 20000);
  setInterval(() => {
    engagementTick().catch((e) => console.error("[engage]", e.message));
  }, 60 * 1000);
}

function startReminderScheduler() {
  setTimeout(() => {
  reminderTick().catch((e) => console.error("[rem]", e.message));
  }, 15000);
  setInterval(() => {
  reminderTick().catch((e) => console.error("[rem]", e.message));
  }, 60 * 1000);
}


function dashboardTestSequence(userId) {
  const tests = db.prepare(
    `SELECT l.*, c.title AS course_title, c.category AS course_category
     FROM lessons l JOIN courses c ON c.id = l.course_id
     WHERE c.is_published = 1 AND l.type = 'test'
     AND EXISTS (SELECT 1 FROM questions q WHERE q.lesson_id = l.id)
       ORDER BY CASE WHEN c.category = 'attestation' THEN 0 ELSE 1 END,
         CASE WHEN c.category = 'attestation' THEN CASE lower(c.title)
           WHEN 'reading testlari' THEN 0 WHEN 'grammar testlari' THEN 1
           WHEN 'vocabulary testlari' THEN 2 WHEN 'pragmatika testlari' THEN 3
           WHEN 'pedagogik mahorat testlari' THEN 4 WHEN 'kasbiy standart testlari' THEN 5
           WHEN 'toifa testlari' THEN 6 ELSE 7 END ELSE 0 END,
         c.id, l.position, l.id`
  ).all();
  const completed = new Set(db.prepare(
    `SELECT p.lesson_id FROM progress p JOIN lessons l ON l.id = p.lesson_id
     JOIN courses c ON c.id = l.course_id
     WHERE p.user_id = ? AND l.type = 'test'
       AND p.score >= CASE WHEN c.category = 'attestation' THEN ? ELSE ? END
       AND c.is_published = 1`
  ).all(userId, ATTESTATION_TEST_PASS_PERCENT, TEST_PASS_PERCENT).map((row) => Number(row.lesson_id)));
  return { tests, completed };
}

function isFirstAttestationCategoryTest(test, tests) {
  const groupName = normalizeAttestationGroupName(test?.course_title);
  if (!ATTESTATION_GROUP_PRIORITY.has(groupName) && groupName !== "toifa testlari") return false;
  const firstInGroup = tests.find((item) => Number(item.course_id) === Number(test.course_id));
  return Number(firstInGroup?.id) === Number(test.id);
}

function isFirstCourseTest(test, tests) {
  if (!test || test.type !== "test") return false;
  const firstInCourse = tests.find((item) => Number(item.course_id) === Number(test.course_id));
  return Number(firstInCourse?.id) === Number(test.id);
}

function dashboardPage(user) {
  const copy = siteTexts();
  const sequence = dashboardTestSequence(user.id);
  const lessons = sequence.tests;
  const done = sequence.completed;
  const total = lessons.length;
  const completed = lessons.filter((l) => done.has(l.id)).length;
  const pct = total ? Math.round((completed / total) * 100) : 0;
  const firstIncompleteIndex = lessons.findIndex((lesson) => !done.has(lesson.id));
  const next = lessons.find((l) => !done.has(l.id));
  const nextNeedsPlan = !!(next && Number(next.price) > 0 && !testOwned(user.id, next.id));
  const clock = tashkentClock();
  const activityDays = db.prepare("SELECT DISTINCT substr(completed_at, 1, 10) AS day FROM progress WHERE user_id = ? AND completed_at <> '' ORDER BY day DESC LIMIT 400").all(user.id);
  const dayStamp = (value) => {
    const [year, month, day] = String(value || "").split("-").map(Number);
    return year && month && day ? Date.UTC(year, month - 1, day) : NaN;
  };
  const todayStamp = dayStamp(clock.day);
  let streak = 0;
  if (activityDays.length && todayStamp - dayStamp(activityDays[0].day) <= 86400000) {
    let expected = dayStamp(activityDays[0].day);
    for (const activity of activityDays) {
      if (dayStamp(activity.day) !== expected) break;
      streak += 1;
      expected -= 86400000;
    }
  }
  const rankRow = db
    .prepare(
      `SELECT rank FROM (
         SELECT user_id, COUNT(*) AS c, RANK() OVER (ORDER BY COUNT(*) DESC) AS rank
         FROM progress WHERE lesson_id IN (SELECT id FROM lessons WHERE type = 'test') GROUP BY user_id
       ) t WHERE user_id = ?`
    )
    .get(user.id);
  const classSize = Number(db.prepare("SELECT COUNT(*) AS n FROM users WHERE is_blocked = 0").get().n) || 1;
  const rank = Number(rankRow && rankRow.rank) || classSize;
  const achievements = [completed >= 1, completed >= 5, completed >= 10, completed >= 25, completed >= 50, completed >= 75, completed >= 100, completed >= 150, completed >= 200].filter(Boolean).length;
  const totalAchievements = 9;
  const weekStart = new Date(Date.now() - 7 * 86400000).toISOString();
  const weekly = db
    .prepare(
      `SELECT u.id, u.name, COUNT(DISTINCT p.lesson_id) AS c
       FROM progress p JOIN users u ON u.id = p.user_id JOIN lessons l ON l.id = p.lesson_id
       WHERE l.type = 'test' AND p.completed_at >= ? GROUP BY p.user_id ORDER BY c DESC, u.name LIMIT 5`
    )
    .all(weekStart);
  const weeklyIds = weekly.map((row) => Number(row.id));
  const weeklyStreaks = new Map();
  if (weeklyIds.length) {
    const placeholders = weeklyIds.map(() => "?").join(",");
    const recentDays = db.prepare(`SELECT DISTINCT user_id, substr(completed_at, 1, 10) AS day FROM progress WHERE user_id IN (${placeholders}) AND completed_at <> '' ORDER BY user_id, day DESC`).all(...weeklyIds);
    for (const id of weeklyIds) {
      const days = recentDays.filter((row) => Number(row.user_id) === id).map((row) => dayStamp(row.day));
      const latest = days[0];
      let count = 0;
      if (Number.isFinite(latest) && todayStamp - latest <= 86400000) {
        let expected = latest;
        for (const day of days) {
          if (day !== expected) break;
          count += 1;
          expected -= 86400000;
        }
      }
      weeklyStreaks.set(id, count);
    }
  }

  const dayIndex = Math.floor(dayStamp(clock.day) / 86400000);
  const quoteStartDay = Math.floor(Date.UTC(2026, 10, 24) / 86400000);
  const quoteSlot = clock.minutes >= 12 * 60 ? 1 : 0;
  const quoteSequenceIndex = (dayIndex - quoteStartDay) * 2 + quoteSlot;
  const quoteIndex = ((quoteSequenceIndex % DAILY_WISDOM.length) + DAILY_WISDOM.length) % DAILY_WISDOM.length;
  const quote = DAILY_WISDOM[quoteIndex];
  const dashboardQuoteText = quote.text;

  const nextCard = next
    ? `<a class="dash-hero-card" href="${
        nextNeedsPlan ? "/plans" : next.type === "test" ? `/test/${next.id}` : `/lesson/${next.id}`
      }">
        <span class="dash-hero-ico"><svg viewBox="0 0 24 24"><path d="m9 7 8 5-8 5z"/></svg></span>
        <span class="dash-hero-copy">
          <small>${h(next.course_title)}</small>
          <b>${h(next.title)}</b>
          <span class="muted">${nextNeedsPlan ? copy.dashboard_plan_required : copy.dashboard_next_test} | ${
        nextNeedsPlan ? copy.dashboard_open_access : `${Number(next.duration_min) || 30} ${h(copy.dashboard_duration_unit)}`
      } | ${completed}/${total} ${h(copy.dashboard_completed)}</span>
        <span class="dash-hero-progress"><i><b style="width:${pct}%"></b></i><small>${completed}/${total} ${h(copy.dashboard_test_unit)} ${h(copy.dashboard_completed)}</small></span>
        </span>
        <span class="dash-hero-go">&rarr;</span>
      </a>`
    : `<div class="dash-hero-card done"><span class="dash-hero-ico">&#10003;</span><span class="dash-hero-copy"><b>${h(copy.dashboard_done_title)}</b><span class="muted">${h(copy.dashboard_done_description)}</span></span></div>`;

  const dashboardTests = lessons.filter((lesson) =>
    lesson.course_category === "tkt" ||
    (lesson.course_category === "attestation" && normalizeAttestationGroupName(lesson.course_title) === "toifa testlari")
  );
  const lessonCards = dashboardTests.length
    ? `<section class="dl-group">
      <div class="dl-group-head"><h3>${h(copy.dashboard_tests_title)}</h3><span>${dashboardTests.length} ${h(copy.dashboard_test_count_suffix)}</span></div>
      <div class="dl-grid list">${dashboardTests.map((l, i) => {
        const isDone = done.has(l.id);
        const sequenceIndex = lessons.findIndex((item) => Number(item.id) === Number(l.id));
        const sequenceLocked = firstIncompleteIndex >= 0 && sequenceIndex > firstIncompleteIndex && !isFirstAttestationCategoryTest(l, lessons);
        const lockedPaidTest = !sequenceLocked && Number(l.price) > 0 && !testOwned(user.id, l.id);
        const href = sequenceLocked ? "" : lockedPaidTest ? "/plans" : `/test/${l.id}`;
        const cardTag = sequenceLocked ? "div" : "a";
        const status = sequenceLocked ? copy.dashboard_status_previous : isDone ? copy.dashboard_status_done : lockedPaidTest ? copy.dashboard_status_plan : copy.dashboard_status_start;
        return `<${cardTag} class="dl-card${isDone ? " done" : ""}${sequenceLocked ? " sequence-locked" : ""}"${href ? ` href="${href}"` : ""} data-title="${h(
          (l.title + " " + l.course_title).toLowerCase()
        )}">
          <span class="dl-top"><span class="dl-ico">${isDone ? "&#10003;" : i + 1}</span><span class="dl-status${isDone && !sequenceLocked ? " done" : ""}">${status}</span></span>
          <span class="dl-module">${h(l.course_title)}</span><b class="dl-title">${h(l.title)}</b>
          <span class="dl-sub">${h(l.course_title)}</span>
          <span class="dl-foot"><span class="dl-time">${Number(l.duration_min) || 30} ${h(copy.dashboard_time_short)}</span><span class="dl-arrow">${sequenceLocked ? "&#128274;" : "&rarr;"}</span></span>
        </${cardTag}>`;
      }).join("")}</div>
    </section>`
    : "";

  const weeklyPodium = weekly
    .slice(0, 3)
    .map(
      (w, i) => `<div class="dash-podium-item place-${i + 1}">
        <span class="dash-podium-medal">${i + 1}</span>
        <span class="dash-podium-avatar">${h(w.name.slice(0, 1).toUpperCase())}</span>
        <b>${h(w.name)}</b>
        <small>${w.c} ${h(copy.dashboard_test_unit)} · ${h(weeklyStreaks.get(Number(w.id)) || 0)} ${h(copy.dashboard_day_unit)} 🔥</small>
      </div>`
    )
    .join("");
  const weeklyRows = weekly.length > 3
    ? weekly
        .slice(3)
        .map(
          (w, i) => `<div class="dash-rank-row">
            <span class="dash-rank-num">${i + 4}</span>
            <b>${h(w.name)}</b>
            <span class="muted">${w.c} ${h(copy.dashboard_test_unit)}</span>
          </div>`
        )
        .join("")
    : "";

  return `<section class="dash-hero">
    <div class="wrap dash-welcome-wrap">
      <div class="dash-quote"><span class="dash-quote-symbol" aria-hidden="true">&#128172;</span><div><small class="dash-quote-label">${h(copy.dashboard_quote_title)}</small><span>${h(dashboardQuoteText)}</span></div></div>
      <div class="dash-welcome-row">
        <div>
          <span class="eyebrow">${h(copy.dashboard_greeting_eyebrow)}</span>
          <h1>${h(copy.dashboard_greeting_prefix)} ${h(user.name.split(" ")[0])}! <span aria-hidden="true">&#128075;</span></h1>
          <p class="lead">${h(copy.dashboard_welcome_lead)}</p>
        </div>
        <div class="dash-welcome-actions"><div class="dash-streak"><span aria-hidden="true">&#128293;</span><div><b>${streak}</b><small>${h(copy.dashboard_streak_label)}</small></div></div><button class="dash-install dash-refresh" type="button" data-app-refresh aria-label="${h(copy.dashboard_refresh_aria)}" title="${h(copy.dashboard_refresh_help)}"><span aria-hidden="true">&#8635;</span> ${h(copy.dashboard_refresh_label)}</button><button class="dash-install" id="installApp" type="button" aria-label="${h(copy.dashboard_install_aria)}"><span aria-hidden="true">&#8681;</span> ${h(copy.dashboard_install_label)}</button></div>
      </div>
      ${siteCopyExtraMarkup("dashboard")}
    </div>
  </section>
  <section class="section tight">
    <div class="wrap">
      ${nextCard}
      <div class="dash-top">
        <div class="dash-stat dash-stat-progress"><div><span>${h(copy.dashboard_progress_title)}</span><b>${completed}<small> / ${total} ${h(copy.dashboard_test_unit)}</small></b></div><div class="dash-progress-track"><i style="width:${pct}%"></i></div><small>${completed ? h(copy.dashboard_progress_encouragement) : h(copy.dashboard_first_test_hint)}</small></div>
        <div class="dash-stat dash-rank-stat"><span aria-hidden="true">&#127942;</span><b>${rank}<small> / ${classSize}</small></b><small>${h(copy.dashboard_rank_position)}</small></div>
        <div class="dash-stat dash-ach-stat"><span aria-hidden="true">&#127892;</span><b>${achievements}<small> / ${totalAchievements}</small></b><small>${h(copy.dashboard_achievements)}</small></div>
      </div>
      <div class="dash-cols">
        <div class="card dash-rank">
          <div class="card-head"><div><h2>${h(copy.dashboard_group_ranking)}</h2><p class="muted small">${h(copy.dashboard_active_results)}</p></div><a class="badge" href="/leaderboard">${h(copy.dashboard_weekly)} &rarr;</a></div>
          ${weekly.length ? `<div class="dash-podium">${weeklyPodium}</div>${weeklyRows}` : `<p class="muted small">${h(copy.dashboard_weekly_empty)}</p>`}
          <div class="dash-leader-note"><span aria-hidden="true">&#10024;</span> ${h(copy.dashboard_daily_growth)}</div>
        </div>
      </div>

      <div class="card dash-all">
        <div class="card-head dash-all-head">
          <div><h2>${h(copy.dashboard_tests_title)}</h2><p class="muted small">${dashboardTests.length} ${h(copy.dashboard_test_count_suffix)}</p></div>
          <div class="dl-tools">
            <input id="dlSearch" class="dl-search" placeholder="${h(copy.dashboard_test_search)}" aria-label="${h(copy.dashboard_test_search)}">
            <button type="button" class="dl-view" data-view="grid" aria-label="${h(copy.dashboard_grid_view)}">&#9638;</button>
            <button type="button" class="dl-view active" data-view="list" aria-label="${h(copy.dashboard_list_view)}">&#9776;</button>
          </div>
        </div>
        <div class="dl-groups" id="dlGrid">${lessonCards || `<p class="muted">${h(copy.dashboard_no_tests)}</p>`}</div>
        <div class="dl-pager" id="dlPager"></div>
      </div>
      <script>
      (function () {
        var tashkentNow = new Date(Date.now() + 5 * 60 * 60 * 1000);
        var minutesNow = tashkentNow.getUTCHours() * 60 + tashkentNow.getUTCMinutes();
        var nextBoundary = minutesNow < 12 * 60 ? 12 * 60 : 24 * 60;
        var refreshIn = (nextBoundary - minutesNow) * 60 * 1000 - tashkentNow.getUTCSeconds() * 1000 - tashkentNow.getUTCMilliseconds();
        window.setTimeout(function () { window.location.reload(); }, Math.max(250, refreshIn));
        var installButton = document.getElementById('installApp');
        var installPrompt = null;
        var installMessages = {
          uz: { installed: ${JSON.stringify(copy.dashboard_install_ready)}, help: ${JSON.stringify(copy.dashboard_install_help)} },
          en: { installed: "The app is already installed.", help: "Open your browser menu and choose Install app or Add to Home screen." }
        };
        if ('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js?v=26').catch(function () {});
        window.addEventListener('beforeinstallprompt', function (event) {
          event.preventDefault();
          installPrompt = event;
          if (installButton) installButton.classList.add('is-ready');
        });
        if (installButton) installButton.addEventListener('click', async function () {
          var msg = installMessages[document.documentElement.lang] || installMessages.uz;
          if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
            alert(msg.installed);
            return;
          }
          if (!installPrompt) {
            alert(msg.help);
            return;
          }
          var promptEvent = installPrompt;
          installPrompt = null;
          await promptEvent.prompt();
          await promptEvent.userChoice;
        });
        var grid = document.getElementById('dlGrid');
        var pager = document.getElementById('dlPager');
        var search = document.getElementById('dlSearch');
        if (!grid || !pager) return;
        var cards = Array.prototype.slice.call(grid.querySelectorAll('.dl-card'));
        var per = 4;
        var page = 1;
        function filtered() {
          var q = (search && search.value ? search.value : '').toLowerCase().trim();
          return cards.filter(function (c) {
            return !q || (c.dataset && c.dataset.title && c.dataset.title.indexOf(q) !== -1);
          });
        }
        function render() {
          var list = filtered();
          var pages = Math.max(1, Math.ceil(list.length / per));
          if (page > pages) page = pages;
          cards.forEach(function (c) { c.hidden = true; });
          list.slice((page - 1) * per, page * per).forEach(function (c) { c.hidden = false; });
          Array.prototype.forEach.call(grid.querySelectorAll('.dl-group'), function (group) {
            group.hidden = !group.querySelector('.dl-card:not([hidden])');
          });
          pager.innerHTML = '';
          function add(label, target, disabled, active) {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'dl-page' + (active ? ' active' : '');
            b.textContent = label;
            b.disabled = !!disabled;
            b.addEventListener('click', function () { page = target; render(); });
            pager.appendChild(b);
          }
          add('Â«', 1, page === 1);
          add('‹', page - 1, page === 1);
          for (var i = 1; i <= pages; i += 1) add(String(i), i, false, i === page);
          add('›', page + 1, page === pages);
          add('Â»', pages, page === pages);
          var info = document.createElement('span');
          info.className = 'dl-pageinfo';
          var lang = document.documentElement.lang;
          info.textContent = lang === 'en'
            ? 'Page ' + page + ' / ' + pages + ' | ' + list.length + ' tests'
            : ${JSON.stringify(copy.dashboard_page_label)} + ' ' + page + ' / ' + pages + ' | ' + list.length + ' ' + ${JSON.stringify(copy.dashboard_test_list_label)};
          pager.appendChild(info);
        }
        if (search) search.addEventListener('input', function () { page = 1; render(); });
        Array.prototype.forEach.call(document.querySelectorAll('.dl-view'), function (b) {
          b.addEventListener('click', function () {
            Array.prototype.forEach.call(document.querySelectorAll('.dl-view'), function (x) {
              x.classList.remove('active');
            });
            b.classList.add('active');
            Array.prototype.forEach.call(grid.querySelectorAll('.dl-grid'), function (cardsGrid) {
              cardsGrid.classList.toggle('list', b.getAttribute('data-view') === 'list');
            });
          });
        });
        render();
      })();
      </script>
    </div>
  </section>`;
}

function duelDashboardPage(user, error = "") {
  if (!user) {
  return `<section class="duel-hero">
  <div class="wrap">
  <span class="eyebrow">1 vs 1</span>
  <h1>Duel   kim kuchli?</h1>
  <p class="lead">Do'stingiz bilan bir testda kuch sinashing. Kod yarating, do'stingiz qo'shilsin va eng ko'p to'g'ri javob bergan yutsin.</p>
  <div class="actions"><a class="btn btn-primary" href="/login?next=/duel">Kirish</a><a class="btn btn-ghost" href="/register?next=/duel">Ro'yxatdan o'tish</a></div>
  </div>
  </section>`;
  }

  const poolCount = db.prepare("SELECT COUNT(*) AS n FROM questions").get().n;
  const botReady = !!(config.telegramBotToken && config.telegramBotUsername);

  const rows = db
.prepare(
  `SELECT d.*, COALESCE(NULLIF(d.title, ''), l.title) AS lesson_title,
  uc.name AS creator_name, uo.name AS opponent_name
  FROM duels d
  JOIN lessons l ON l.id = d.lesson_id
  JOIN users uc ON uc.id = d.creator_id
  LEFT JOIN users uo ON uo.id = d.opponent_id
  WHERE d.creator_id = ? OR d.opponent_id = ?
  ORDER BY d.id DESC LIMIT 40`
  )
.all(user.id, user.id);

  const active = rows.filter((d) => d.status !== "finished");
  const finished = rows.filter((d) => d.status === "finished");
  const tournament = ensureTournament();
  autoEnrollAll();
  const tourEntries = tournamentEntries(tournament.id);

  const activeCards = active.length
  ? active
.map((d) => {
  const opponent = d.creator_id === user.id ? d.opponent_name: d.creator_name;
  return `<a class="duel-card" href="/duel/${h(d.code)}">
  <div class="duel-card-head"><span class="duel-code-pill">${h(d.code)}</span><span class="badge">${
  d.status === "waiting" ? "Kutilmoqda": "Jonli"
  }</span></div>
  <h3>${h(d.lesson_title)}</h3>
  <p class="muted">${opponent ? `vs ${h(opponent)}`: "Raqib kutilmoqda"}</p>
  <span class="card-link">Xonaga kirish   </span>
  </a>`;
  })
.join("")
: `<div class="card empty">Hozircha faol duel yo'q. Yangi duel yarating.</div>`;

  const finishedRows = finished.length
  ? finished
.slice(0, 12)
.map((d) => {
  const plays = duelPlays(d.id);
  const mine = plays[user.id];
  const otherId = d.creator_id === user.id ? d.opponent_id: d.creator_id;
  const other = otherId ? plays[otherId]: null;
  let verdict = " ";
  if (mine && other) {
  if (mine.correct > other.correct) verdict = "G'alaba";
  else if (mine.correct < other.correct) verdict = "Mag'lubiyat";
  else if (mine.elapsed_ms < other.elapsed_ms) verdict = "G'alaba";
  else if (mine.elapsed_ms > other.elapsed_ms) verdict = "Mag'lubiyat";
  else verdict = "Durang";
  }
  return `<tr>
  <td><a href="/duel/${h(d.code)}"><b>${h(d.code)}</b></a></td>
  <td>${h(d.lesson_title)}</td>
  <td>${mine ? `${mine.correct}/${mine.total}`: " "}</td>
  <td><span class="duel-verdict ${verdict === "G'alaba" ? "win": verdict === "Mag'lubiyat" ? "lose": ""}">${verdict}</span></td>
  </tr>`;
  })
.join("")
: `<tr><td colspan="4" class="muted">Hozircha yakunlangan duel yo'q.</td></tr>`;

  return `<section class="duel-hero">
  <div class="wrap">
  <span class="eyebrow">1 vs 1</span>
  <h1>Duel   kim kuchli?</h1>
  <p class="lead">Test tanlang, kod yarating va do'stingizni chaqiring. Eng ko'p to'g'ri javob bergan   g'olib.</p>
  </div>
  </section>
  <section class="section tight">
  <div class="wrap">
  ${error === "test" ? alertBox("Duel uchun test savollari topilmadi. Avval kursga savol qo'shing.", "error") : ""}
  <div class="duel-actions">
  <div class="card duel-create">
  <h2>Yangi duel</h2>
  <p class="muted small">${poolCount ? `${Math.min(10, poolCount)} ta aralash savol. Duel yaratilgach Telegram'da raqibni tanlaysiz.` : "Duel yaratish uchun bazada test savollari bo'lishi kerak. Admin panelida test savollarini qo'shing."}</p>
  <form method="post" action="/duel/create" class="form">
  <div class="field"><div class="duel-pool">Savollar bazasi: <b>${poolCount}</b> ta · duelda <b>${Math.min(10, poolCount)}</b> ta</div></div>
  <button class="btn btn-primary" type="submit" ${poolCount ? "": "disabled title=\"Duel uchun avval test savollari qo'shilishi kerak\""}>${poolCount ? "Duel yaratish va Telegramga o'tish &#9876;" : "Test savollari kiritilmagan"}</button>
  </form>
  ${!botReady ? `<p class="muted small duel-bot-note">Botdan yuborish uchun Railway'da <code>TELEGRAM_BOT_TOKEN</code> va <code>TELEGRAM_BOT_USERNAME</code> sozlanishi kerak. Hozircha Telegram ulashish oynasi ochiladi.</p>` : ""}
  </div>
  <div class="card duel-join">
  <h2>Kod bilan kirish</h2>
  <p class="muted small">Do'stingiz bergan 6 xonali kodni kiriting.</p>
  <form method="post" action="/duel/join" class="form">
  <div class="field"><input name="code" maxlength="6" placeholder="A1B2C3" required style="text-transform:uppercase;letter-spacing:.18em;font-weight:700"></div>
  <button class="btn btn-ghost" type="submit">Qo'shilish</button>
  </form>
  </div>
  </div>

  <a class="tour-banner" href="/duel/tournament">
  <span class="tour-banner-ico">x </span>
  <span class="tour-banner-copy">
  <span class="eyebrow">Kunlik pley-off</span>
  <b>Kunlik duel   finalga qadar sxema</b>
  <small class="muted">Pley-off: ishtirokchilar ko'paysa 1/16, 1/32, 1/64 avtomatik qo'shiladi. Bugun ${tourEntries.length} ishtirokchi.</small>
  </span>
  <span class="tour-banner-arrow">Sxemani ko'rish   </span>
  </a>

  <div class="section-head" style="margin-top:34px"><h2>Faol duellar</h2><p class="muted">${active.length} ta</p></div>
  <div class="duel-list">${activeCards}</div>

  <div class="section-head" style="margin-top:34px"><h2>Duel tarixi</h2></div>
  <div class="card">
  <div class="table-wrap">
  <table>
  <thead><tr><th>Kod</th><th>Test</th><th>Natija</th><th>Holat</th></tr></thead>
  <tbody>${finishedRows}</tbody>
  </table>
  </div>
  </div>
  </div>
  </section>`;
}

function duelPlayPage(duel, lesson, questions) {
  const total = questions.length;
  const limit = Math.max(1, total) * 60;
  const slides = questions
.map(
  (q, i) => `<section class="q-slide${i === 0 ? " is-active": ""}" data-i="${i}">
  <div class="q-label">${i + 1}-savol</div>
  <h2 class="q-title">${h(q.text)}</h2>
  <div class="q-options">
  ${[1, 2, 3, 4]
.map(
  (n) => `<label class="q-opt">
  <input type="radio" name="q${q.id}" value="${n}">
  <span class="q-letter">${"ABCD"[n - 1]}</span>
  <span class="q-text">${h(q["o" + n])}</span>
  </label>`
  )
.join("")}
  </div>
  </section>`
  )
.join("");
  const hasPassage = !!String(lesson.content || "").trim();

  const body = `
  <header class="test-header">
  <a class="test-brand" href="/duel/${h(duel.code)}"><span class="mark">H</span><b>Duel</b></a>
  <div class="test-mid">
  <b>${h(lesson.title)}</b>
  <span id="qCounter">1 / ${total} savol</span>
  </div>
  <div class="test-tools">
  <span class="duel-live">a  1 vs 1</span>
  <a class="test-exit" href="/duel/${h(duel.code)}">Chiqish</a>
  <div class="test-timer" id="timer">--:--</div>
  </div>
  </header>
  <main class="test-main${hasPassage ? "": " single"}">
  ${hasPassage ? `<aside class="passage"><div class="passage-inner" id="passage">${nl2br(lesson.content)}</div></aside>`: ""}
  <section class="test-pane">
  <form method="post" action="/duel/${h(duel.code)}/submit" id="duelForm">
  <input type="hidden" name="duel_total" value="${total}">
  ${slides}
  <div class="test-nav">
  <button type="button" class="tbtn" id="prevBtn">  Oldingi</button>
  <div class="q-dots" id="dots"></div>
  <button type="button" class="tbtn primary" id="nextBtn">Keyingi   </button>
  <button type="submit" class="tbtn primary" id="finishBtn" hidden>Yakunlash</button>
  </div>
  </form>
  </section>
  </main>
  <script>
  (function () {
  var slides = Array.prototype.slice.call(document.querySelectorAll('.q-slide'));
  var counter = document.getElementById('qCounter');
  var prev = document.getElementById('prevBtn');
  var next = document.getElementById('nextBtn');
  var finish = document.getElementById('finishBtn');
  var form = document.getElementById('duelForm');
  var dots = document.getElementById('dots');
  var index = 0;
  slides.forEach(function (s, i) {
  var dot = document.createElement('span');
  dot.className = 'q-dot' + (i === 0 ? ' active': '');
  dots.appendChild(dot);
  });
  var dotEls = Array.prototype.slice.call(dots.children);
  function refresh() {
  counter.textContent = (index + 1) + ' / ' + slides.length + (document.documentElement.lang === 'en' ? ' questions' : ' savol');
  prev.disabled = index === 0;
  next.hidden = index === slides.length - 1;
  finish.hidden = index !== slides.length - 1;
  dotEls.forEach(function (d, i) {
  d.classList.toggle('active', i === index);
  d.classList.toggle('answered', !!slides[i].querySelector('input:checked'));
  });
  }
  function show(nextIndex) {
  index = Math.max(0, Math.min(slides.length - 1, nextIndex));
  slides.forEach(function (s, i) { s.classList.toggle('is-active', i === index); });
  refresh();
  }
  prev.addEventListener('click', function () { show(index - 1); });
  next.addEventListener('click', function () { show(index + 1); });
  document.querySelectorAll('.q-opt input').forEach(function (input) {
  input.addEventListener('change', refresh);
  });
  form.addEventListener('submit', function (e) {
  var unanswered = slides.filter(function (s) { return !s.querySelector('input:checked'); }).length;
  if (unanswered && !confirm((document.documentElement.lang === 'en' ? unanswered + ' questions unanswered. Submit anyway?' : unanswered + ' ta savol javobsiz. Baribir yakunlaysizmi?'))) {
  e.preventDefault();
  }
  });
  var left = ${limit};
  var timer = document.getElementById('timer');
  function tick() {
  var m = Math.floor(left / 60);
  var s = left % 60;
  timer.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  if (left <= 0) { form.submit(); return; }
  left -= 1;
  }
  tick();
  setInterval(tick, 1000);
  document.addEventListener('keydown', function (e) {
  if (e.key === 'ArrowRight') show(index + 1);
  if (e.key === 'ArrowLeft') show(index - 1);
  });
  })();
  </script>`;
  return testDocument({ title: `Duel   ${lesson.title}`, body });
}

function testDocument({ title, body }) {  return `<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#080611">
<title>${h(title)}   ${h(config.siteName)}</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='9' fill='%231e40af'/%3E%3Ctext x='16' y='22' font-family='Arial' font-size='18' font-weight='bold' text-anchor='middle' fill='white'%3EH%3C/text%3E%3C/svg%3E">
<script async src="https://telegram.org/js/telegram-web-app.js"></script>
<script>try{document.documentElement.dataset.theme=localStorage.getItem('ht_theme')||'dark';}catch(e){document.documentElement.dataset.theme='dark';}</script>
<link rel="stylesheet" href="/assets/platform.css?v=20261125bright1">
</head>
<body class="test-body student-page">
${body}
<footer class="test-author-footer">Ustozlarimizga ko‘mak bo‘lsin deya, ushbu materiallar Habiba Mo'minjonovna tomonidan taqdim etildi.</footer>
<script>if ('serviceWorker' in navigator) navigator.serviceWorker.register('/service-worker.js?v=26').then(function (registration) { registration.update().catch(function () {}); }).catch(function () {});</script>
</body>
</html>`;
}

function testPage(lesson, questions, testSections = [], attemptId = 0) {
  const duration = Number(lesson.duration_min || 30);
  const total = questions.length;

  const storedSections = (testSections || [])
.slice()
.sort((a, b) => (Number(a.position) || 0) - (Number(b.position) || 0) || a.id - b.id)
.map((s) => ({
  title: String(s.title || "").trim() || "Bo'lim",
  from: Math.max(1, Number(s.from_no) || 1),
  to: Number(s.to_no) > 0 ? Number(s.to_no): total,
  passage: String(s.passage || "")
  }))
.filter((s) => s.from <= Math.min(total, s.to));

  const sectionFor = (no) => storedSections.find((s) => no >= s.from && no <= Math.min(total, s.to));

  const lessonText = String(lesson.content || "").trim();
  const passages = questions.map((q, i) => {
  const own = String(q.passage || "").trim();
  if (own) return own;
  const section = sectionFor(i + 1);
  if (section && section.passage.trim()) return section.passage.trim();
  if (!storedSections.length && i < 15 && lessonText) return lessonText;
  return "";
  });
  const hasPassage = passages.some(Boolean);

  const answerSlots = Array.from({ length: total }, (_, index) => index % 4);
  for (let index = answerSlots.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [answerSlots[index], answerSlots[swap]] = [answerSlots[swap], answerSlots[index]];
  }
  const slides = questions
.map(
  (q, i) => {
  const correctSlot = answerSlots[i];
  const distractors = [1, 2, 3, 4].filter((n) => n !== Number(q.correct));
  for (let index = distractors.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [distractors[index], distractors[swap]] = [distractors[swap], distractors[index]];
  }
  const optionOrder = [];
  let distractorIndex = 0;
  for (let slot = 0; slot < 4; slot += 1) optionOrder.push(slot === correctSlot ? Number(q.correct) : distractors[distractorIndex++]);
  return `<section class="q-slide${i === 0 ? " is-active": ""}" data-i="${i}">
  <div class="q-passage-data" hidden>${testReadingHtml(passages[i])}</div>
  <div class="q-head">${i + 1}-savol</div>
  <h2 class="q-title">${h(q.text)}</h2>
  <div class="q-options">
  ${optionOrder
.map(
  (n, slot) => `<label class="q-opt">
  <input type="radio" name="q${q.id}" value="${n}">
  <span class="q-letter">${"ABCD"[slot]}</span>
  <span class="q-text">${i >= 11 && i < 15 ? testReadingHtml(q["o" + n]) : h(q["o" + n])}</span>
  </label>`
  )
.join("")}
  </div>
  </section>`;
  }
  )
.join("");

  const sections = [];
  if (storedSections.length) {
  let cursor = 1;
  for (const s of storedSections) {
  const from = Math.max(cursor, s.from);
  const to = Math.min(total, s.to);
  if (from > cursor) sections.push({ title: "Savollar", from: cursor, to: from - 1 });
  if (to >= from) {
  sections.push({ title: s.title, from, to });
  cursor = to + 1;
  }
  if (cursor > total) break;
  }
  if (cursor <= total) sections.push({ title: "Savollar", from: cursor, to: total });
  } else if (total > 40) {
  sections.push({ title: "1-bosqich. Mutaxassislik fani", from: 1, to: 35 });
  sections.push({ title: "2-bosqich. Kasbiy Standartlar", from: 36, to: 40 });
  sections.push({ title: "3-bosqich. Pedagogik Mahorat", from: 41, to: total });
  } else if (total > 35) {
  sections.push({ title: "1-bosqich. Mutaxassislik fani", from: 1, to: 35 });
  sections.push({ title: "2-bosqich. Kasbiy Standartlar", from: 36, to: total });
  } else {
  sections.push({ title: "1-bosqich. Test savollari", from: 1, to: total });
  }

  const palette = sections
.map((section) => {
  const buttons = [];
  for (let n = section.from; n <= section.to; n += 1) {
  buttons.push(
  `<button type="button" class="pal${n === 1 ? " current": ""}" data-index="${n - 1}">${n}</button>`
  );
  }
  return `<div class="step-block">
  <div class="step-title">${h(section.title)}</div>
  <div class="palette">${buttons.join("")}</div>
  </div>`;
  })
.join("");

  const body = `
  <div class="solve mcacademy-solve" style="--fs:1;--fs-reading:1">
  <header class="solve-topbar">
  <div class="solve-inner">
  <a class="solve-brand" href="/attestation"><span class="mark">H</span><b>${h(config.siteName)}</b></a>
  <div class="solve-head">
  <div class="solve-titles">
  <b>${h(lesson.title)}</b>
  <span id="qCounter">1 / ${total} savol</span>
  </div>
  ${
  hasPassage
  ? `<div class="fs-group">
  <span>MATN</span>
  <button type="button" data-fs="reading:-1" aria-label="Matn shriftini kichraytirish">A </button>
  <button type="button" class="fs-value" data-fs="reading:0" data-fs-value="reading">100%</button>
  <button type="button" data-fs="reading:1" aria-label="Matn shriftini kattalashtirish">A+</button>
  </div>`
: ""
  }
  <div class="fs-group">
  <span>SAVOL</span>
  <button type="button" data-fs="question:-1" aria-label="Savol shriftini kichraytirish">A </button>
  <button type="button" class="fs-value" data-fs="question:0" data-fs-value="question">100%</button>
  <button type="button" data-fs="question:1" aria-label="Savol shriftini kattalashtirish">A+</button>
  </div>
  <a class="solve-exit" href="${moduleHref(lesson)}">Saytga o'tish</a>
  </div>
  <div class="solve-right">
  <button type="button" class="solve-icon" id="fsToggle" aria-label="To'liq ekran">
  <svg viewBox="0 0 24 24"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>
  </button>
  <div class="solve-timer">
  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
  <span id="timer">--:--</span>
  </div>
  </div>
  </div>
  <div class="solve-progress"><span id="progressFill"></span></div>
  </header>

  <main class="solve-wrap">
  <div class="solve-stack">
  <form method="post" action="/test/${lesson.id}/submit" id="testForm">
  ${attemptId ? `<input type="hidden" name="attempt_id" value="${attemptId}">` : ""}
  <div class="q-row${hasPassage ? "": " single"}">
  ${
  hasPassage
  ? `<aside class="q-reading-pane"><div class="q-reading" id="readingContent">${testReadingHtml(
  passages[0] || ""
  )}</div></aside>
  <div class="q-resizer" id="qResizer" aria-hidden="true"><span></span></div>`
: ""
  }
  <section class="q-panel">${slides}</section>
  </div>

  <div class="q-nav-row">
  <button type="button" class="nav-pill" id="prevBtn">  Oldingi</button>
  <button type="button" class="nav-pill" id="nextBtn">Keyingi   </button>
  </div>

  <div class="aside-card">
  ${palette}
  <div class="solve-legend">
  <div class="legend-item done"><i></i> Javob berilgan (<span id="answeredCount">0</span>)</div>
  <div class="legend-item current"><i></i> Hozirgi savol</div>
  </div>
  <button type="button" class="btn-finish" id="finishBtn">Tugatish</button>
  </div>
  </form>
  </div>
  </main>

  <div class="solve-overlay" id="finishOverlay" hidden>
  <div class="solve-confirm">
  <div class="solve-warn">!</div>
  <p>Testni tugatishni tasdiqlaysizmi?</p>
  <p class="muted small" id="unansweredHint"></p>
  <div class="solve-confirm-actions">
  <button type="button" class="btn btn-ghost" id="cancelFinish">Bekor qilish</button>
  <button type="button" class="btn btn-primary" id="confirmFinish">Ha</button>
  </div>
  </div>
  </div>
  </div>

  <script>
  (function () {
  var solve = document.querySelector('.solve');
  var slides = Array.prototype.slice.call(document.querySelectorAll('.q-slide'));
  var counter = document.getElementById('qCounter');
  var prev = document.getElementById('prevBtn');
  var next = document.getElementById('nextBtn');
  var form = document.getElementById('testForm');
  var palette = Array.prototype.slice.call(document.querySelectorAll('.pal'));
  var answeredCount = document.getElementById('answeredCount');
  var progressFill = document.getElementById('progressFill');
  var overlay = document.getElementById('finishOverlay');
  var hint = document.getElementById('unansweredHint');
  var reading = document.getElementById('readingContent');
  var qRow = document.querySelector('.q-row');
  var index = 0;

  function answered() {
  return slides.filter(function (s) { return !!s.querySelector('input:checked'); }).length;
  }

  function refresh() {
  counter.textContent = (index + 1) + ' / ' + slides.length + (document.documentElement.lang === 'en' ? ' questions' : ' savol');
  prev.disabled = index === 0;
  next.disabled = index === slides.length - 1;
  palette.forEach(function (btn, i) {
  btn.classList.toggle('current', i === index);
  btn.classList.toggle('done', !!slides[i].querySelector('input:checked'));
  });
  var count = answered();
  answeredCount.textContent = count;
  progressFill.style.width = (slides.length ? Math.round((count / slides.length) * 100): 0) + '%';
  if (hint) {
  var left = slides.length - count;
  hint.textContent = document.documentElement.lang === 'en' ? (left ? left + ' questions unanswered.' : 'All questions have been answered.') : (left ? left + ' ta savol javobsiz.' : 'Barcha savollarga javob berilgan.');
  }
  }

  function syncReading(i) {
  if (!reading || !qRow) return;
  var src = slides[i] ? slides[i].querySelector('.q-passage-data'): null;
  var html = src ? src.innerHTML.trim(): '';
  qRow.classList.toggle('no-read', !html);
  if (html) {
  reading.innerHTML = html;
  reading.scrollTop = 0;
  }
  }

  function show(nextIndex) {
  index = Math.max(0, Math.min(slides.length - 1, nextIndex));
  slides.forEach(function (s, i) { s.classList.toggle('is-active', i === index); });
  var panel = document.querySelector('.q-panel');
  if (panel) panel.scrollTop = 0;
  syncReading(index);
  refresh();
  }

  prev.addEventListener('click', function () { show(index - 1); });
  next.addEventListener('click', function () { show(index + 1); });
  palette.forEach(function (btn) {
  btn.addEventListener('click', function () { show(Number(btn.getAttribute('data-index'))); });
  });

  document.querySelectorAll('.q-opt input').forEach(function (input) {
  input.addEventListener('change', function () {
  var slide = input.closest('.q-slide');
  slide.querySelectorAll('.q-opt').forEach(function (label) {
  label.classList.toggle('selected', !!label.querySelector('input:checked'));
  });
  refresh();
  });
  });

  document.getElementById('finishBtn').addEventListener('click', function () {
  refresh();
  overlay.hidden = false;
  });
  document.getElementById('cancelFinish').addEventListener('click', function () {
  overlay.hidden = true;
  });
  document.getElementById('confirmFinish').addEventListener('click', function () {
  form.submit();
  });

  var sizes = { reading: 100, question: 100 };
  function applySizes() {
  solve.style.setProperty('--fs-reading', sizes.reading / 100);
  solve.style.setProperty('--fs', sizes.question / 100);
  document.querySelectorAll('[data-fs-value]').forEach(function (el) {
  el.textContent = sizes[el.getAttribute('data-fs-value')] + '%';
  });
  }
  document.querySelectorAll('[data-fs]').forEach(function (btn) {
  btn.addEventListener('click', function () {
  var parts = btn.getAttribute('data-fs').split(':');
  var target = parts[0];
  var step = Number(parts[1]);
  sizes[target] = step === 0 ? 100: Math.max(80, Math.min(160, sizes[target] + step * 10));
  applySizes();
  });
  });

  var fsToggle = document.getElementById('fsToggle');
  fsToggle.addEventListener('click', function () {
  if (!document.fullscreenElement) {
  document.documentElement.requestFullscreen().catch(function () {});
  } else {
  document.exitFullscreen().catch(function () {});
  }
  });

  var resizer = document.getElementById('qResizer');
  var row = document.querySelector('.q-row');
  if (resizer && row) {
  resizer.addEventListener('pointerdown', function (event) {
  event.preventDefault();
  var rect = row.getBoundingClientRect();
  function move(e) {
  var pct = ((e.clientX - rect.left) / rect.width) * 100;
  pct = Math.max(30, Math.min(70, pct));
  row.style.setProperty('--split', pct + '%');
  }
  function up() {
  document.removeEventListener('pointermove', move);
  document.removeEventListener('pointerup', up);
  }
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
  });
  }

  var left = ${duration} * 60;
  var timer = document.getElementById('timer');
  function tick() {
  var h = Math.floor(left / 3600);
  var m = Math.floor((left % 3600) / 60);
  var s = left % 60;
  timer.textContent = [h, m, s].map(function (n) { return String(n).padStart(2, '0'); }).join(':');
  if (left <= 0) { form.submit(); return; }
  left -= 1;
  }
  tick();
  setInterval(tick, 1000);

  document.addEventListener('keydown', function (e) {
  if (e.key === 'ArrowRight') show(index + 1);
  if (e.key === 'ArrowLeft') show(index - 1);
  });

  syncReading(0);
  refresh();
  })();
  </script>`;

  return testDocument({ title: lesson.title, body });
}

function testResultPage(lesson, questions, score, answers = {}, passMark = null) {
  const total = questions.length;
  const correct = total ? Math.round((score / 100) * total): 0;
  const course = db.prepare("SELECT category FROM courses WHERE id = ?").get(lesson.course_id);
  const isAttestation = course && course.category === "attestation";
  const requiredPercent = passMark !== null && passMark !== undefined && Number.isFinite(Number(passMark)) ? Number(passMark) : testPassPercent(course?.category);
  const passed = score >= requiredPercent;
  const attestationGrade = score >= 80
    ? "Oliy toifaga o'tdingiz"
    : score >= 70
      ? "Birinchi toifaga o'tdingiz"
      : score >= 60 ? "Ikkinchi toifaga o'tdingiz" : "Yana urinib ko'ring";
  const mistakes = questions.filter((q) => String(answers[`q${q.id}`] || "") !== String(q.correct));
  const review = Object.keys(answers).length
    ? `<section class="answer-review"><h2>Xatolarni ko'rib chiqing</h2>${mistakes.length ? mistakes.map((q) => `<article class="answer-mistake"><b>${h(q.text)}</b><p class="wrong-answer">Sizning javobingiz: ${h(q[`o${Number(answers[`q${q.id}`])}`] || "Javob berilmadi")}</p><p class="right-answer">To'g'ri javob: ${h(q[`o${q.correct}`])}</p>${q.passage ? `<details><summary>Matnni ko'rish</summary><p>${nl2br(q.passage)}</p></details>` : ""}</article>`).join("") : `<p class="muted">Xato javob yo'q — a'lo!</p>`}</section>`
    : "";
  const body = `
  <header class="test-header">
  <a class="test-brand" href="/attestation"><span class="mark">H</span><b>${h(config.siteName)}</b></a>
  <div class="test-mid"><b>${h(lesson.title)}</b><span>Yakunlandi</span></div>
  <div class="test-tools"><a class="test-exit" href="${moduleHref(lesson)}">Saytga o'tish</a></div>
  </header>
  <main class="test-result">
  <div class="result-card">
  <span class="pill">Test yakunlandi</span>
  <div class="score-circle">${score}%</div>
  <h1>${isAttestation && passed ? attestationGrade : passed ? "Yaxshi natija!": "Yana urinib ko'ring"}</h1>
  <p class="muted">${correct} / ${total} to'g'ri javob</p>
  ${isAttestation ? `<p class="muted">${score >= 80 ? "80–100% — oliy toifa" : score >= 70 ? "70–79% — birinchi toifa" : score >= 60 ? "60–69% — ikkinchi toifa" : `60% dan kam. Ikkinchi toifa va keyingi test uchun 60% kerak.`}</p>` : `<p class="muted">O'tish uchun ${requiredPercent}% kerak.</p>`}
  <div class="actions">
  ${passed ? `<a class="btn btn-primary" href="${moduleHref(lesson)}">Testlarga qaytish</a>` : `<a class="btn btn-primary" href="/test/${lesson.id}?start=1">Qayta topshirish</a>`}
  ${passed ? `<a class="btn btn-ghost" href="/test/${lesson.id}?start=1">Yana topshirish</a>` : ""}
  </div>
  </div>
  ${review}
  </main>`;
  return testDocument({ title: "Natija", body });
}

/* ================================================================ ROUTES */
const server = http.createServer(async (req, res) => {
  try {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const p = decodeURIComponent(url.pathname);
  const method = req.method;

  const reqHost = String(req.headers.host || "").toLowerCase().split(":")[0];
  if (p === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end("ok");
    return;
  }
  if (reqHost === "www.habibateacher.uz" || reqHost === "habibatecher.uz" || reqHost === "www.habibatecher.uz") {
    res.writeHead(301, { Location: `https://habibateacher.uz${p}${url.search}` });
    res.end();
    return;
  }
  if (method === "GET" && p === "/robots.txt") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" });
    res.end("User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /dashboard\nDisallow: /login\nDisallow: /register\nDisallow: /lang/\nSitemap: https://habibateacher.uz/sitemap.xml\n");
    return;
  }
  if (method === "GET" && p === "/sitemap.xml") {
    const urls = ["/", "/news", ...DIRECTION_IDS.map((id) => `/${id}`), "/plans"];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((route) => `<url><loc>https://habibateacher.uz${route}</loc></url>`).join("")}</urlset>`;
    res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" });
    res.end(xml);
    return;
  }
  let user = currentUser(req);
  const admin = isAdmin(req);
  if (user) {
    const deviceToken = parseCookies(req).ht_device || "";
    const deviceRow = deviceToken
      ? db.prepare("SELECT user_id FROM device_sessions WHERE token = ?").get(deviceToken)
      : null;
    if (!deviceRow || Number(deviceRow.user_id) !== Number(user.id)) {
      const sessionToken = parseCookies(req).ht_session;
      if (sessionToken) db.prepare("DELETE FROM sessions WHERE token = ?").run(sessionToken);
      clearCookie(res, "ht_session");
      user = null;
    } else {
      db.prepare("UPDATE device_sessions SET last_seen = ? WHERE token = ?").run(nowISO(), deviceToken);
    }
  }
  const author = Boolean(user && Number(user.is_author));
  const contentManager = admin || author;
  res.lang = detectLang(req);

  const authorContentRoute = method === "GET" && /^\/admin\/course\/\d+$/.test(p)
    || method === "POST" && (p === "/admin/course" || p === "/admin/lesson" || /^\/admin\/course\/\d+$/.test(p)
      || /^\/admin\/lesson\/\d+(?:\/(?:questions|sections|rename|update|delete|materials|about|question|section|import|add-test))?$/.test(p)
      || /^\/admin\/(?:question\/\d+\/(?:update|delete)|section\/\d+(?:\/delete)?)$/.test(p)
      || /^\/admin\/video-upload\/(?:start|[a-f0-9-]{24,64})$/.test(p));

  /* Admin panelga tashqaridan har kirishda parol so'raladi */
  if (!admin && author && p.startsWith("/admin") && !authorContentRoute) return redirect(res, "/author");
  if (admin && method === "GET" && p.startsWith("/admin") && p !== "/admin/login" && p !== "/admin/logout") {
    let refPath = "";
    try {
      const ref = String(req.headers.referer || "");
      refPath = ref ? new URL(ref).pathname : "";
    } catch (e) {}
    if (!refPath.startsWith("/admin")) {
      const token = parseCookies(req).ht_admin;
      if (token) db.prepare("DELETE FROM admin_sessions WHERE token = ?").run(token);
      res.writeHead(303, {
        Location: `/admin/login?next=${encodeURIComponent(p + url.search)}`,
        "Set-Cookie": "ht_admin=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
      });
      res.end();
      return;
    }
  }

  const isStatic =
  p.startsWith("/assets/") ||
  p.startsWith("/img/") ||
  p.startsWith("/video/") ||
  p === "/favicon.ico" ||
  p === "/health" ||
  p === "/access" ||
  p.startsWith("/admin") ||
  p.startsWith("/lang/");

  /* ------------------------------------------------------------- assets */
  if (p === "/assets/platform.css") {
  let cssFile = path.join(PUBLIC_DIR, "platform.css");
  if (!fs.existsSync(cssFile)) {
    const alt = findAssetFile("platform.css", [__dirname]);
    if (alt) cssFile = alt;
  }
  if (fs.existsSync(cssFile)) {
    const css = fs.readFileSync(cssFile);
    res.writeHead(200, {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "no-cache"
    });
    res.end(css);
    return;
  }
  res.writeHead(200, {
    "Content-Type": "text/css; charset=utf-8",
    "Cache-Control": "no-cache"
  });
  res.writeHead(404, { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "no-store" });
  res.end("/* Stylesheet missing: restore public/platform.css */");
  return;
  }

  if (p === "/manifest.webmanifest" && method === "GET") {
  res.writeHead(200, { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "no-cache" });
  res.end(fs.readFileSync(path.join(PUBLIC_DIR, "manifest.webmanifest")));
  return;
  }

  if (p === "/service-worker.js" && method === "GET") {
  res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-cache", "Service-Worker-Allowed": "/" });
  res.end(fs.readFileSync(path.join(PUBLIC_DIR, "service-worker.js")));
  return;
  }

  if (p === "/video/news-author-guide.mp4" && method === "GET") {
    const videoPath = path.join(PUBLIC_DIR, "video", "news-author-guide.mp4");
    if (!fs.existsSync(videoPath)) return notFound(res, null, false);
    res.writeHead(200, { "Content-Type": "video/mp4", "Cache-Control": "public, max-age=86400" });
    fs.createReadStream(videoPath).pipe(res);
    return;
  }

  /* ---------------------------------------------------------- static images */
  if (p.startsWith("/img/") && method === "GET") {
  const name = path.basename(p);
  const types = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".avif": "image/avif"
  };
  const type = types[path.extname(name).toLowerCase()] || "application/octet-stream";
  let file = path.join(PUBLIC_DIR, "img", name);
  if (!fs.existsSync(file)) {
    const alt = findAssetFile(name, [__dirname]);
    if (alt) file = alt;
  }
  if (fs.existsSync(file)) {
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "public, max-age=86400"
    });
    fs.createReadStream(file).pipe(res);
    return;
  }
  return notFound(res, null, false);
  }

  /* ------------------------------------------------------------- language */
  const langMatch = p.match(/^\/lang\/(uz|en)$/);
  if (langMatch && method === "GET") {
  let back = "/";
  const ref = req.headers.referer || "";
  if (ref) {
  try {
  const parsed = new URL(ref);
  back = parsed.pathname + parsed.search;
  } catch (e) {}
  }
  if (!back.startsWith("/") || back.startsWith("//")) back = "/";
  res.writeHead(303, {
  Location: back,
  "Set-Cookie": cookie("ht_lang", langMatch[1], 365 * 24 * 60 * 60, req)
  });
  res.end();
  return;
  }

  if (p === "/contract/accept" && method === "POST") {
  if (!user) return redirect(res, "/login");
  db.prepare("UPDATE users SET contract_accepted_at = ? WHERE id = ?").run(nowISO(), user.id);
  let back = "/attestation";
  try {
  const ref = String(req.headers.referer || "");
  if (ref) {
  const refUrl = new URL(ref);
  if (refUrl.host === req.headers.host) back = refUrl.pathname + refUrl.search;
  }
  } catch (e) {}
  return redirect(res, back || "/attestation");
  }

  /* --------------------------------------------------------------- likes */
  const likeMatch = p.match(/^\/like\/(\d+)(\/status)?$/);
  if (likeMatch) {
  const lessonId = Number(likeMatch[1]);
  const lesson = db.prepare("SELECT id, likes FROM lessons WHERE id = ?").get(lessonId);
  if (!lesson) {
  res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: false }));
  return;
  }
  const wantsJson = String(req.headers.accept || "").includes("application/json");
  const liked = !!user && !!db.prepare("SELECT 1 FROM likes WHERE user_id = ? AND lesson_id = ?").get(user.id, lessonId);
  if (likeMatch[2] === "/status" && method === "GET") {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ ok: true, liked, likes: Number(lesson.likes) || 0 }));
  return;
  }
  if (method === "POST") {
  if (!user) {
  if (wantsJson) {
  res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: false, login: true }));
  } else {
  redirect(res, `/login?next=${encodeURIComponent(`/test/${lessonId}`)}`);
  }
  return;
  }
  let newLiked;
  if (liked) {
  db.prepare("DELETE FROM likes WHERE user_id = ? AND lesson_id = ?").run(user.id, lessonId);
  db.prepare("UPDATE lessons SET likes = MAX(0, likes - 1) WHERE id = ?").run(lessonId);
  newLiked = false;
  } else {
  db.prepare("INSERT OR IGNORE INTO likes (user_id, lesson_id, created_at) VALUES (?, ?, ?)").run(
  user.id,
  lessonId,
  nowISO()
  );
  db.prepare("UPDATE lessons SET likes = likes + 1 WHERE id = ?").run(lessonId);
  newLiked = true;
  }
  const fresh = db.prepare("SELECT likes FROM lessons WHERE id = ?").get(lessonId);
  if (wantsJson) {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ ok: true, liked: newLiked, likes: Number(fresh.likes) || 0 }));
  } else {
  redirect(res, req.headers.referer || `/test/${lessonId}`);
  }
  return;
  }
  }

  /* ------------------------------------------------------------- access */
  if (p === "/access") {
  let accessFields = {};
  if (method === "POST") {
  try {
  accessFields = (await readForm(req)).fields || {};
  } catch (e) {
  accessFields = {};
  }
  }
  const next = safeNext(url.searchParams.get("next") || accessFields.next || "/");
  if (method === "GET") {
  const body = authCard(
  "Platformaga kirish",
  "Kirish kodini kiriting.",
  `<form method="post" action="/access" class="form">
  <input type="hidden" name="next" value="${h(next)}">
  <div class="field"><label>Kirish kodi</label><input name="code" type="password" inputmode="numeric" required autofocus placeholder=""></div>
  <button class="btn btn-primary" type="submit">Kirish</button>
  </form>`
  );
  send(res, 200, layout({ title: "Kirish kodi", body }));
  return;
  }
  if (method === "POST") {
  const ip = clientIp(req);
  const lock = lockedFor(ip);
  if (lock) {
  send(
  res,
  429,
  layout({
  title: "Kutish",
  body: alertBox(`Juda ko'p urinish. ${lock} soniyadan keyin qayta urinib ko'ring.`)
  })
  );
  return;
  }
  if (String(accessFields.code || "").trim() !== accessCode()) {
  noteFailure(ip);
  const body = authCard(
  "Platformaga kirish",
  "Kod noto'g'ri.",
  `${alertBox("Kirish kodi noto'g'ri.")}
  <form method="post" action="/access" class="form">
  <input type="hidden" name="next" value="${h(next)}">
  <div class="field"><label>Kirish kodi</label><input name="code" type="password" inputmode="numeric" required autofocus></div>
  <button class="btn btn-primary" type="submit">Kirish</button>
  </form>`
  );
  send(res, 401, layout({ title: "Kirish kodi", body }));
  return;
  }
  clearFailures(clientIp(req));
  res.writeHead(303, {
  Location: next || "/",
  "Set-Cookie": cookie("ht_access", accessToken(accessCode()), 365 * 24 * 60 * 60, req)
  });
  res.end();
  return;
  }
  }

  if (p === "/favicon.ico") {
  res.writeHead(204).end();
  return;
  }

  let form = { fields: {}, files: {} };
  const isVideoChunkRequest = /^\/admin\/video-upload\/[a-f0-9]{40}$/.test(p);
  if (method === "POST") {
  if (!sameOrigin(req)) {
  send(res, 403, layout({ title: "Taqiqlangan", body: `<div class="card">So'rov rad etildi.</div>`, user, admin }));
  return;
  }
  try {
  if (!isVideoChunkRequest) form = await readForm(req);
  } catch (e) {
  const msg = e.message === "too_large"
    ? `Forma hajmi ${Math.round(MAX_MULTIPART_BODY / 1024 / 1024)} MB limitdan oshdi. Video faylini bo'laklab yuborish uchun video yuklash maydonidan foydalaning.`
    : "Formani o'qishda xatolik.";
  send(res, 413, layout({ title: "Xatolik", body: alertBox(msg), user, admin }));
  return;
  }
  }

  const fields = form.fields;
  const files = form.files;

  if (p === "/news/save" && method === "POST") {
    if (!author) return redirect(res, user ? "/news" : "/login");
    const posts = newsPosts();
    const id = String(fields.id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48);
    const previousPost = id ? posts.find((item) => item.id === id) : null;
    const post = {
      id: id || `news-${randomBytes(8).toString("hex")}`,
      title: String(fields.title || "").trim().slice(0, 180),
      body: String(fields.body || "").trim().slice(0, 4000),
      titleEn: String(fields.title_en ?? previousPost?.titleEn ?? "").trim().slice(0, 180),
      bodyEn: String(fields.body_en ?? previousPost?.bodyEn ?? "").trim().slice(0, 4000),
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(fields.date || "")) ? String(fields.date) : new Date().toISOString().slice(0, 10), updatedAt: nowISO()
    };
    if (!post.title || !post.body) return redirect(res, "/news?err=required");
    const index = posts.findIndex((item) => item.id === id);
    if (index >= 0) posts[index] = post;
    else posts.unshift(post);
    metaSet("news_posts_json", JSON.stringify(posts.slice(0, 60)));
    if (index < 0) notifyNewsSubscribers(post.title, post.body).catch((error) => console.error("[telegram] news broadcast failed", error.message));
    return redirect(res, "/news?saved=1");
  }

  const deleteNewsMatch = p.match(/^\/news\/delete\/([a-zA-Z0-9_-]{1,48})$/);
  if (deleteNewsMatch && method === "POST") {
    if (!author) return redirect(res, user ? "/news" : "/login");
    metaSet("news_posts_json", JSON.stringify(newsPosts().filter((post) => post.id !== deleteNewsMatch[1])));
    return redirect(res, "/news?deleted=1");
  }

  if (p === "/admin/video-upload/start" && method === "POST") {
    if (!contentManager) return json(res, 401, { error: "Tizimga kiring." });
    const fileName = path.basename(String(fields.name || "video.mp4")).slice(0, 180);
    const fileSize = Number(fields.size);
    const ext = path.extname(fileName).toLowerCase();
    if (!Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > MAX_VIDEO_UPLOAD) {
      return json(res, 413, { error: "Video hajmi 4 GB dan oshmasin." });
    }
    if (![".mp4", ".webm", ".mov", ".m4v", ".mkv"].includes(ext)) {
      return json(res, 415, { error: "MP4, WebM, MOV, M4V yoki MKV video tanlang." });
    }
    const token = randomBytes(20).toString("hex");
    const tempPath = path.join(STORAGE_DIR, `.upload-${token}`);
    await fs.promises.writeFile(tempPath, "");
    videoUploadSessions.set(token, { path: tempPath, name: fileName, size: fileSize, offset: 0, createdAt: Date.now() });
    return json(res, 200, { token, chunkSize: VIDEO_UPLOAD_CHUNK });
  }

  const videoUploadMatch = p.match(/^\/admin\/video-upload\/([a-f0-9]{40})$/);
  if (videoUploadMatch && method === "POST") {
    if (!admin) return json(res, 401, { error: "Admin tizimiga kiring." });
    const token = videoUploadMatch[1];
    const session = videoUploadSessions.get(token);
    if (!session || Date.now() - session.createdAt > 6 * 60 * 60 * 1000) {
      if (session) { videoUploadSessions.delete(token); fs.promises.unlink(session.path).catch(() => {}); }
      return json(res, 404, { error: "Video yuklash sessiyasi tugagan. Qayta boshlang." });
    }
    const offset = Number(url.searchParams.get("offset"));
    if (!Number.isSafeInteger(offset) || offset !== session.offset || session.busy) return json(res, 409, { error: "Video bo'lagi tartibi noto'g'ri." });
    session.busy = true;
    try {
      const chunk = await readRaw(req, VIDEO_UPLOAD_CHUNK);
      if (!chunk.length || session.offset + chunk.length > session.size) return json(res, 400, { error: "Video bo'lagi hajmi mos kelmadi." });
      await fs.promises.appendFile(session.path, chunk);
      session.offset += chunk.length;
    } catch (error) {
      if (error.message === "too_large") return json(res, 413, { error: "Yuborilgan bo'lak juda katta." });
      return json(res, 500, { error: "Video bo'lagini saqlab bo'lmadi." });
    } finally {
      session.busy = false;
    }
    return json(res, 200, { offset: session.offset, complete: session.offset === session.size });
  }

  if (p === "/news" && method === "GET") {
    const posts = newsPosts();
    const postCards = posts.length ? posts.map((post) => {
      const displayTitle = res.lang === "en" && post.titleEn ? post.titleEn : post.title;
      const displayBody = res.lang === "en" && post.bodyEn ? post.bodyEn : post.body;
      const authorActions = author ? `<div class="news-author-actions"><form method="post" action="/news/delete/${h(post.id)}" onsubmit="return confirm(document.documentElement.lang==='en'?'Remove this news post?':'Davom etilsinmi?')"><button class="btn btn-danger" type="submit">Yangilikni olib tashlash</button></form><details class="news-author-edit"><summary>Yangilikni tahrirlash</summary><form method="post" action="/news/save" class="form"><input type="hidden" name="id" value="${h(post.id)}"><div class="field"><label>Sana</label><input type="date" name="date" value="${h(post.date)}"></div><div class="field"><label>Sarlavha</label><input name="title" maxlength="180" required value="${h(post.title)}"></div><div class="field"><label>Matn</label><textarea name="body" maxlength="4000" rows="4" required>${h(post.body)}</textarea></div><button class="btn btn-primary" type="submit">Saqlash</button></form></details></div>` : "";
      return `<article class="card news-post"><time datetime="${h(post.date)}">${h(post.date || "Yangi")}</time><h2>${h(displayTitle)}</h2><p>${nl2br(h(displayBody))}</p>${authorActions}</article>`;
    }).join("") : `<div class="card empty"><h2>Hozircha yangiliklar yo'q</h2><p class="muted">Yangi xabarlar shu bo'limda e'lon qilinadi.</p></div>`;
    const authorTools = author ? `<details open class="card news-author-tools"><summary>Mualliflar uchun: yangilik qo'shish va boshqarish</summary><p class="muted">Yangiliklar sahifasining o'zida xabar kiriting va e'lon qiling.</p><video controls preload="metadata" aria-label="Yangilik qo'shish bo'yicha qisqa video"><source src="/video/news-author-guide.mp4" type="video/mp4">Brauzeringiz videoni ochmaydi.</video><form method="post" action="/news/save" class="form"><div class="field"><label>Sana</label><input type="date" name="date" value="${new Date().toISOString().slice(0, 10)}"></div><div class="field"><label>Sarlavha</label><input name="title" maxlength="180" required></div><div class="field"><label>Matn</label><textarea name="body" maxlength="4000" rows="4" required></textarea></div><button class="btn btn-primary" type="submit">Yangilikni e'lon qilish</button></form></details>` : "";
    const body = `<section class="news-page"><div class="page-head"><div><span class="eyebrow">PLATFORMADAN XABARLAR</span><h1>Yangiliklar</h1><p class="lead">Platformadagi yangilanish va e'lonlarni kuzatib boring.</p></div></div>${url.searchParams.get("saved") === "1" ? alertBox("Yangilik saqlandi.", "success") : ""}${url.searchParams.get("deleted") === "1" ? alertBox("Yangilik o'chirildi.", "success") : ""}${url.searchParams.get("err") === "required" ? alertBox("Sarlavha va matnni to‘ldiring.", "error") : ""}${authorTools}<div class="news-list">${postCards}</div></section>`;
    send(res, 200, layout({ title: "Yangiliklar", body, user, admin, seo: { path: "/news", title: "Yangiliklar | Habiba Teacher", description: "Habiba Teacher platformasidagi yangilanishlar, testlar va e'lonlar." } }));
    return;
  }

  /* --------------------------------------------------------------- home */
  if (p === "/" && method === "GET") {
  const stats = db
.prepare(
  `SELECT
  (SELECT COUNT(*) FROM users) AS users,
  (SELECT COUNT(DISTINCT category) FROM courses WHERE is_published = 1 AND is_test_group = 0) AS courses,
  (SELECT COUNT(*) FROM lessons l JOIN courses c ON c.id = l.course_id WHERE l.type = 'video' AND c.is_published = 1 AND c.is_test_group = 0) AS lessons,
  (SELECT COUNT(*) FROM lessons l JOIN courses c ON c.id = l.course_id WHERE l.type = 'test' AND c.is_published = 1) AS tests,
  (SELECT COUNT(*) FROM lessons l JOIN courses c ON c.id = l.course_id WHERE l.type = 'test' AND c.is_published = 1 AND c.category = 'attestation') AS tests_attestation,
  (SELECT COUNT(*) FROM lessons l JOIN courses c ON c.id = l.course_id WHERE l.type = 'test' AND c.is_published = 1 AND c.category = 'tkt') AS tests_tkt,
  (SELECT COUNT(*) FROM progress) AS done`
  )
.get();
  stats.courses = DIRECTIONS.length;
  const directionCourseRows = db.prepare(`SELECT c.category, COUNT(DISTINCT c.id) AS courses, COUNT(l.id) AS tests
    FROM courses c LEFT JOIN lessons l ON l.course_id = c.id AND l.type = 'test'
    WHERE c.is_published = 1 AND c.category IN ('attestation','tkt')
    GROUP BY c.category`).all();
  const directionStats = Object.fromEntries(DIRECTIONS.map((direction) => [direction.id, { courses: 0, tests: 0 }]));
  for (const row of directionCourseRows) {
    const directionId = row.category;
    if (directionStats[directionId]) {
      directionStats[directionId].courses += Number(row.courses) || 0;
      directionStats[directionId].tests += Number(row.tests) || 0;
    }
  }
  const copy = siteTexts();
  const aboutChecks = [copy.about_check_1, copy.about_check_2, copy.about_check_3, copy.about_check_4]
    .filter((value) => String(value || "").trim())
    .map((value) => `<li>${h(value)}</li>`).join("");
  const featureCards = [
    ["book", copy.feature_pdf_title, copy.feature_pdf_description],
    ["play", copy.feature_video_title, copy.feature_video_description],
    ["quiz", copy.feature_test_title, copy.feature_test_description]
  ].filter(([, title, description]) => String(title || "").trim() || String(description || "").trim())
    .map(([iconName, title, description]) => `<div class="card"><div class="ico">${icon(iconName)}</div>${String(title || "").trim() ? `<h3>${h(title)}</h3>` : ""}${String(description || "").trim() ? `<p class="muted">${h(description)}</p>` : ""}</div>`).join("");
  const faqItems = [1, 2, 3, 4].map((index) => ({ question: copy[`faq_q${index}`], answer: copy[`faq_a${index}`] }))
    .filter((item) => String(item.question || "").trim())
    .map((item) => `<details><summary>${h(item.question)}<span>+</span></summary>${String(item.answer || "").trim() ? `<p>${h(item.answer)}</p>` : ""}</details>`).join("");
  const directionCards = DIRECTIONS.map((direction) => {
    const counts = directionStats[direction.id];
    const detail = counts.tests ? `${counts.tests} ta test · ${counts.courses} ta kurs` : "Testlar tez orada qo'shiladi";
    const isLink = siteButtonVisible("direction_open") && String(copy.direction_open || "").trim();
    return `${isLink ? `<a class="direction-card" href="/${direction.id}">` : `<div class="direction-card">`}<span class="home-direction-count">${counts.tests || "→"}</span><h3>${h(categoryLabel(direction.id))}</h3><p class="muted">${h(direction.description)}</p><small>${h(detail)}</small>${isLink ? `<span class="card-link">${h(copy.direction_open)}</span></a>` : `</div>`}`;
  }).join("");
  const homeSections = homeSectionVisibility();
  const customHomeSections = homeCustomSections();
  const savedHomeSectionOrder = homeSectionOrder(customHomeSections);
  const currentNews = newsPosts();

  const planCards = getPlans().map((plan, index) => `<article class="home-plan-card${index === 1 ? " featured" : ""}">
    <span class="home-kicker">${index === 0 ? "BOSHLASH" : index === 1 ? "MASHHUR TANLOV" : "UZLUKSIZ RIVOJLANISH"}</span>
    <h3>${h(plan.title)}</h3><p>${h(plan.description)}</p>
    <div class="home-plan-price">${formatSum(plan.price)} <small>so'm</small></div>
    ${siteButtonVisible("pricing_plan") && String(copy.pricing_button || "").trim() ? `<a class="btn ${index === 1 ? "btn-primary" : "btn-ghost"}" href="/plans">${h(copy.pricing_button)} <span aria-hidden="true">↗</span></a>` : ""}
  </article>`).join("");

  let body = `
  <div class="landing-home">
  <section class="home-hero" data-home-section="hero">
  <div class="wrap landing-hero-grid">
  <div class="landing-hero-copy">
  <span class="eyebrow">${h(copy.hero_eyebrow)}</span>
  <h1 class="home-hero-message">Muhim sinovlarga yolg‘iz tayyorlanish oson emas — hamisha yonida ishonchli tayanch va amaliy mashq maydoni bo‘lsa, yo‘l ancha yengillashadi. Shu yerda muntazam mashq qiling, xatolaringizni xotirjam tahlil qiling va o‘zingizdagi o‘sishni har kuni ko‘rib boring. Birgalikda ishonch bilan harakat qilsak, albatta yuqori natijalarga chiqamiz.</h1>
  <p class="lead">${h(copy.hero_description)}</p>
  <div class="landing-actions">
  ${user || !siteButtonVisible("hero_register") || !String(copy.hero_primary || "").trim() ? "" : `<a class="btn btn-primary" href="/register">${h(copy.hero_primary)} <span aria-hidden="true">↗</span></a>`}
  ${siteButtonVisible("hero_directions") && String(copy.hero_secondary || "").trim() ? `<button class="btn btn-ghost home-direction-toggle" type="button" data-direction-toggle aria-expanded="false" aria-controls="directions">${h(copy.hero_secondary)} <span aria-hidden="true">⌄</span></button>` : ""}
  </div>
  <div class="home-direction-picker" id="directions" data-home-section="directions" hidden>
    <div class="grid home-direction-grid">${directionCards}</div>
  </div>
  <div class="hero-trust"><span>${h(copy.hero_trust_1)}</span><span>${h(copy.hero_trust_2)}</span><span>${h(copy.hero_trust_3)}</span></div>
  <div class="home-hero-note"><span class="home-note-dot"></span> ${h(copy.hero_note)}
  </div>
  </div>
  <div class="landing-hero-art" aria-label="Habiba teacher va o'qituvchilar">
  <div class="hero-photo-frame">
  <img src="/img/habiba-portrait.jpg" alt="Habiba Mo'minjonovna">
  <div class="hero-photo-caption"><small>HABIBA TEACHER</small><b>${h(copy.hero_image_caption)}</b></div>
  </div>
  ${copy.hero_float_title || copy.hero_float_description ? `<div class="hero-float-card one">${copy.hero_float_title && copy.hero_float_mark ? `<span class="hero-float-mark">${h(copy.hero_float_mark)}</span>` : ""}<span>${copy.hero_float_title ? `<strong>${h(copy.hero_float_title)}</strong>` : ""}${copy.hero_float_description ? `<small>${h(copy.hero_float_description)}</small>` : ""}</span></div>` : ""}
  </div>
  </div>
  <div class="wrap home-statbar">
    ${String(copy.stat_directions || "").trim() ? `<div><b>${stats.courses}</b><span>${h(copy.stat_directions)}</span></div>` : ""}
    ${String(copy.stat_lessons || "").trim() ? `<div><b>${stats.lessons}+</b><span>${h(copy.stat_lessons)}</span></div>` : ""}
    ${String(copy.stat_tests || "").trim() ? `<div><b>${stats.tests}</b><span>${h(copy.stat_tests)}</span></div>` : ""}
    ${String(copy.stat_note_title || "").trim() || String(copy.stat_note_description || "").trim() ? `<div class="home-stat-message"><span aria-hidden="true">✦</span><span>${String(copy.stat_note_title || "").trim() ? `<b>${h(copy.stat_note_title)}</b>` : ""}${String(copy.stat_note_description || "").trim() ? `<small>${h(copy.stat_note_description)}</small>` : ""}</span></div>` : ""}
  </div>
  </section>
  <section class="home-teachers-photo" data-home-section="teachers-photo" aria-label="O'qituvchilar jamoasi">
    <img src="/img/teachers-group.jpg" alt="O'zbekistonlik o'qituvchilar British Council treningida">
    <div class="home-teacher-marquee" role="img" aria-label="Ustozlar tajribasi baham ko‘rilganda, bilim ham, natija ham yuksaladi.">
      <div class="home-teacher-marquee-track" aria-hidden="true"><span>Ustozlar tajribasi baham ko‘rilganda, bilim ham, natija ham yuksaladi.</span><span>Ustozlar tajribasi baham ko‘rilganda, bilim ham, natija ham yuksaladi.</span></div>
    </div>
  </section>

  <section class="section home-overview" id="program" data-home-section="overview">
    <div class="wrap home-overview-grid">
      <div class="home-orbit-card" aria-label="O'rganishdan natijagacha bo'lgan bosqichlar">
        <span class="home-kicker">${h(copy.orbit_kicker)}</span>
  <div class="home-orbit" data-scroll-orbit><i></i><i></i><i></i><b>H</b><span>${h(copy.orbit_test)}</span><span>${h(copy.orbit_lesson)}</span><span>${h(copy.orbit_result)}</span></div>
        <div class="home-orbit-tags"><span>${h(copy.orbit_tag_1)}</span><span>${h(copy.orbit_tag_2)}</span><span>${h(copy.orbit_tag_3)}</span><span>${h(copy.orbit_tag_4)}</span></div>
      </div>
      <div class="home-overview-copy">
        <span class="eyebrow">${h(copy.overview_eyebrow)}</span>
        <h2>${h(copy.overview_title)} <span class="accent">${h(copy.overview_accent)}</span></h2>
        <p class="muted">${h(copy.overview_description)}</p>
        <div class="home-pillar-list">
          <article><span>01</span><div><b>${h(copy.pillar_1_title)}</b><p>${h(copy.pillar_1_description)}</p></div></article>
          <article><span>02</span><div><b>${h(copy.pillar_2_title)}</b><p>${h(copy.pillar_2_description)}</p></div></article>
          <article><span>03</span><div><b>${h(copy.pillar_3_title)}</b><p>${h(copy.pillar_3_description)}</p></div></article>
        </div>
      </div>
    </div>
  </section>

  <section class="section about" id="about" data-home-section="about">
  <div class="wrap about-grid">
  <div>
  <span class="eyebrow">${h(copy.about_eyebrow)}</span>
  <h2>${h(copy.about_title)}</h2>
  <p class="muted">${h(copy.about_description)}</p>
  ${aboutChecks ? `<ul class="check-list">${aboutChecks}</ul>` : ""}
  </div>
  <div class="about-art">
  <div class="about-mark">H</div>
  <b>${h(copy.about_card_title)}</b>
  <p>${h(copy.about_card_description)}</p>
  </div>
  </div>
  </section>

  <section class="stats-band" data-home-section="stats">
  <div class="wrap stats home-count-stats">
  ${String(copy.stat_students || "").trim() ? `<div class="stat"><b>${stats.users}</b><span>${h(copy.stat_students)}</span></div>` : ""}
  ${String(copy.stat_directions || "").trim() ? `<div class="stat"><b>${stats.courses}</b><span>${h(copy.stat_directions)}</span></div>` : ""}
  ${String(copy.stat_lessons || "").trim() ? `<div class="stat"><b>${stats.lessons}</b><span>${h(copy.stat_lessons)}</span></div>` : ""}
  ${String(copy.stat_test_attestation || "").trim() ? `<div class="stat"><b>${stats.tests_attestation}</b><span>${h(copy.stat_test_attestation)}</span></div>` : ""}
  ${String(copy.stat_test_tkt || "").trim() ? `<div class="stat"><b>${stats.tests_tkt}</b><span>${h(copy.stat_test_tkt)}</span></div>` : ""}
  <a class="stat home-news-stat" href="/news"><b>${currentNews.length}</b><span>Yangiliklar</span></a>
  </div>
  </section>

  <section class="section home-features" data-home-section="features">
  <div class="wrap">
  <div class="section-head center">
  <span class="eyebrow">${h(copy.feature_eyebrow)}</span>
  <h2>${h(copy.feature_title)}</h2>
  </div>
  <div class="grid three">${featureCards}</div>
  </div>
  </section>`;

  const additions = `
  <section class="section home-journey" data-home-section="program">
    <div class="wrap home-journey-grid">
      <div><span class="eyebrow">${h(copy.program_eyebrow)}</span><h2>${h(copy.program_title)} <span class="accent">${h(copy.program_accent)}</span></h2>
        <p class="muted">${h(copy.program_description)}</p>
        <div class="home-program-meta"><b>${stats.courses} ${h(copy.program_direction_suffix)}</b><span></span><b>${stats.lessons} ${h(copy.program_lesson_suffix)}</b></div>
      </div>
      <div class="home-steps">
        <details open><summary><span>01</span><span><small>${h(copy.program_attestation_tag)}</small><b>${h(copy.program_step_1_title)}</b></span><i>⌄</i></summary><p>${h(copy.program_step_1_description)}</p></details>
        <details><summary><span>02</span><span><small>${h(copy.program_tkt_tag)}</small><b>${h(copy.program_step_2_title)}</b></span><i>⌄</i></summary><p>${h(copy.program_step_2_description)}</p></details>
        <details><summary><span>03</span><span><small>${h(copy.program_practice_tag)}</small><b>${h(copy.program_step_3_title)}</b></span><i>⌄</i></summary><p>${h(copy.program_step_3_description)}</p></details>
      </div>
    </div>
  </section>
  <section class="section home-pricing" data-home-section="pricing">
    <div class="wrap"><div class="section-head home-section-head"><div><span class="eyebrow">${h(copy.pricing_eyebrow)}</span><h2>${h(copy.pricing_title)} <span class="accent">${h(copy.pricing_accent)}</span></h2><p class="muted">${h(copy.pricing_description)}</p></div>${siteButtonVisible("pricing_all") && String(copy.pricing_all || "").trim() ? `<a class="btn btn-ghost" href="/plans">${h(copy.pricing_all)} <span aria-hidden="true">↗</span></a>` : ""}</div>
      <div class="home-plan-grid">${planCards}</div>
    </div>
  </section>
  <section class="section home-faq" data-home-section="faq">
    <div class="wrap home-faq-grid"><div><span class="eyebrow">${h(copy.faq_eyebrow)}</span><h2>${h(copy.faq_title)} <span class="accent">${h(copy.faq_accent)}</span></h2><p class="muted">${h(copy.faq_description)}</p>${siteButtonVisible("faq_contact") && String(copy.faq_contact || "").trim() && config.telegram ? `<a class="home-contact-link" href="${h(config.telegram)}" target="_blank" rel="noopener">${h(copy.faq_contact)} ↗</a>` : ""}</div>
      ${faqItems ? `<div class="home-faq-list">${faqItems}</div>` : ""}
    </div>
  </section>
  <section class="section home-final-cta" data-home-section="final"><div class="wrap home-final-card"><div><span class="eyebrow">${h(copy.final_eyebrow)}</span><h2>${h(copy.final_title)} <span class="accent">${h(copy.final_accent)}</span></h2><p class="muted">${h(copy.final_description)}</p></div>${siteButtonVisible("final_cta") && String((user ? copy.final_button_logged : copy.final_button) || "").trim() ? `<a class="btn btn-primary" href="${user ? "/attestation" : "/register"}">${h(user ? copy.final_button_logged : copy.final_button)} <span aria-hidden="true">↗</span></a>` : ""}</div></section>
  </div>`;

  body += additions;
  const copyExtraSections = { nav: "final", hero: "hero", overview: "overview", directions: "directions", features: "features", program: "program", faq: "faq", footer: "final" };
  for (const [group, section] of Object.entries(copyExtraSections)) {
    const markup = siteCopyExtraMarkup(group);
    if (!markup) continue;
    const sectionPattern = new RegExp(`(<section\\b(?=[^>]*data-home-section="${section}")[^>]*>[\\s\\S]*?)(<\\/section>)`);
    body = body.replace(sectionPattern, (_match, content, closing) => `${content}${markup}${closing}`);
  }
  const sectionBlocks = new Map();
  body = body.replace(/<section\b(?=[^>]*data-home-section="([^"]+)")[^>]*>[\s\S]*?<\/section>/g, (block, key) => {
    sectionBlocks.set(key, block);
    return "";
  });
  for (const section of customHomeSections) {
    const key = `custom_${section.id}`;
    const rawUrl = section.buttonUrl.trim();
    const safeUrl = (rawUrl.startsWith("/") && !rawUrl.startsWith("//")) || /^https:\/\//i.test(rawUrl) ? rawUrl : "";
    sectionBlocks.set(key, `<section class="section home-custom-section" data-home-section="${key}"><div class="wrap"><div class="home-custom-copy"><span class="eyebrow">${h(copy.site_name)}</span><h2>${h(section.title)}</h2>${section.description ? `<p class="muted">${nl2br(section.description)}</p>` : ""}${safeUrl && section.buttonLabel && siteButtonVisible("custom_home_buttons") ? `<a class="btn btn-ghost" href="${h(safeUrl)}">${h(section.buttonLabel)} <span aria-hidden="true">↗</span></a>` : ""}</div></div></section>`);
  }
  const orderedBlocks = [...savedHomeSectionOrder, ...[...sectionBlocks.keys()].filter((key) => !savedHomeSectionOrder.includes(key))]
    .map((key) => sectionBlocks.get(key)).filter(Boolean).join("\n");
  const landingOpen = '<div class="landing-home">';
  const landingPosition = body.indexOf(landingOpen);
  if (landingPosition >= 0) {
    const insertAt = landingPosition + landingOpen.length;
    body = body.slice(0, insertAt) + orderedBlocks + body.slice(insertAt);
  }
  const hiddenSections = [
    ...Object.entries(homeSections).filter(([, visible]) => !visible).map(([key]) => `[data-home-section="${key}"]`),
    ...customHomeSections.filter((section) => !section.visible).map((section) => `[data-home-section="custom_${section.id}"]`)
  ].join(",");
  if (hiddenSections) body += `<style>${hiddenSections}{display:none!important}</style>`;
  body += `<script>(function(){var button=document.querySelector('[data-direction-toggle]');var picker=document.getElementById('directions');if(!button||!picker)return;function setOpen(open,scroll){button.setAttribute('aria-expanded',String(open));picker.hidden=!open;if(open&&scroll)picker.scrollIntoView({behavior:'smooth',block:'nearest'});}button.addEventListener('click',function(){setOpen(button.getAttribute('aria-expanded')!=='true',true);});document.addEventListener('keydown',function(event){if(event.key==='Escape'&&!picker.hidden){setOpen(false,false);button.focus();}});if(location.hash==='#directions')setOpen(true,true);})();</script>`;
  body += `<script>(function(){var home=document.querySelector('.landing-home');if(!home||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;var selectors=['.home-hero .landing-hero-copy > *','.home-hero .landing-hero-art > *','.home-statbar > *','.home-overview-grid > *','.home-overview-copy > *','.home-orbit-tags > *','.home-pillar-list > *','.landing-home .section-head > *','.landing-home .direction-card','.landing-home .course-card','.landing-home .about-grid > *','.landing-home .check-list > *','.landing-home .home-features .grid > *','.landing-home .home-journey-grid > *','.landing-home .home-steps > *','.landing-home .home-plan-card','.landing-home .home-faq-grid > *','.landing-home .home-faq-list > *','.landing-home .home-final-card > *','.landing-home [data-home-section^="custom_"] .home-custom-copy > *','.landing-home img'];var rows=new Set();selectors.forEach(function(selector){home.querySelectorAll(selector).forEach(function(row){if(row.textContent.trim()||row.matches('img'))rows.add(row)})});var items=Array.from(rows);items.forEach(function(row){var index=Array.prototype.indexOf.call(row.parentElement.children,row);row.classList.add('scroll-row');row.style.setProperty('--scroll-in-x',index%2?'34px':'-34px');row.style.setProperty('--scroll-delay',(index%4)*65+'ms')});if(!('IntersectionObserver' in window)){items.forEach(function(row){row.classList.add('is-in-view')});return}var observer=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){entry.target.classList.add('is-in-view');observer.unobserve(entry.target)}})},{threshold:.08,rootMargin:'0px 0px -4% 0px'});items.forEach(function(row){observer.observe(row)})})();</script>`;
  body += `<script>(function(){var orbit=document.querySelector('[data-scroll-orbit]');if(!orbit||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;var card=orbit.closest('.home-orbit-card');var rings=[].slice.call(orbit.querySelectorAll('i'));var base=[-26,40,-55];var pending=false;function draw(){pending=false;var r=card.getBoundingClientRect();var p=Math.max(-1,Math.min(1,(window.innerHeight*.52-(r.top+r.height/2))/(window.innerHeight*.78)));rings.forEach(function(el,i){var direction=i===1?1:-1;var angle=base[i]+p*56*direction;var scales=[.73,.68,.75];el.style.transform='translate3d('+(p*(i-1)*20)+'px,'+(-p*30*(i+1))+'px,0) rotate('+angle+'deg) scaleX('+scales[i]+')'});orbit.style.transform='translate3d('+(p*24)+'px,'+(-p*48)+'px,0) rotate('+(p*18)+'deg)'}function schedule(){if(pending)return;pending=true;window.requestAnimationFrame(draw)}window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule,{passive:true});schedule()})();</script>`;

  body += `<script>(function(){if(location.hash)return;try{history.scrollRestoration='manual'}catch(e){}function toTop(){if(!location.hash)window.scrollTo(0,0)}toTop();window.addEventListener('pageshow',toTop)})();</script>`;
  send(res, 200, layout({ title: "Habiba Teacher — Attestatsiya va TKT test platformasi", body, user, admin, seo: { path: "/", ogUrl: "https://habibateacher.uz/?share=20261124b", title: "Habiba Teacher — Attestatsiya va TKT testlari", description: "Ingliz tili o'qituvchilari uchun Toifa attestatsiyasi va TKT: Reading, Grammar, Vocabulary, Pragmatika, pedagogik mahorat hamda kasbiy standart testlari. Har kuni mashq qiling va natijangizni kuzating.", keywords: "ingliz tili attestatsiya testlari, pedagog attestatsiya testlari, o'qituvchi toifa testi, imtihonlarga tayyorlov, TKT testlari, TKT 1-modul, TKT 2-modul, TKT 3-modul" } }));
  return;
  }

  /* ------------------------------------------------------------- signup */
  if (p === "/register") {
  if (user) return redirect(res, "/attestation");

  if (method === "GET") {
  const next = safeNext(url.searchParams.get("next"));
  const duelInvite = /^\/duel\/[A-Z0-9]{6}$/i.test(next);
  const registrationToken = randomBytes(18).toString("hex");
  db.prepare("INSERT INTO registration_links (token, created_at, expires_at) VALUES (?, ?, ?)").run(registrationToken, nowISO(), Date.now() + 30 * 60 * 1000);
  const body = authCard(
  "Ro'yxatdan o'tish",
  duelInvite ? "Duelga qo'shilish uchun ma'lumotlaringizni kiriting." : "Ma'lumotlaringizni kiriting va yangi parol yarating.",
  `<form method="post" action="/register" class="form" autocomplete="on">
  ${next ? `<input type="hidden" name="next" value="${h(next)}">`: ""}
  <input type="hidden" name="registration_token" value="${registrationToken}">
  <input type="hidden" name="tg_init_data" value="">
  ${alertBox("Botga a'zo bo'ling va duelda bo'ladigan qiziqarli o'yinlar haqidagi xabarlarni oling.", "success")}
  <div class="field"><a class="btn btn-primary" href="${h(botStartLink(`register_${registrationToken}`))}" target="_blank" rel="noopener">🤖 Telegram botga o'tish va /start bosish</a></div>
  <div class="field"><label>Ismingiz</label><input name="name" required maxlength="40" autocomplete="off" placeholder="Habiba"></div>
  <div class="field"><label>Familiyangiz</label><input name="surname" required maxlength="60" autocomplete="off" placeholder="Qoraboyeva"></div>
  <div class="field"><label>Otangizning ismi (otchestvo)</label><input name="father_name" required maxlength="60" autocomplete="off" placeholder="Muminjonovna / yoki / vich / qizi / o'g'li"></div>
  <div class="field"><label>Tug'ilgan kun.oy.yil</label><input name="birth_date" data-birth-date required inputmode="numeric" maxlength="10" autocomplete="off" pattern="[0-9]{2}\\.[0-9]{2}\\.[0-9]{4}" placeholder="kun.oy.yil, masalan 05.09.1995"></div>
  <div class="field"><label>Telefon raqamingiz</label><input name="phone" data-phone required inputmode="tel" autocomplete="username" placeholder="+998 93 568 00 91"></div>
  <div class="field"><label>Parol</label>${registrationPasswordInput("password", "new-password")}${passwordRequirementsMarkup()}</div>
  <div class="field"><label>Parolni qayta tasdiqlang</label>${registrationPasswordInput("password_confirm", "new-password", "Parolni qayta kiriting")}</div>
  <button class="btn btn-primary" type="submit">Ro'yxatdan o'tish</button>
  </form>`,
  `<p class="alt">Akkountingiz bormi? <a href="/login${next ? `?next=${encodeURIComponent(next)}`: ""}">Kirish</a></p>`,
  "/"
  );
  send(res, 200, layout({ title: "Ro'yxatdan o'tish", body }));
  return;
  }

  const next = safeNext(fields.next || url.searchParams.get("next"));
  const firstName = String(fields.name || "").trim();
  const surname = String(fields.surname || "").trim();
  const fatherName = String(fields.father_name || "").trim();
  const fullName = [firstName, surname, fatherName].filter(Boolean).join(" ");
  const birthDateInput = String(fields.birth_date || "").trim();
  const birthDate = normalizeBirthDate(birthDateInput);
  const phone = normalizePhone(fields.phone);
  const duelInvite = /^\/duel\/[A-Z0-9]{6}$/i.test(next);
  const password = String(fields.password || "");
  const passwordError = passwordPolicyError(password);
  const passwordConfirm = String(fields.password_confirm || "");
  const registrationToken = String(fields.registration_token || "").trim();
  const tgUser = telegramUserFromInitData(fields.tg_init_data);
  const registrationLink = db.prepare("SELECT * FROM registration_links WHERE token = ? AND used = 0").get(registrationToken);
  const telegramId = registrationLink && Number(registrationLink.expires_at) >= Date.now() ? String(registrationLink.chat_id || "") : String(tgUser && tgUser.id || "");
  const telegramUsername = normalizeTelegramUsername(tgUser && tgUser.username);

  let error = "";
  if (!/^[\p{L}\s'-]{2,}$/u.test(firstName)) error = "Ismni to'g'ri kiriting.";
  else if (!/^[\p{L}\s'-]{2,}$/u.test(surname)) error = "Familiyani to'g'ri kiriting.";
  else if (!/^[\p{L}\s'-]{2,}$/u.test(fatherName)) error = "Otangizning ismini to'g'ri kiriting.";
  else if (!birthDate) error = "Tug'ilgan sanani kun.oy.yil ko'rinishida to'g'ri kiriting.";
  else if (!validPhoneInput(fields.phone) || !validPhone(phone)) error = "Telefon raqami faqat 9 ta raqamdan iborat bo'lishi kerak.";
  else if (passwordError) error = passwordError;
  else if (password !== passwordConfirm) error = "Parollar bir xil emas. Qayta tekshiring.";
  else if (!telegramId) error = `Ro'yxatdan o'tishdan oldin botga /start bosing, botdan tasdiq xabari kelgach shu sahifaga qayting.`;
  else if (telegramId && db.prepare("SELECT 1 FROM users WHERE telegram_id = ?").get(telegramId))
  error = "Bu Telegram ID allaqachon ro'yxatdan o'tgan. Bir ID   bitta akkaunt.";
  else if (telegramUsername && db.prepare("SELECT 1 FROM users WHERE telegram_username = ? COLLATE NOCASE").get(telegramUsername))
  error = "Bu Telegram username allaqachon ro'yxatdan o'tgan.";
  else if (findUserByPhone(phone, "id"))
  error = "Bu telefon raqam allaqachon ro'yxatdan o'tgan.";

  if (error) {
  const body = authCard(
  "Ro'yxatdan o'tish",
  duelInvite ? "Duelga qo'shilish uchun ma'lumotlaringizni kiriting." : "Ma'lumotlaringizni tekshirib, ro'yxatdan o'ting.",
  `${alertBox(error)}
  <form method="post" action="/register" class="form" autocomplete="on">
  ${next ? `<input type="hidden" name="next" value="${h(next)}">`: ""}
  <input type="hidden" name="registration_token" value="${h(registrationToken)}">
  <input type="hidden" name="tg_init_data" value="">
  ${alertBox("Botga a'zo bo'ling va duelda bo'ladigan qiziqarli o'yinlar haqidagi xabarlarni oling.", "success")}
  <div class="field"><a class="btn btn-primary" href="${h(botStartLink(`register_${registrationToken}`))}" target="_blank" rel="noopener">🤖 Telegram botga o'tish va /start bosish</a></div>
  <div class="field"><label>Ismingiz</label><input name="name" value="${h(firstName)}" required maxlength="40" autocomplete="off"></div>
  <div class="field"><label>Familiyangiz</label><input name="surname" value="${h(surname)}" required maxlength="60" autocomplete="off"></div>
  <div class="field"><label>Otangizning ismi (otchestvo)</label><input name="father_name" value="${h(fatherName)}" required maxlength="60" autocomplete="off"></div>
  <div class="field"><label>Tug'ilgan kun.oy.yil</label><input name="birth_date" data-birth-date value="${h(birthDateInput)}" required inputmode="numeric" maxlength="10" autocomplete="off" pattern="[0-9]{2}\\.[0-9]{2}\\.[0-9]{4}" placeholder="kun.oy.yil, masalan 05.09.1995"></div>
  <div class="field"><label>Telefon raqamingiz</label><input name="phone" data-phone value="${h(fields.phone || "")}" required inputmode="tel" maxlength="17" autocomplete="username" placeholder="+998 90 123 45 67"></div>
  <div class="field"><label>Parol</label>${registrationPasswordInput("password", "new-password")}${passwordRequirementsMarkup()}</div>
  <div class="field"><label>Parolni qayta tasdiqlang</label>${registrationPasswordInput("password_confirm", "new-password")}</div>
  <button class="btn btn-primary" type="submit">Ro'yxatdan o'tish</button>
  </form>`,
  `<p class="alt">Akkountingiz bormi? <a href="/login${next ? `?next=${encodeURIComponent(next)}`: ""}">Kirish</a></p>`,
  "/"
  );
  send(res, 400, layout({ title: "Ro'yxatdan o'tish", body }));
  return;
  }

  const info = db
.prepare(
  "INSERT INTO users (name, surname, father_name, birth_date, phone, pass, telegram_id, telegram_username, created_at, is_author) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN lower(? || ' ' || ? || ' ' || ?) LIKE '%habiba%qoraboyeva%' OR lower(? || ' ' || ? || ' ' || ?) LIKE '%qoraboyeva%habiba%' OR lower(? || ' ' || ? || ' ' || ?) LIKE '%habiba%mo''minjonovna%' OR lower(? || ' ' || ? || ' ' || ?) LIKE '%mo''minjonovna%habiba%' THEN 1 ELSE 0 END)"
)
.run(fullName, surname, fatherName, birthDate, phone, hashPassword(password), telegramId || null, telegramUsername || null, nowISO(), fullName, surname, fatherName, fullName, surname, fatherName, fullName, surname, fatherName, fullName, surname, fatherName);
  db.prepare("UPDATE registration_links SET used = 1 WHERE token = ?").run(registrationToken);
  createUserSession(res, Number(info.lastInsertRowid), req);
  createDeviceSession(res, Number(info.lastInsertRowid), req);
  notifyTelegram(
    `<b>Yangi ro'yxatdan o'tish</b>\nIsm: ${h(fullName)}\nTelefon: ${h(phone)}\nTelegram: ${h(
      telegramUsername ? "@" + telegramUsername : telegramId || "ulanmagan"
    )}\nVaqt: ${new Date().toLocaleString("uz-UZ")}`
  ).catch(() => {});
  redirect(res, next || "/dashboard?registered=1");
  return;
  }

  /* ---------------------------------------------------------- password reset */
  if (p === "/login/reset" && method === "GET") {
  const step = url.searchParams.get("step") === "verify" ? "verify" : "phone";
  const phoneRaw = formatLocalPhone(url.searchParams.get("phone") || "");
  const err = String(url.searchParams.get("err") || "");
  const alerts = {
    phone: "Telefon raqamini to'g'ri kiriting.",
    notfound: "Bu telefon raqam bilan akkaunt topilmadi.",
    telegram: "Avval ulangan Telegram botga /start yuboring, keyin parolni tiklashni qayta boshlang.",
    sendcode: "Telegram tasdiqlash kodini yubora olmadi. Botni ochib /start bosing va qayta urinib ko'ring.",
    wrong: "Tasdiqlash kodi noto'g'ri. Qayta kiriting.",
    expired: "Kod muddati tugadi. Yangi kod so'rang.",
    blocked: "Urinishlar ko'p bo'ldi. Yangi kod so'rang.",
    updated: "Parol yangilandi. Endi yangi parol bilan kiring."
  };
  const body = `<section class="login-modern"><div class="login-card">
    <h1 class="login-title">Parolni tiklash</h1>
    <p class="login-sub">Telefoningizga ulangan Telegram bot orqali parolni tiklang.</p>
    ${alerts[err] ? alertBox(alerts[err], err === "updated" ? "success" : "error") : ""}
    ${err === "telegram" || err === "sendcode" ? `<p class="center-actions"><a class="btn btn-ghost" href="${h(botLink())}" target="_blank" rel="noopener">Telegram botni ochish</a></p>` : ""}
    ${step === "verify" ? `<form method="post" action="/login/reset/verify" class="login-form">
      <input type="hidden" name="phone" value="${h(phoneRaw)}">
      <p class="login-sub"><b>${h(phoneRaw)}</b> raqamiga ulangan botga 6 xonali kod yuborildi.</p>
      <div class="field"><label>Tasdiqlash kodi</label><input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" placeholder="123456" required></div>
      <button class="btn-continue" type="submit">Tasdiqlash</button>
    </form><form method="post" action="/login/reset/start" class="login-resend"><input type="hidden" name="phone" value="${h(phoneRaw)}"><button class="link" type="submit">Kodni qayta yuborish</button></form>`
    : `<form method="post" action="/login/reset/start" class="login-form">
      <div class="field"><label>Telefon</label><input name="phone" data-phone value="${h(phoneRaw)}" inputmode="tel" maxlength="17" autocomplete="tel-national" placeholder="+998 90 123 45 67" required></div>
      <button class="btn-continue" type="submit">Telegramga kod yuborish</button>
    </form>`}
    <p class="alt"><a href="/login?pw=1${phoneRaw ? `&phone=${encodeURIComponent(phoneRaw)}` : ""}">Kirishga qaytish</a></p>
  </div></section>`;
  send(res, 200, layout({ title: "Parolni tiklash", body }));
  return;
  }

  if (p === "/login/reset/start" && method === "POST") {
  const phone = normalizePhone(fields.phone);
  if (!validPhoneInput(fields.phone) || !validPhone(phone)) return redirect(res, "/login/reset?err=phone");
  const row = findUserByPhone(phone, "id, phone, telegram_id, telegram_username, is_blocked");
  if (!row) return redirect(res, "/login/reset?err=notfound");
  if (Number(row.is_blocked)) return redirect(res, "/login/reset?err=blocked");
  const chatId = resolveTelegramChatId(row);
  if (!chatId) return redirect(res, "/login/reset?err=telegram");
  const currentCode = db.prepare("SELECT created_at FROM login_codes WHERE phone = ?").get(phone);
  if (currentCode && Date.now() - Date.parse(currentCode.created_at) < 30000) {
    return redirect(res, `/login/reset?step=verify&phone=${encodeURIComponent(formatLocalPhone(phone))}`);
  }
  const code = String(randomInt(100000, 1000000));
  if (!(await sendLoginCode(chatId, code))) return redirect(res, "/login/reset?err=sendcode");
  db.prepare(`INSERT INTO login_codes (phone, code_hash, expires_at, attempts, created_at)
    VALUES (?, ?, ?, 0, ?)
    ON CONFLICT(phone) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, created_at = excluded.created_at`
  ).run(phone, loginCodeHash(phone, code), Date.now() + 5 * 60 * 1000, nowISO());
  return redirect(res, `/login/reset?step=verify&phone=${encodeURIComponent(formatLocalPhone(phone))}`);
  }

  if (p === "/login/reset/verify" && method === "POST") {
  const phone = normalizePhone(fields.phone);
  const code = String(fields.code || "").replace(/\D/g, "");
  const back = `/login/reset?step=verify&phone=${encodeURIComponent(formatLocalPhone(phone))}`;
  if (!validPhone(phone)) return redirect(res, "/login/reset?err=phone");
  const userRow = findUserByPhone(phone, "id, telegram_id, telegram_username, is_blocked");
  const codeRow = db.prepare("SELECT * FROM login_codes WHERE phone = ?").get(phone);
  if (!codeRow || codeRow.expires_at < Date.now()) {
    if (codeRow) db.prepare("DELETE FROM login_codes WHERE phone = ?").run(phone);
    return redirect(res, `${back}&err=expired`);
  }
  if (codeRow.attempts >= 5) {
    db.prepare("DELETE FROM login_codes WHERE phone = ?").run(phone);
    return redirect(res, `${back}&err=blocked`);
  }
  if (!userRow || Number(userRow.is_blocked)) return redirect(res, "/login/reset?err=notfound");
  if (!/^\d{6}$/.test(code) || !safeEqual(loginCodeHash(phone, code), codeRow.code_hash)) {
    db.prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE phone = ?").run(phone);
    return redirect(res, `${back}&err=wrong`);
  }
  const resetToken = randomBytes(32).toString("hex");
  db.prepare("UPDATE login_codes SET code_hash = ?, expires_at = ?, attempts = 0, created_at = ? WHERE phone = ?")
    .run(loginCodeHash(phone, resetToken), Date.now() + 10 * 60 * 1000, nowISO(), phone);
  send(res, 200, layout({ title: "Yangi parol", body: resetPasswordForm(phone, resetToken), noindex: true }));
  return;
  }

  if (p === "/login/reset/password" && method === "POST") {
  const phone = normalizePhone(fields.phone);
  const resetToken = String(fields.reset_token || "");
  const password = String(fields.password || "");
  const passwordConfirm = String(fields.password_confirm || "");
  const codeRow = validPhone(phone) ? db.prepare("SELECT * FROM login_codes WHERE phone = ?").get(phone) : null;
  if (!codeRow || codeRow.expires_at < Date.now()) {
    if (codeRow) db.prepare("DELETE FROM login_codes WHERE phone = ?").run(phone);
    return redirect(res, "/login/reset?err=expired");
  }
  if (codeRow.attempts >= 5) {
    db.prepare("DELETE FROM login_codes WHERE phone = ?").run(phone);
    return redirect(res, "/login/reset?err=blocked");
  }
  if (!/^[a-f0-9]{64}$/i.test(resetToken) || !safeEqual(loginCodeHash(phone, resetToken), codeRow.code_hash)) {
    db.prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE phone = ?").run(phone);
    send(res, 400, layout({ title: "Yangi parol", body: resetPasswordForm(formatLocalPhone(phone), resetToken, "Tiklash havolasi noto'g'ri. Qayta urinib ko'ring."), noindex: true }));
    return;
  }
  const userRow = findUserByPhone(phone, "id, is_blocked");
  if (!userRow || Number(userRow.is_blocked)) return redirect(res, "/login/reset?err=notfound");
  const policyError = passwordPolicyError(password);
  if (policyError || password !== passwordConfirm) {
    const error = policyError || "Parollar bir xil emas. Qayta tekshiring.";
    send(res, 400, layout({ title: "Yangi parol", body: resetPasswordForm(formatLocalPhone(phone), resetToken, error), noindex: true }));
    return;
  }
  db.prepare("UPDATE users SET pass = ?, password_failures = 0 WHERE id = ?").run(hashPassword(password), userRow.id);
  db.prepare("DELETE FROM login_codes WHERE phone = ?").run(phone);
  return redirect(res, "/login/reset?err=updated");
  }

  /* -------------------------------------------------------------- login */
  if (p === "/login/start" && method === "POST") {
  const startNext = safeNext(fields.next || url.searchParams.get("next"));
  const startNextJoin = startNext ? `&next=${encodeURIComponent(startNext)}` : "";
  const phone = formatLocalPhone(fields.phone);
  return redirect(res, `/login?pw=1&phone=${encodeURIComponent(phone)}${startNextJoin}`);
  }

  if (p === "/login/verify" && method === "POST") {
  const verifyNext = safeNext(fields.next);
  const verifyNextJoin = verifyNext ? `&next=${encodeURIComponent(verifyNext)}` : "";
  const phone = normalizePhone(fields.phone);
  const code = String(fields.code || "").replace(/\D/g, "");
  const back = `/login?step=3&phone=${encodeURIComponent(phone)}${verifyNextJoin}`;
  const row = db.prepare("SELECT * FROM login_codes WHERE phone = ?").get(phone);
  if (!row || row.expires_at < Date.now()) {
  if (row) db.prepare("DELETE FROM login_codes WHERE phone = ?").run(phone);
  return redirect(res, `${back}&err=expired`);
  }
  if (row.attempts >= 5) {
  db.prepare("DELETE FROM login_codes WHERE phone = ?").run(phone);
  return redirect(res, `${back}&err=blocked`);
  }
  if (!/^\d{6}$/.test(code) || loginCodeHash(phone, code) !== row.code_hash) {
  db.prepare("UPDATE login_codes SET attempts = attempts + 1 WHERE phone = ?").run(phone);
  return redirect(res, `${back}&err=wrong`);
  }
  db.prepare("DELETE FROM login_codes WHERE phone = ?").run(phone);
  const userRow = findUserByPhone(phone, "id, is_blocked");
  if (!userRow) return redirect(res, "/login?err=notfound");
  if (Number(userRow.is_blocked)) return redirect(res, "/login?err=blocked");
  if (hasDeviceLimitReached(userRow.id, req)) return redirect(res, `${back}&err=device`);
  clearFailures(clientIp(req));
  createUserSession(res, userRow.id, req);
  createDeviceSession(res, userRow.id, req);
  return redirect(res, verifyNext || "/dashboard");
  }

  if (p === "/login/link-status" && method === "GET") {
  const token = String(url.searchParams.get("token") || "");
  const row = db.prepare("SELECT chat_id, expires_at, send_error FROM login_links WHERE token = ?").get(token);
  const linked = Boolean(row && row.chat_id && Number(row.expires_at) > Date.now());
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify({ linked, error: Boolean(row && row.send_error) }));
  return;
  }

  if (p === "/login") {
  const pageNext = safeNext(url.searchParams.get("next"));
  if (!user) {
    const deviceToken = parseCookies(req).ht_device;
    if (deviceToken) {
      const deviceUser = db
      .prepare("SELECT u.id, u.is_blocked, d.created_at FROM device_sessions d JOIN users u ON u.id = d.user_id WHERE d.token = ?")
        .get(deviceToken);
      if (deviceUser && !Number(deviceUser.is_blocked) && Date.now() - Date.parse(deviceUser.created_at) < 3 * 24 * 60 * 60 * 1000) {
        db.prepare("UPDATE device_sessions SET last_seen = ? WHERE token = ?").run(nowISO(), deviceToken);
        createUserSession(res, deviceUser.id, req);
        return redirect(res, pageNext || "/dashboard");
      }
      db.prepare("DELETE FROM device_sessions WHERE token = ?").run(deviceToken);
      clearCookie(res, "ht_device");
    }
  }
  if (user) return redirect(res, pageNext || "/attestation");

  if (method === "GET") {
  const step = 1;
  const phoneRaw = formatLocalPhone(url.searchParams.get("phone") || "");
  const err = String(url.searchParams.get("err") || "");
  const pwMode = true;
  const nextQs = pageNext ? `?next=${encodeURIComponent(pageNext)}` : "";
  const nextJoin = pageNext ? `&next=${encodeURIComponent(pageNext)}` : "";
  const passwordAction = `/login?pw=1${nextJoin}`;
  const nextHidden = pageNext ? `<input type="hidden" name="next" value="${h(pageNext)}">` : "";
  const steps = `
  <div class="login-steps">
  <a class="login-step${step === 1 ? " active" : ""}" href="/login${nextQs}">
  <span class="login-step-ico"><svg viewBox="0 0 24 24"><path d="M6.5 3h3l1.5 4-2 1.5a12 12 0 0 0 6.5 6.5L17 13l4 1.5v3A2.5 2.5 0 0 1 18.5 20 15.5 15.5 0 0 1 4 5.5 2.5 2.5 0 0 1 6.5 3Z"/></svg></span>
  <b>Telefon</b>
  </a>
  <span class="login-step${step === 2 ? " active" : ""}">
  <span class="login-step-ico"><svg viewBox="0 0 24 24"><path d="M21 4 3 11l5 2 2 6 3-4 5 3z"/></svg></span>
  <b>Telegram</b>
  </span>
  <span class="login-step${step === 3 ? " active" : ""}">
  <span class="login-step-ico"><svg viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 7l3 3"/></svg></span>
  <b>Kod</b>
  </span>
  </div>`;

  let stepHtml = "";
  if (step === 1) {
  stepHtml = `
  <h1 class="login-title">Kirish</h1>
  <p class="login-sub">Telefon raqamingizni kiriting</p>
  ${err === "phone" ? alertBox("+998 dan keyin telefon raqamining 9 ta raqamini kiriting.", "error") : ""}
  ${err === "notfound" ? alertBox("Bu raqam ro'yxatdan o'tmagan.", "error") : ""}
  ${err === "blocked" ? alertBox("Akkauntga kirish vaqtincha cheklangan. Administrator bilan bog'laning.", "error") : ""}
  ${err === "device" ? alertBox("Bu akkaunt ikki qurilmada faol. Uchinchi qurilmada kirish uchun avval qurilmalardan biridan chiqing.", "error") : ""}
  ${err === "notelegram" ? alertBox("Bu akkauntga Telegram bog'lanmagan. Parol bilan kiring.", "error") : ""}
  ${err === "startbot" ? alertBox("Avval Telegram botga /start yozing. Shundan keyin kirish kodi shu botga keladi.", "error") : ""}
  ${err === "sendcode" ? alertBox("Telegram bot kirish kodini yubora olmadi. Telegram akkauntingizda botni ochib /start bosing yoki parol bilan kiring.", "error") : ""}
  ${err === "startbot" ? `<div class="actions" style="margin-bottom:16px"><a class="btn btn-primary" href="${botLink()}" target="_blank" rel="noopener">Botni ochish</a></div>` : ""}
  ${pwMode ? `
  <form method="post" action="${h(passwordAction)}" class="login-form">
  ${nextHidden}
  <div class="phone-wrap">
  <span class="phone-ico"><svg viewBox="0 0 24 24"><path d="M6.5 3h3l1.5 4-2 1.5a12 12 0 0 0 6.5 6.5L17 13l4 1.5v3A2.5 2.5 0 0 1 18.5 20 15.5 15.5 0 0 1 4 5.5 2.5 2.5 0 0 1 6.5 3Z"/></svg></span>
  <span class="phone-prefix">+998</span><input id="phoneInput" name="phone" value="${h(phoneRaw)}" required inputmode="numeric" maxlength="12" placeholder="90 123 45 67" autocomplete="username">
  </div>
  <div class="field"><label>Parol</label><input name="password" type="password" required maxlength="64" autocomplete="current-password"></div>
  <button class="btn-continue" type="submit">Kirish <span>&rarr;</span></button>
  </form>
  ` : `
  <form method="post" action="/login/start" class="login-form">
  ${nextHidden}
  <div class="phone-wrap">
  <span class="phone-ico"><svg viewBox="0 0 24 24"><path d="M6.5 3h3l1.5 4-2 1.5a12 12 0 0 0 6.5 6.5L17 13l4 1.5v3A2.5 2.5 0 0 1 18.5 20 15.5 15.5 0 0 1 4 5.5 2.5 2.5 0 0 1 6.5 3Z"/></svg></span>
  <span class="phone-prefix">+998</span><input id="phoneInput" name="phone" value="${h(phoneRaw)}" required inputmode="numeric" maxlength="12" placeholder="90 123 45 67" autocomplete="username">
  </div>
  <button class="btn-continue" type="submit">Davom etish <span>&rarr;</span></button>
  </form>
  `}
  ${(err === "notelegram" || err === "startbot" || err === "sendcode") && !pwMode ? `<p class="alt"><a href="/login?pw=1&phone=${encodeURIComponent(phoneRaw)}${nextJoin}">Parol bilan kirish</a></p>` : ""}
  <script>
  (function () {
  var el = document.getElementById('phoneInput');
  if (!el || el.dataset.bound) return;
  el.dataset.bound = '1';
  function formatPhone() {
  var d = el.value.replace(/\\D/g, '');
  if (d.indexOf('998') === 0) d = d.slice(3);
  else if (d.length === 10 && d.indexOf('8') === 0) d = d.slice(1);
  d = d.slice(0, 9);
  var out = '';
  if (d.length) out += d.slice(0, 2);
  if (d.length > 2) out += ' ' + d.slice(2, 5);
  if (d.length > 5) out += ' ' + d.slice(5, 7);
  if (d.length > 7) out += ' ' + d.slice(7, 9);
  el.value = out;
  }
  el.addEventListener('input', formatPhone);
  formatPhone();
  })();
  </script>`;
  } else if (step === 2) {
  const linkToken = String(url.searchParams.get("link") || "");
  const nextStep = `/login?step=3&phone=${encodeURIComponent(phoneRaw)}${nextJoin}`;
  if (linkToken) {
  stepHtml = `
  <h1 class="login-title">Telegramni ulash</h1>
  <p class="login-sub">Quyidagi tugma orqali botni oching va <b>Start</b> ni bosing. Kirish kodi shu botga keladi.</p>
  <a class="btn-continue" href="${botStartLink("login_" + linkToken)}" target="_blank" rel="noopener">Botni ochish &rarr;</a>
  <p class="login-sub" style="margin-top:14px">Botda Start bosilgach, bu sahifa avtomatik kod kiritish qadamiga o'tadi.</p>
  <a class="login-next" href="${nextStep}">Kodni kiritish</a>
  <script>
  (function () {
  var token = ${JSON.stringify(linkToken)};
  var next = ${JSON.stringify(nextStep)};
  var failed = ${JSON.stringify(`/login?err=sendcode&phone=${encodeURIComponent(phoneRaw)}${nextJoin}`)};
  var timer = setInterval(function () {
  fetch('/login/link-status?token=' + encodeURIComponent(token))
  .then(function (r) { return r.json(); })
  .then(function (d) {
  if (d && d.error) {
  clearInterval(timer);
  location.href = failed;
  return;
  }
  if (d && d.linked) {
  clearInterval(timer);
  location.href = next;
  }
  })
  .catch(function () {});
  }, 3000);
  })();
  </script>`;
  } else {
  stepHtml = `
  <h1 class="login-title">Botga kelgan kodni kiriting</h1>
  <p class="login-sub"><b>${h(phoneRaw)}</b> raqamiga bog'langan Telegram botga 6 xonali kod yuborildi. Kodni nusxalab, keyingi qadamda kiriting.</p>
  <a class="btn-continue" href="${nextStep}">Kodni kiritish &rarr;</a>
  <a class="login-next" href="${botLink()}" target="_blank" rel="noopener">Botni ochish</a>
  <form method="post" action="/login/start" class="login-resend">
  <input type="hidden" name="phone" value="${h(phoneRaw)}">
  ${nextHidden}
  <button class="link" type="submit">Kodni qayta yuborish</button>
  </form>`;
  }
  } else {
  stepHtml = `
  <h1 class="login-title">Kodni kiriting</h1>
  <p class="login-sub">Telegramdan kelgan 6 xonali kod</p>
  ${err === "wrong" ? alertBox("Kod noto'g'ri. Qayta urinib ko'ring.", "error") : ""}
  ${err === "expired" ? alertBox("Kod muddati tugagan. Qayta yuboring.", "error") : ""}
  ${err === "blocked" ? alertBox("Juda ko'p urinish. Yangi kod oling.", "error") : ""}
  ${err === "device" ? alertBox("Bu akkaunt ikki qurilmada faol. Uchinchi qurilmada kirish uchun avval qurilmalardan biridan chiqing.", "error") : ""}
  <form method="post" action="/login/verify" class="login-form">
  <input type="hidden" name="phone" value="${h(phoneRaw)}">
  ${nextHidden}
  <div class="field"><input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="123456" required autocomplete="one-time-code" class="code-input"></div>
  <button class="btn-continue" type="submit">Kirish <span>&rarr;</span></button>
  </form>
  <form method="post" action="/login/start" class="login-resend">
  <input type="hidden" name="phone" value="${h(phoneRaw)}">
  ${nextHidden}
  <button class="link" type="submit">Kodni qayta yuborish</button>
  </form>`;
  }

  const body = `
  <section class="login-modern">
  <div class="login-card">
  ${steps}
  ${stepHtml}
  <p class="login-terms">Davom etish orqali <a href="/plans">foydalanish shartlariga</a> rozilik bildirasiz</p>
  <p class="login-reg">Akkountingiz yo'qmi? <a href="/register${nextQs}">Ro'yxatdan o'tish</a></p>
  <div class="login-admin"><span>Admin sifatida kirish?</span> <a href="/admin/login">Admin panel</a></div>
  </div>
  </section>`;
  send(res, 200, layout({ title: "Kirish", body }));
  return;
  }

  const next = safeNext(fields.next || url.searchParams.get("next"));

  // Phone and password are required for sign-in. Existing accounts may still have legacy passwords.
  if (url.searchParams.get("pw") !== "1") {
    return redirect(res, `/login?phone=${encodeURIComponent(formatLocalPhone(fields.phone))}${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  }

  const ip = clientIp(req);
  const lock = lockedFor(ip);
  if (lock) {
  send(res, 429, layout({ title: "Kutish", body: alertBox(`Juda ko'p urinish. ${lock} soniyadan keyin qayta urinib ko'ring.`) }));
  return;
  }

  const phone = normalizePhone(fields.phone);
  const password = String(fields.password || "");
  if (!validPhoneInput(fields.phone) || !validPhone(phone)) {
    return redirect(res, `/login?pw=1&err=phone&phone=${encodeURIComponent(formatLocalPhone(fields.phone))}${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  }
  const row = findUserByPhone(phone);

  if (row && Number(row.is_blocked)) return redirect(res, `/login?err=blocked&phone=${encodeURIComponent(formatLocalPhone(fields.phone))}${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  if (!row || !verifyPassword(password, row.pass)) {
  const failures = row ? Number(row.password_failures || 0) + 1 : 0;
  if (row) db.prepare("UPDATE users SET password_failures = ? WHERE id = ?").run(failures, row.id);
  noteFailure(ip);
  const body = authCard(
  "Kirish",
  "Telefon va parolingizni kiriting.",
  `${alertBox("Telefon yoki parol noto'g'ri.")}
  ${failures >= 5 ? `<p class="alt"><a href="/login/reset?phone=${encodeURIComponent(formatLocalPhone(phone))}">Parolni unutdingizmi? Parolni tiklash</a></p>` : ""}
  <form method="post" action="/login?pw=1${next ? `&next=${encodeURIComponent(next)}` : ""}" class="form">
  ${next ? `<input type="hidden" name="next" value="${h(next)}">`: ""}
  <input type="hidden" name="tg_init_data" value="">
  <div class="field"><label>Telefon</label><input name="phone" data-phone value="${h(fields.phone || "")}" required></div>
  <div class="field"><label>Parol</label><input name="password" type="password" required maxlength="64" autocomplete="current-password"></div>
  <button class="btn btn-primary" type="submit">Kirish</button>
  </form>`,
  `<p class="alt">Akkountingiz yo'qmi? <a href="/register${next ? `?next=${encodeURIComponent(next)}`: ""}">Ro'yxatdan o'tish</a></p>`,
  "/"
  );
  send(res, 401, layout({ title: "Kirish", body }));
  return;
  }

  if (hasDeviceLimitReached(row.id, req)) {
    return redirect(res, `/login?pw=1&err=device&phone=${encodeURIComponent(formatLocalPhone(fields.phone))}${next ? `&next=${encodeURIComponent(next)}` : ""}`);
  }

  db.prepare("UPDATE users SET password_failures = 0 WHERE id = ?").run(row.id);
  const tgUser = telegramUserFromInitData(fields.tg_init_data);
  if (tgUser && tgUser.id) {
  const telegramId = String(tgUser.id);
  if (row.telegram_id && String(row.telegram_id) !== telegramId) {
  send(
  res,
  403,
  layout({
  title: "Kirish",
  body: authCard(
  "Kirish",
  "Telegram ID mos kelmadi.",
  `${alertBox("Bu akkaunt boshqa Telegram ID ga bog'langan.")}<a class="btn btn-primary" href="/login">Qayta kirish</a>`
  )
  })
  );
  return;
  }
  if (!row.telegram_id) {
  const taken = db.prepare("SELECT 1 FROM users WHERE telegram_id = ? AND id != ?").get(telegramId, row.id);
  if (taken) {
  send(
  res,
  403,
  layout({
  title: "Kirish",
  body: authCard(
  "Kirish",
  "Telegram ID band.",
  `${alertBox("Bu Telegram ID boshqa akkauntga bog'langan. Bir ID   bitta akkaunt.")}<a class="btn btn-primary" href="/login">Qayta kirish</a>`
  )
  })
  );
  return;
  }
  db.prepare("UPDATE users SET telegram_id = ? WHERE id = ?").run(telegramId, row.id);
  row.telegram_id = telegramId;
  }
  }

  clearFailures(ip);
  createUserSession(res, row.id, req);
  createDeviceSession(res, row.id, req);
  redirect(res, next || "/dashboard");
  return;
  }

  if (p === "/logout" && method === "POST") {
  const token = parseCookies(req).ht_session;
  const deviceToken = parseCookies(req).ht_device;
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  if (deviceToken) db.prepare("DELETE FROM device_sessions WHERE token = ?").run(deviceToken);
  clearCookie(res, "ht_session");
  clearCookie(res, "ht_device");
  redirect(res, "/");
  return;
  }

  /* ------------------------------------------------------------ courses */
  if (p === "/courses" && method === "GET") return redirect(res, "/attestation");

  /* -------------------------------------------------------------- plans */
  if (p === "/plans/request" && method === "POST") {
  if (!user) return redirect(res, "/login?next=/plans");
  const plan = getPlans().find((item) => item.id === String(fields.plan_id || ""));
  if (!plan) return redirect(res, "/plans?err=plan");
  const info = db.prepare(
    "INSERT INTO payment_requests (user_id, plan_id, amount, status, created_at) VALUES (?, ?, ?, 'pending', ?)"
  ).run(user.id, plan.id, plan.price, nowISO());
  const requestId = Number(info.lastInsertRowid);
  await notifyTelegram(
    `<b>Yangi tarif/to'lov so'rovi #${requestId}</b>\nO'quvchi: <b>${h(user.name)}</b>\nTelefon: <code>${h(user.phone)}</code>\nTarif: <b>${h(plan.title)}</b>\nSumma: <b>${formatSum(plan.price)} so'm</b>\n\nTo'lovni tekshirish uchun o'quvchi yuborgan chek skrinshoti va tranzaksiya raqamini so'rang. Tasdiqlash: /admin/payments`,
    null,
    true
  );
  const target = config.telegram || "";
  const cardNumber = String(metaGet("payment_card_number", "") || "");
  const cardHolder = String(metaGet("payment_card_holder", "") || "");
  const cardDisplay = cardNumber.replace(/\D/g, "").replace(/(.{4})/g, "$1 ").trim();
  const cardBlock = cardNumber && cardHolder ? `<div class="card" style="margin:18px 0"><h2>To'lov uchun karta</h2><p><b>Karta raqami:</b> <code id="payCardNumber">${h(cardDisplay)}</code> <button class="btn btn-ghost btn-sm" type="button" data-copy="${h(cardNumber)}">Nusxalash</button></p><p><b>Karta egasi:</b> <span id="payCardHolder">${h(cardHolder)}</span> <button class="btn btn-ghost btn-sm" type="button" data-copy="${h(cardHolder)}">Nusxalash</button></p><small class="muted">To'lovdan so'ng chek skrinshotini adminga yuboring.</small></div>` : `<div class="card" style="margin:18px 0"><p>To'lov kartasi hozircha sozlanmagan. Admin bilan bog'laning.</p></div>`;
  const body = `<div class="card"><h1>So'rovingiz adminga yuborildi</h1><p>${h(plan.title)} uchun <b>${formatSum(plan.price)} so'm</b> to'lov qiling.</p>${cardBlock}<p class="muted small">Karta PIN-kodi, SMS tasdiqlash kodi va CVV raqamini hech kimga yubormang.</p>${target ? `<a class="btn btn-primary" href="${h(target)}" target="_blank" rel="noopener">Chekni adminga Telegramda yuborish</a>` : ""}<p class="muted small">So'rov raqami: #${requestId}. Admin to'lovni tekshirib, tarifni ochadi.</p></div><script>document.querySelectorAll('[data-copy]').forEach(function(b){b.addEventListener('click',async function(){var value=b.getAttribute('data-copy');try{await navigator.clipboard.writeText(value)}catch(e){var t=document.createElement('textarea');t.value=value;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove()}var old=b.textContent;b.textContent='Nusxalandi';setTimeout(function(){b.textContent=old},1500)})})</script>`;
  send(res, 200, layout({ title: "To'lov so'rovi", body, user, admin }));
  return;
  }

  if (p === "/plans" && method === "GET") {
  const plans = getPlans();
  const planCards = plans.map((plan, index) => `<article class="plan-card">
    ${index === 1 ? `<span class="plan-badge">Tavsiya etiladi</span>` : ""}
    <h2>${h(plan.title)}</h2><p class="muted">${h(plan.description)}</p>
    <div class="plan-price">${plan.price > 0 ? `<s>${formatSum(plan.price * 1.25)} so'm</s>` : ""}<b>${formatSum(plan.price)} so'm</b><span>/ ${Math.round(plan.days / 30)} oy</span>${plan.price > 0 ? `<em class="plan-discount">20% chegirma</em>` : ""}</div>
    <ul class="check-list"><li>Barcha kurslarga kirish</li><li>Video darslar va materiallar</li><li>Testlar va natijalar</li></ul>
    ${user ? `<form method="post" action="/plans/request"><input type="hidden" name="plan_id" value="${h(plan.id)}"><button class="btn btn-orange" type="submit">Sotib olish</button></form>` : `<a class="btn btn-orange" href="/login?next=/plans">Kirish va sotib olish</a>`}
  </article>`).join("");
  const body = `
  <section class="page-hero center">
  <h1>Tariflar</h1>
  <p class="lead">O'zingizga mos muddatni tanlang.</p>
  </section>
  <section class="section tight">
  <div class="wrap plans-wrap">
  ${url.searchParams.get("err") === "plan" ? alertBox("Tarif topilmadi. Qayta tanlang.", "error") : ""}
  ${url.searchParams.get("requested") === "1" ? alertBox("So'rov yuborildi. Admin to'lovni tekshiradi.", "success") : ""}
  <div class="plans-grid">${planCards}</div>
  <div class="card payment-help"><h2>To'lovdan keyin adminga nimalar yuboriladi?</h2><ol><li>To'lov chekining skrinshoti</li><li>Tranzaksiya ID yoki to'lov raqami</li><li>Ro'yxatdan o'tgan telefon raqamingiz</li><li>Tanlangan tarif nomi</li></ol><p class="muted small">Karta PIN-kodi, SMS tasdiqlash kodi yoki CVV raqamini yubormang. Admin to'lovni tekshirib, tarifni faollashtiradi.</p></div>
  <p class="muted small center">Savollar uchun: ${h(config.phone || "")}</p>
  </div>
  </section>`;
  send(res, 200, layout({ title: "Kurs va testlar tariflari", body, user, admin, seo: { path: "/plans", title: "Kurs va testlar tariflari | Habiba teacher", description: "Attestatsiya va TKT kurslari, onlayn testlar va o'quv materiallariga kirish tariflarini ko'ring.", keywords: "attestatsiya kursi, TKT kursi, o'qituvchilar uchun kurs narxi, attestatsiya testlari, TKT testlari" } }));
  return;
  }

  /* ---------------------------------------------------------- categories */
  if (["/attestation", "/tkt"].includes(p) && method === "GET") {
  const requestedCategory = p.slice(1);
  const cat = requestedCategory;
  const direction = DIRECTIONS.find((item) => item.id === cat) || DIRECTIONS[0];
  const directionTitle = categoryLabel(cat);
  const meta = cat === "attestation"
    ? { h1: "Ingliz tili attestatsiya testlari", title: "Attestatsiya testlari", lead: direction.description }
    : cat === "tkt"
      ? { h1: "TKT", title: "TKT testlari", lead: "Teaching Knowledge Test (TKT) uchun tayyorgarlik: imtihon uslubidagi modul sinov testlari." }
      : { h1: `${directionTitle} testlari`, title: `${directionTitle} testlari`, lead: direction.description };
  const queryCategories = directionCategories(cat);
  const categoryMarks = queryCategories.map(() => "?").join(", ");

  const courses = db
.prepare(
  `SELECT c.*, (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count
  FROM courses c WHERE c.category IN (${categoryMarks}) AND c.is_published = 1
  ORDER BY CASE WHEN ? = 'attestation' AND c.title = 'Toifa testlari' THEN 1 ELSE 0 END, c.id`
  )
.all(...queryCategories, cat);
  if (cat === "attestation") {
    courses.sort((a, b) => {
      const aPriority = ATTESTATION_GROUP_PRIORITY.get(normalizeAttestationGroupName(a.title)) ?? 99;
      const bPriority = ATTESTATION_GROUP_PRIORITY.get(normalizeAttestationGroupName(b.title)) ?? 99;
      return aPriority - bPriority || Number(a.id) - Number(b.id);
    });
  }

  const tests = db
.prepare(
  `SELECT l.*, c.title AS course_title,
  (SELECT COUNT(*) FROM questions q WHERE q.lesson_id = l.id) AS qcount
  FROM lessons l JOIN courses c ON c.id = l.course_id
  WHERE l.type = 'test' AND c.category IN (${categoryMarks}) AND c.is_published = 1
    AND (c.category <> 'tkt' OR EXISTS (SELECT 1 FROM questions q WHERE q.lesson_id = l.id))
    AND (? = 1 OR EXISTS (SELECT 1 FROM questions q WHERE q.lesson_id = l.id))
  ORDER BY l.course_id, l.position, l.id`
  )
  .all(...queryCategories, admin ? 1 : 0);

  const userHasPlan = !!user && hasPlanAccess(user.id);
  const sequence = user && !admin ? dashboardTestSequence(user.id) : null;
  const nextTest = sequence?.tests.find((test) => !sequence.completed.has(Number(test.id))) || null;
  const tktDemoCourseId = cat === "tkt"
    ? Number(courses.find((course) => /^TKT\s+MODULE\s+1$/i.test(String(course.title || "").trim()))?.id) || 0
    : 0;

  const byCourse = new Map();
  for (const test of tests) {
  if (!byCourse.has(test.course_id)) byCourse.set(test.course_id, []);
  byCourse.get(test.course_id).push(test);
  }

  const sections = courses
.map((course) => {
  const list = byCourse.get(course.id) || [];
  const isAttestationGroup = cat === "attestation" && (
    ATTESTATION_GROUP_PRIORITY.has(normalizeAttestationGroupName(course.title)) ||
    normalizeAttestationGroupName(course.title) === "toifa testlari"
  );
  if (!list.length && !admin && !isAttestationGroup) return "";
  const hasPaid = list.some((t) => Number(t.price) > 0);
  const addCard = admin
  ? `<a class="test-card test-add" href="/admin/course/${course.id}#new-lesson">
  <span class="test-add-plus">+</span>
  <b>Yangi test qo'shish</b>
  <small>${h(course.title)} guruhiga</small>
  </a>`
: "";
  const groupHasTests = list.length > 0;
  const groupHeader = isAttestationGroup
    ? `<summary class="test-group-head attestation-group-title${groupHasTests ? " has-tests" : ""}"><h2>${h(course.title)}</h2>${groupHasTests ? `<span class="attestation-group-marker" aria-hidden="true"></span>` : ""}</summary>`
    : `<div class="test-group-head"><div><h2>${h(course.title)}</h2></div></div>`;
  const firstTestIdInGroup = Number(list[0]?.id) || 0;
  return `<${isAttestationGroup ? "details" : "section"} class="test-group${isAttestationGroup ? ` attestation-test-group${groupHasTests ? " has-tests" : ""}` : ""}">
  ${groupHeader}
  ${
  hasPaid && list.length > 1
  ? `<div class="plan-banner">
  <div>
  <b>Bu testlarni birma-bir sotib olish shart emas</b>
  <p class="muted">Bitta tarif bilan barcha pullik testlarni oching   ancha tejamkor.</p>
  </div>
  <a class="btn btn-ghost btn-sm" href="/plans">Tarifni ko'rish   </a>
  </div>`
: ""
  }
  <div class="grid test-grid">${list.map((t) => {
    const isComplete = sequence?.completed.has(Number(t.id)) || false;
    const isFirstTestInGroup = (isAttestationGroup || (cat === "tkt" && Number(course.id) === tktDemoCourseId)) && Number(t.id) === firstTestIdInGroup;
    const locked = !!sequence && !isComplete && Number(t.id) !== Number(nextTest?.id) && !isFirstTestInGroup;
    return testCard(t, Number(t.price) > 0 && userHasPlan, locked, isFirstTestInGroup ? t.id : nextTest?.id);
  }).join("")}${addCard}</div>
  ${isAttestationGroup ? "</details>" : "</section>"}`;
  })
.filter(Boolean)
.join("");

  const body = `
  ${cat === "attestation" ? "" : `<section class="page-hero">
  <a class="back" href="/">  Barcha yo'nalishlar</a>
  <h1>${h(meta.h1)}</h1>
  <p class="lead">${h(meta.lead)}</p>
  </section>`}
  <section class="section tight">
  <div class="wrap">
  <div class="tests-head">
  <span class="eyebrow">O'qituvchlar uchun mock testlar</span>
  <h2>${h(meta.title)}</h2>
  </div>
  ${sections || `<div class="card empty">Bu yo'nalishda testlar tez orada qo'shiladi.</div>`}
  </div>
  </section>`;
  send(res, 200, layout({ title: meta.title, body, user, admin, seo: { path: p, title: `${meta.title} | Habiba teacher`, description: `${directionTitle} yo'nalishi bo'yicha onlayn testlar va tayyorlov kurslari.`, keywords: `${directionTitle} testlari, ${directionTitle} kursi, o'qituvchilar uchun tayyorlov` } }));
  return;
  }

  /* --------------------------------------------------------- leaderboard */
  if (p === "/leaderboard" && method === "GET") {
  const rows = db
.prepare(
  `SELECT u.id, u.name,
  (SELECT COUNT(*) FROM progress p WHERE p.user_id = u.id) AS done,
  COALESCE((SELECT ROUND(AVG(p.score)) FROM progress p WHERE p.user_id = u.id AND p.score IS NOT NULL), 0) AS avg
  FROM users u ORDER BY done DESC, avg DESC, u.id ASC LIMIT 50`
  )
.all();

  const list = rows.length
  ? rows
.map(
  (u, i) => `<tr>
  <td><span class="rank${i < 3 ? " rank-top": ""}">${i + 1}</span></td>
  <td><b>${h(u.name)}</b></td>
  <td>${u.done}</td>
  <td>${u.avg ? u.avg + "%": " "}</td>
  </tr>`
  )
.join("")
: `<tr><td colspan="4" class="muted">Hozircha natijalar yo'q.</td></tr>`;

  const body = `
  <section class="page-hero center">
  <span class="eyebrow">Reyting</span>
  <h1>Eng faol o'quvchilar</h1>
  <p class="lead">Tugatilgan darslar va o'rtacha test natijasi bo'yicha.</p>
  </section>
  <section class="section tight">
  <div class="wrap">
  <div class="card">
  <div class="table-wrap">
  <table>
  <thead><tr><th>#</th><th>O'quvchi</th><th>Tugatgan darslari</th><th>O'rtacha natija</th></tr></thead>
  <tbody>${list}</tbody>
  </table>
  </div>
  </div>
  </div>
  </section>`;
  send(res, 200, layout({ title: "Reyting", body, user, admin }));
  return;
  }

  /* --------------------------------------------------------------- duel */
  if (p === "/dashboard" && method === "GET") {
  if (!user) return redirect(res, "/login?next=/dashboard");
  const registeredCopy = siteTexts().dashboard_registered_notice;
  const registeredNotice = url.searchParams.get("registered") === "1" && registeredCopy
    ? alertBox(registeredCopy, "success")
    : "";
  send(res, 200, layout({ title: siteTexts().dashboard_page_title || "Kabinet", body: `${registeredNotice}${dashboardPage(user)}`, user }));
  return;
  }

  if (p === "/duel" && method === "GET") {
  send(res, 200, layout({ title: "Duel", body: duelDashboardPage(user, url.searchParams.get("err")), user, admin }));
  return;
  }

  if (p === "/duel/create" && method === "POST") {
  if (!user) return redirect(res, "/login?next=/duel");
  const picked = db.prepare("SELECT id, lesson_id FROM questions ORDER BY RANDOM() LIMIT 10").all();
  if (!picked.length) {
    redirect(res, "/duel?err=test");
    return;
  }
  const lessonId = picked[0].lesson_id;
  let code = duelCode();
  while (db.prepare("SELECT 1 FROM duels WHERE code = ?").get(code)) code = duelCode();
  const info = db
    .prepare(
      "INSERT INTO duels (code, lesson_id, creator_id, status, created_at, title) VALUES (?, ?, ?, 'waiting', ?, ?)"
    )
    .run(code, lessonId, user.id, nowISO(), "Aralash test · 10 savol");
  const duelId = Number(info.lastInsertRowid);
  const insertQ = db.prepare(
    "INSERT OR IGNORE INTO duel_questions (duel_id, question_id, position) VALUES (?, ?, ?)"
  );
  picked.forEach((q, i) => insertQ.run(duelId, q.id, i + 1));
  const botInviteLink = config.telegramBotToken ? duelBotStartLink(code) : "";
  if (botInviteLink) {
    redirect(res, botInviteLink);
  } else {
    redirect(res, duelTelegramShareUrl(code, user.name));
  }
  return;
  }

  if (p === "/duel/join" && method === "POST") {
  if (!user) return redirect(res, "/login?next=/duel");
  const code = String(fields.code || "")
.trim()
.toUpperCase()
.replace(/[^A-Z0-9]/g, "")
.slice(0, 6);
  const duel = getDuel(code);
  if (!duel) {
  redirect(res, "/duel?err=notfound");
  return;
  }
  if (duel.creator_id !== user.id && !duel.opponent_id && duel.status === "waiting") {
  db.prepare("UPDATE duels SET opponent_id = ?, status = 'active' WHERE id = ?").run(user.id, duel.id);
  for (const playerId of [duel.creator_id, user.id]) {
  sendUserMessage(
  playerId,
  `—  <b>Duel boshlandi</b>\nTest: ${h(duel.lesson_title)}\nKod: <b>${duel.code}</b>\n10 ta aralash savol. Har savolga 60 soniya.`,
  `/duel/${duel.code}`,
  "Duelni ochish"
  ).catch(() => {});
  }
  }
  redirect(res, `/duel/${duel.code}`);
  return;
  }

  if (p === "/duel/tournament" && method === "GET") {
  let groups = tournamentGroups();
  if (!groups.length) {
  ensureTournament();
  groups = tournamentGroups();
  }
  autoEnrollAll();
  groups = tournamentGroups();
  const requested = Number(url.searchParams.get("g"));
  const tournament =
  groups.find((g) => g.group_no === requested) ||
  groups
  .slice()
  .reverse()
  .find((g) => tournamentEntries(g.id).length > 0) ||
  groups[groups.length - 1];
  send(
  res,
  200,
  layout({
  title: "Kunlik duel",
  body: tournamentPage(tournament, user, admin, groups),
  user,
  admin
  })
  );
  return;
  }

  if (p === "/duel/tournament/join" && method === "POST") {
  if (!user) return redirect(res, "/login?next=/duel/tournament");
  const tournament = ensureJoinableTournament();
  const matches = tournamentMatches(tournament.id);
  const hasScores = matches.some((m) => m.s1 != null || m.s2 != null);
  const lateOpen = tournament.status === "open" || (tournament.status === "live" && !hasScores);
  if (!lateOpen) {
  redirect(res, "/duel/tournament?err=late");
  return;
  }
  const entries = tournamentEntries(tournament.id);
  if (!entries.some((e) => e.user_id === user.id) && entries.length < 128) {
  const wasLive = tournament.status === "live";
  if (wasLive) {
  db.prepare("UPDATE tournaments SET status = 'open', started_at = NULL WHERE id = ?").run(tournament.id);
  }
  db.prepare(
  "INSERT INTO tournament_entries (tournament_id, user_id, seed, joined_at) VALUES (?, ?, ?, ?)"
  ).run(tournament.id, user.id, entries.length + 1, nowISO());
  if (tournament.status === "open") {
  db.prepare("UPDATE tournaments SET size = ? WHERE id = ?").run(
  nextPowerOfTwo(entries.length + 1),
  tournament.id
  );
  }
  if (wasLive) startTournament(tournament.id);
  }
  redirect(res, `/duel/tournament?g=${tournament.group_no}`);
  return;
  }

  if (p === "/duel/tournament/start" && method === "POST") {
  if (!admin) return redirect(res, "/duel/tournament");
  const tournament = ensureTournament();
  startTournament(tournament.id);
  redirect(res, "/duel/tournament");
  return;
  }

  const tourMatch = p.match(/^\/duel\/tournament\/match\/(\d+)(\/submit)?$/);
  if (tourMatch) {
  if (!user) return redirect(res, `/login?next=${encodeURIComponent(p)}`);
  const match = db.prepare("SELECT * FROM tournament_matches WHERE id = ?").get(Number(tourMatch[1]));
  if (!match) return notFound(res, user, admin);
  const tournament = db.prepare("SELECT * FROM tournaments WHERE id = ?").get(match.tournament_id);
  if (!tournament) return notFound(res, user, admin);
  const isP1 = match.p1 === user.id;
  const isP2 = match.p2 === user.id;
  if (!isP1 && !isP2) {
  redirect(res, "/duel/tournament");
  return;
  }
  const already = isP1 ? match.s1: match.s2;
  if (already != null) {
  redirect(res, "/duel/tournament");
  return;
  }

  if (tourMatch[2] === "/submit" && method === "POST") {
  if (match.status !== "ready") {
  redirect(res, "/duel/tournament");
  return;
  }
  let questions = tournamentQuestions(tournament.id);
  if (!questions.length) {
    prepareTournamentQuestions(tournament.id);
    questions = tournamentQuestions(tournament.id);
  }
  let correct = 0;
  questions.forEach((q) => {
  if (String(fields[`q${q.id}`]) === String(q.correct)) correct += 1;
  });
  const total = Math.max(1, questions.length);
  const start = db
.prepare("SELECT started_at FROM tournament_starts WHERE match_id = ? AND user_id = ?")
.get(match.id, user.id);
  const elapsed = Math.min(
  1800000,
  Math.max(1000, Date.now() - (start ? Date.parse(start.started_at): Date.now()))
  );
  const fieldScore = isP1 ? "s1": "s2";
  const fieldTime = isP1 ? "t1": "t2";
  db.prepare(`UPDATE tournament_matches SET ${fieldScore} = ?, ${fieldTime} = ? WHERE id = ?`).run(
  correct,
  elapsed,
  match.id
  );
  db.prepare("DELETE FROM tournament_starts WHERE match_id = ? AND user_id = ?").run(match.id, user.id);
  const updated = db.prepare("SELECT * FROM tournament_matches WHERE id = ?").get(match.id);
  if (updated.s1 != null && updated.s2 != null) {
  const winner =
  updated.s1 > updated.s2
  ? updated.p1
: updated.s2 > updated.s1
  ? updated.p2
: updated.t1 <= updated.t2
  ? updated.p1
: updated.p2;
  db.prepare(
  "UPDATE tournament_matches SET winner = ?, status = 'finished', finished_at = ? WHERE id = ?"
  ).run(winner, nowISO(), match.id);
  propagateTournament(tournament.id);
  const winnerUser = db.prepare("SELECT name, telegram_username FROM users WHERE id = ?").get(winner);
  const winnerName = telegramPublicName(winnerUser?.name, winnerUser?.telegram_username, "?");
  notifyTelegram(
  `<b>Kunlik duel</b>\n${h(tournament.day)}. ${tournamentRoundName(
  tournament.size,
  match.round
  )}\nG'olib: <b>${h(winnerName)}</b> (${updated.s1}:${updated.s2})`
  ).catch(() => {});
  }
  redirect(res, "/duel/tournament");
  return;
  }

  if (method === "GET") {
  if (match.status !== "ready") {
  redirect(res, "/duel/tournament");
  return;
  }
  const start = db
.prepare("SELECT started_at FROM tournament_starts WHERE match_id = ? AND user_id = ?")
.get(match.id, user.id);
  const startMs = start ? Date.parse(start.started_at): 0;
  if (!start || Date.now() - startMs > 2 * 60 * 60 * 1000) {
  db.prepare(
  "INSERT INTO tournament_starts (match_id, user_id, started_at) VALUES (?, ?, ?) ON CONFLICT(match_id, user_id) DO UPDATE SET started_at = excluded.started_at"
  ).run(match.id, user.id, nowISO());
  }
  let questions = tournamentQuestions(tournament.id);
  if (!questions.length) {
    prepareTournamentQuestions(tournament.id);
    questions = tournamentQuestions(tournament.id);
  }
  if (!questions.length) {
  redirect(res, "/duel/tournament");
  return;
  }
  send(res, 200, tournamentMatchPage(match, tournament, questions, user));
  return;
  }
  }

  const duelMatch = p.match(/^\/duel\/([A-Z0-9]{6})(\/start|\/submit|\/delete|\/accept)?$/i);
  if (duelMatch) {
  if (!user) return redirect(res, `/login?next=${encodeURIComponent(p)}`);
  const code = duelMatch[1].toUpperCase();
  const duel = getDuel(code);
  if (!duel) return notFound(res, user, admin);
  const action = duelMatch[2];
  if (!action && method === "GET" && duel.status === "waiting" && !duel.opponent_id && duel.creator_id !== user.id) {
    const joined = db.prepare("UPDATE duels SET opponent_id = ?, status = 'active' WHERE id = ? AND status = 'waiting' AND opponent_id IS NULL")
      .run(user.id, duel.id).changes;
    if (joined) {
      for (const playerId of [duel.creator_id, user.id]) {
        sendUserMessage(playerId, `⚔️ <b>Duel boshlandi</b>\nRaqib: <b>${duelPlayerLabel(playerId === duel.creator_id ? user.id : duel.creator_id)}</b>\nTestga kirib boshlang.`, `/duel/${code}`, "Duelni ochish").catch(() => {});
      }
    }
    redirect(res, `/duel/${code}`);
    return;
  }
  const isCreator = duel.creator_id === user.id;
  const isOpponent = duel.opponent_id === user.id;
  const participant = isCreator || isOpponent;

  if (action === "/accept" && method === "POST") {
  if (isCreator || duel.status !== "waiting" || duel.opponent_id) {
  redirect(res, `/duel/${code}`);
  return;
  }
  const joined = db.prepare(
    "UPDATE duels SET opponent_id = ?, status = 'active' WHERE id = ? AND status = 'waiting' AND opponent_id IS NULL"
  ).run(user.id, duel.id).changes;
  if (!joined) {
  redirect(res, `/duel/${code}`);
  return;
  }
  for (const playerId of [duel.creator_id, user.id]) {
  sendUserMessage(
    playerId,
    `⚔️ <b>Duel boshlandi</b>\nRaqib: <b>${duelPlayerLabel(playerId === duel.creator_id ? user.id : duel.creator_id)}</b>\nKod: <b>${code}</b>\nTestga kirib boshlang.`,
    `/duel/${code}`,
    "Duelni ochish"
  ).catch(() => {});
  }
  redirect(res, `/duel/${code}`);
  return;
  }

  if (action === "/delete" && method === "POST") {
  if (!isCreator || duel.status !== "waiting") {
  redirect(res, `/duel/${code}`);
  return;
  }
  db.prepare("DELETE FROM duel_plays WHERE duel_id = ?").run(duel.id);
  db.prepare("DELETE FROM duel_starts WHERE duel_id = ?").run(duel.id);
  db.prepare("DELETE FROM duels WHERE id = ?").run(duel.id);
  redirect(res, "/duel");
  return;
  }

  if (action === "/start" && method === "GET") {
  if (!participant) {
  send(res, 200, layout({ title: "Duel", body: duelRoomPage(duel, user), user }));
  return;
  }
  if (duel.status === "waiting" || duel.status === "finished") {
  redirect(res, `/duel/${code}`);
  return;
  }
  if (db.prepare("SELECT 1 FROM duel_plays WHERE duel_id = ? AND user_id = ?").get(duel.id, user.id)) {
  redirect(res, `/duel/${code}`);
  return;
  }
  const start = db
.prepare("SELECT started_at FROM duel_starts WHERE duel_id = ? AND user_id = ?")
.get(duel.id, user.id);
  const startMs = start ? Date.parse(start.started_at): 0;
  if (!start || Date.now() - startMs > 2 * 60 * 60 * 1000) {
  db.prepare(
  "INSERT INTO duel_starts (duel_id, user_id, started_at) VALUES (?, ?, ?) ON CONFLICT(duel_id, user_id) DO UPDATE SET started_at = excluded.started_at"
  ).run(duel.id, user.id, nowISO());
  }
  const lesson = db.prepare("SELECT * FROM lessons WHERE id = ?").get(duel.lesson_id);
  let questions = db
    .prepare(
      "SELECT q.* FROM duel_questions dq JOIN questions q ON q.id = dq.question_id WHERE dq.duel_id = ? ORDER BY dq.position"
    )
    .all(duel.id);
  if (!questions.length) {
    questions = db.prepare("SELECT * FROM questions WHERE lesson_id = ? ORDER BY RANDOM() LIMIT 10").all(duel.lesson_id);
  }
  if (!lesson || !questions.length) {
  redirect(res, `/duel/${code}`);
  return;
  }
  send(res, 200, duelPlayPage(duel, lesson, questions));
  return;
  }

  if (action === "/submit" && method === "POST") {
  if (!participant || duel.status !== "active") {
  redirect(res, `/duel/${code}`);
  return;
  }
  if (db.prepare("SELECT 1 FROM duel_plays WHERE duel_id = ? AND user_id = ?").get(duel.id, user.id)) {
  redirect(res, `/duel/${code}`);
  return;
  }
  let allQuestions = db
    .prepare(
      "SELECT q.* FROM duel_questions dq JOIN questions q ON q.id = dq.question_id WHERE dq.duel_id = ? ORDER BY dq.position"
    )
    .all(duel.id);
  if (!allQuestions.length) {
    allQuestions = db.prepare("SELECT * FROM questions WHERE lesson_id = ?").all(duel.lesson_id);
  }
  let correct = 0;
  allQuestions.forEach((q) => {
  if (String(fields[`q${q.id}`]) === String(q.correct)) correct += 1;
  });
  const total = Math.max(1, allQuestions.length);
  const start = db
.prepare("SELECT started_at FROM duel_starts WHERE duel_id = ? AND user_id = ?")
.get(duel.id, user.id);
  const elapsed = Math.min(
  3600000,
  Math.max(1000, Date.now() - (start ? Date.parse(start.started_at): Date.now()))
  );
  db.prepare(
  "INSERT INTO duel_plays (duel_id, user_id, score, correct, total, elapsed_ms, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(duel.id, user.id, Math.round((correct / total) * 100), correct, total, elapsed, nowISO());
  db.prepare("DELETE FROM duel_starts WHERE duel_id = ? AND user_id = ?").run(duel.id, user.id);

  const plays = duelPlays(duel.id);
  if (duel.opponent_id && plays[duel.creator_id] && plays[duel.opponent_id]) {
  db.prepare("UPDATE duels SET status = 'finished', finished_at = ? WHERE id = ?").run(nowISO(), duel.id);
  const creatorPlay = plays[duel.creator_id];
  const opponentPlay = plays[duel.opponent_id];
  const creatorName = duelPlayerLabel(duel.creator_id);
  const opponentName = duelPlayerLabel(duel.opponent_id);
  notifyTelegram(
  `<b>Duel yakunlandi</b>\n${creatorName}: ${creatorPlay.correct}/${creatorPlay.total} (${Math.round(
  creatorPlay.elapsed_ms / 1000
  )}s)\n${opponentName}: ${opponentPlay.correct}/${opponentPlay.total} (${Math.round(
  opponentPlay.elapsed_ms / 1000
  )}s)`
  ).catch(() => {});
  const verdictFor = (own, other) =>
  own.correct > other.correct
  ? "G'alaba!"
  : own.correct < other.correct
  ? "Mag'lubiyat"
  : own.elapsed_ms <= other.elapsed_ms
  ? "G'alaba!"
  : "Mag'lubiyat";
  for (const [playerId, own, other] of [
  [duel.creator_id, creatorPlay, opponentPlay],
  [duel.opponent_id, opponentPlay, creatorPlay]
  ]) {
  sendUserMessage(
  playerId,
  `<b>Duel yakunlandi</b>\nNatija: <b>${verdictFor(own, other)}</b>\nSiz: ${own.correct}/${own.total}\nRaqib: ${other.correct}/${other.total}`,
  `/duel/${duel.code}`,
  "Natijani ko'rish"
  ).catch(() => {});
  }
  }
  redirect(res, `/duel/${code}`);
  return;
  }

  if (method === "GET") {
  send(res, 200, layout({ title: "Duel", body: duelRoomPage(duel, user), user }));
  return;
  }
  }

  const courseMatch = p.match(/^\/course\/(\d+)$/);
  if (courseMatch && method === "GET") {
  if (!user) return redirect(res, "/login");
  const course = db.prepare("SELECT * FROM courses WHERE id = ?").get(Number(courseMatch[1]));
  if (!course) return notFound(res, user, admin);

  db.prepare("INSERT OR IGNORE INTO enrollments (user_id, course_id, created_at) VALUES (?, ?, ?)").run(
  user.id,
  course.id,
  nowISO()
  );

  const lessons = db
.prepare("SELECT * FROM lessons WHERE course_id = ? ORDER BY position, id")
.all(course.id);
  const visibleLessons = lessons.filter((lesson, index) => {
    if (admin || (lesson.type === "video" && (isIntroVideoLesson(lesson.id) || hasLessonPermission(user.id, lesson.id))) ||
        (lesson.type === "test" && Number(lesson.price) === 0) || hasLessonPermission(user.id, lesson.id)) {
      const previous = lessons[index - 1];
      if (!admin && lesson.type === "test" && previous?.type === "video" && !isIntroVideoLesson(previous.id) && !hasLessonPermission(user.id, previous.id)) return false;
      return true;
    }
    return false;
  });
  const progress = Object.fromEntries(
  db
.prepare("SELECT lesson_id, score FROM progress WHERE user_id = ?")
.all(user.id)
.map((r) => [r.lesson_id, r.score])
  );
  const courseTests = lessons.filter((lesson) => lesson.type === "test");
  const isCourseTestComplete = (lesson) => {
    if (!Object.prototype.hasOwnProperty.call(progress, lesson.id)) return false;
    return progress[lesson.id] !== null && Number(progress[lesson.id]) >= testPassPercent(course.category);
  };
  const nextCourseTest = courseTests.find((lesson) => !isCourseTestComplete(lesson));
  const { total, done } = courseProgress(user.id, course.id);

  const rows = visibleLessons.length
  ? visibleLessons
.map((l, i) => {
  const hasProgress = Object.prototype.hasOwnProperty.call(progress, l.id);
  const finished = hasProgress && (l.type !== "test" || (progress[l.id] !== null && Number(progress[l.id]) >= testPassPercent(course.category)));
  const sequenceLocked = !admin && l.type === "test" && !finished && nextCourseTest && Number(l.id) !== Number(nextCourseTest.id);
  const firstVideoGate = l.type === "video" && !admin && !isIntroVideoLesson(l.id) && !hasLessonPermission(user.id, l.id) ? { locked: true } : { locked: false };
  const rowTag = sequenceLocked ? "div" : "a";
  return `<${rowTag} class="lesson-row${sequenceLocked ? " is-locked" : ""}"${sequenceLocked ? ' aria-disabled="true"' : ` href="/lesson/${l.id}"`}>
  <span class="num">${i + 1}</span>
  <span class="lesson-main">
  <b>${h(l.title)}</b>
  <small>${TYPE_LABEL[l.type] || h(l.type)}${
  l.type === "test" ? ". test": ""
  }</small>
  </span>
  ${sequenceLocked ? `<span class="badge locked">🔒 Qulflangan</span>` : finished ? `<span class="badge done">Tugatilgan${typeof progress[l.id] === "number" ? `. ${progress[l.id]}%`: ""}</span>`: `<span class="badge">${firstVideoGate.locked ? "Tarif kerak" : l.type === "video" && isIntroVideoLesson(l.id) ? "Bepul ochiq" : l.type === "video" && !hasLessonPermission(user.id, l.id) ? "Tarif kerak" : "Ochish"}</span>`}
  </${rowTag}>`;
  })
.join("")
: `<div class="card empty">${lessons.length ? `Darslarni ko'rish uchun <a href="/plans"><b>faol tarif</b></a> yoki admin bergan ruxsat kerak.` : "Bu kursda hozircha darslar yo'q."}</div>`;

  const body = `
  <a class="back" href="/admin">Admin panel</a>
  <div class="page-head">
  <div><h1>${h(course.title)}</h1><p class="muted">${h(course.description || "")}</p></div>
  </div>
  ${visibleLessons.length === lessons.length ? `<div class="card">${progressBar(done, total)}</div>` : ""}
  <div class="lesson-list">${rows}</div>`;
  send(res, 200, layout({ title: course.title, body, user, admin }));
  return;
  }

  /* --------------------------------------------------------------- test */
  const testMatch = p.match(/^\/test\/(\d+)(\/submit)?$/);
  if (testMatch && (method === "GET" || method === "POST")) {
  const lesson = db.prepare("SELECT * FROM lessons WHERE id = ?").get(Number(testMatch[1]));
  if (!lesson || lesson.type !== "test") return notFound(res, user, admin);
  if (user && !admin) {
    const sequence = dashboardTestSequence(user.id);
    const currentIndex = sequence.tests.findIndex((item) => Number(item.id) === Number(lesson.id));
    if (currentIndex < 0) return redirect(res, "/dashboard");
    const isFirstCategoryTest = isFirstAttestationCategoryTest(sequence.tests[currentIndex], sequence.tests) || isFirstCourseTest(sequence.tests[currentIndex], sequence.tests);
    const currentTest = sequence.tests[currentIndex];
    const unmetCourseTest = sequence.tests.slice(0, currentIndex).filter((item) => Number(item.course_id) === Number(currentTest.course_id)).find((item) => {
      const result = db.prepare("SELECT score FROM progress WHERE user_id = ? AND lesson_id = ?").get(user.id, item.id);
      return !result || result.score === null || Number(result.score) < testPassPercent(currentTest.course_category);
    });
    if (unmetCourseTest) return redirect(res, `/test/${unmetCourseTest.id}?start=1`);
    const unmetPrevious = !isFirstCategoryTest && currentIndex > 0 ? sequence.tests.slice(0, currentIndex).find((item) => !sequence.completed.has(Number(item.id))) : null;
    if (unmetPrevious) return redirect(res, `/test/${unmetPrevious.id}`);
  }

  const isSubmit = testMatch[2] === "/submit";
  const isStart = url.searchParams.get("start") === "1";
  const price = Number(lesson.price) || 0;
  const owned = !!admin || (!!user && (price === 0 || testOwned(user.id, lesson.id)));
  const startHref = `/test/${lesson.id}?start=1`;

  if (method === "GET" && !isSubmit && !isStart && !url.searchParams.has("result")) {
  db.prepare("UPDATE lessons SET views = views + 1 WHERE id = ?").run(lesson.id);
  }

  const previousLesson = db.prepare("SELECT id, type FROM lessons WHERE course_id = ? AND (position < ? OR (position = ? AND id < ?)) ORDER BY position DESC, id DESC LIMIT 1")
    .get(lesson.course_id, lesson.position, lesson.position, lesson.id);
  const videoFollowup = !!(previousLesson && previousLesson.type === "video");
  if (videoFollowup && !admin && (!isIntroVideoLesson(previousLesson.id) && (!user || !hasLessonPermission(user.id, previousLesson.id)))) return redirect(res, "/plans");
  let questions = db
.prepare("SELECT * FROM questions WHERE lesson_id = ? ORDER BY id")
.all(lesson.id);
  let attempt = null;
  if (isSubmit && user) {
    attempt = db.prepare("SELECT * FROM test_attempts WHERE id = ? AND user_id = ? AND lesson_id = ? AND score IS NULL")
      .get(Number(fields.attempt_id) || 0, user.id, lesson.id);
    if (!attempt) return redirect(res, startHref);
    let ids = [];
    try { ids = JSON.parse(attempt.question_ids); } catch (e) {}
    const found = ids.length ? db.prepare(`SELECT * FROM questions WHERE lesson_id = ? AND id IN (${ids.map(() => "?").join(",")})`).all(lesson.id, ...ids) : [];
    const byId = new Map(found.map((q) => [q.id, q]));
    questions = ids.map((id) => byId.get(Number(id))).filter(Boolean);
    if (!questions.length || questions.length !== ids.length || (videoFollowup && questions.length !== 20)) return redirect(res, startHref);
  }

  if (isSubmit && method === "POST") {
  if (!user) return redirect(res, `/login?next=${encodeURIComponent(startHref)}`);
  if (!owned) return redirect(res, `/test/${lesson.id}`);
  let answers = {};
  for (const q of questions) answers[`q${q.id}`] = String(fields[`q${q.id}`] || "");

  let correct = 0;
  questions.forEach((q) => {
  if (String(fields[`q${q.id}`]) === String(q.correct)) correct += 1;
  });
  const score = questions.length ? Math.round((correct / questions.length) * 100): 0;
  const completedAt = nowISO();
  db.prepare("UPDATE test_attempts SET answers_json = ?, score = ?, completed_at = ? WHERE id = ? AND user_id = ?")
    .run(JSON.stringify(answers), score, completedAt, attempt.id, user.id);
  db.prepare(
  `INSERT INTO progress (user_id, lesson_id, score, completed_at) VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id, lesson_id) DO UPDATE SET score = excluded.score, completed_at = excluded.completed_at`
  ).run(user.id, lesson.id, score, completedAt);

  const maxScore = Number(lesson.max_score) || 0;
  const shown = maxScore > 0 ? `${Math.round((score / 100) * maxScore)} / ${maxScore}`: `${score}%`;
  notifyTelegram(
  `<b>Test yakunlandi</b>\n${telegramPublicName(user.name, user.telegram_username)}\n${h(
  lesson.title
  )}\nNatija: <b>${score}%</b> (${shown})\n${new Date().toLocaleString("uz-UZ")}`
  ).catch(() => {});

  redirect(res, `/test/${lesson.id}?result=${score}&attempt=${attempt.id}`);
  return;
  }

  if (isStart) {
  if (!user) return redirect(res, `/login?next=${encodeURIComponent(startHref)}`);
  if (!owned) {
  redirect(res, `/test/${lesson.id}`);
  return;
  }
  if (videoFollowup && previousLesson && !db.prepare("SELECT 1 FROM progress WHERE user_id = ? AND lesson_id = ? AND score IS NULL").get(user.id, previousLesson.id)) {
    return redirect(res, `/lesson/${previousLesson.id}`);
  }
  if (!questions.length) {
  send(
  res,
  200,
  layout({
  title: lesson.title,
  body: `<a class="back" href="${moduleHref(lesson)}">  Testlar</a><div class="card empty"><h2>Test savollari hali qo'shilmagan</h2><p class="muted">Administrator tez orada savollarni qo'shadi.</p></div>`,
  user
  })
  );
  return;
  }
  if (videoFollowup && questions.length < 20) {
    send(res, 200, layout({ title: lesson.title, body: `<div class="card empty"><h2>20 ta test savoli kerak</h2><p>Bu video darsga biriktirilgan testda hozir ${questions.length} ta savol bor. Admin panelida kamida 20 ta savol qo'shilgach test ochiladi.</p><a class="btn btn-ghost" href="/lesson/${previousLesson.id}">Videoga qaytish</a></div>`, user, admin }));
    return;
  }
  const chosenQuestions = videoFollowup
    ? db.prepare("SELECT * FROM questions WHERE lesson_id = ? ORDER BY RANDOM() LIMIT 20").all(lesson.id)
    : questions;
  const attemptInfo = db.prepare("INSERT INTO test_attempts (user_id, lesson_id, question_ids, created_at) VALUES (?, ?, ?, ?)")
    .run(user.id, lesson.id, JSON.stringify(chosenQuestions.map((q) => q.id)), nowISO());
  questions = chosenQuestions;
  const result = url.searchParams.get("result");
  if (result !== null) {
  const score = Math.max(0, Math.min(100, Number(result) || 0));
  send(res, 200, testPage(lesson, questions, [], Number(attemptInfo.lastInsertRowid)));
  } else {
  const testSections = db
.prepare("SELECT * FROM test_sections WHERE lesson_id = ? ORDER BY position, id")
.all(lesson.id);
  send(res, 200, testPage(lesson, questions, testSections, Number(attemptInfo.lastInsertRowid)));
  }
  return;
  }

  if (url.searchParams.has("result") && user && owned && questions.length) {
  const score = Math.max(0, Math.min(100, Number(url.searchParams.get("result")) || 0));
  const resultAttempt = db.prepare("SELECT * FROM test_attempts WHERE id = ? AND user_id = ? AND lesson_id = ? AND score IS NOT NULL")
    .get(Number(url.searchParams.get("attempt")) || 0, user.id, lesson.id);
  let resultQuestions = questions, answers = {};
  if (resultAttempt) {
    try {
      const ids = JSON.parse(resultAttempt.question_ids);
      const found = db.prepare(`SELECT * FROM questions WHERE lesson_id = ? AND id IN (${ids.map(() => "?").join(",")})`).all(lesson.id, ...ids);
      const byId = new Map(found.map((q) => [q.id, q]));
      resultQuestions = ids.map((id) => byId.get(Number(id))).filter(Boolean);
      answers = JSON.parse(resultAttempt.answers_json || "{}");
    } catch (e) {}
  }
  send(res, 200, testResultPage(lesson, resultQuestions, score, answers));
  return;
  }

  send(res, 200, layout({ title: lesson.title, body: testLanding(lesson, { user, admin, owned }), user, admin }));
  return;
  }

  /* ------------------------------------------------------------- lesson */
  const viewersMatch = p.match(/^\/lesson\/(\d+)\/viewers$/);
  if (viewersMatch && method === "POST") {
  if (!user) {
  res.writeHead(401, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ ok: false }));
  return;
  }
  const viewerLesson = db.prepare("SELECT id, type, price FROM lessons WHERE id = ?").get(Number(viewersMatch[1]));
  const viewerKey = String(req.headers["x-viewer-key"] || "");
  if (!viewerLesson || viewerLesson.type !== "video" || !/^[a-f0-9-]{32,64}$/i.test(viewerKey)) {
  res.writeHead(404, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ ok: false }));
  return;
  }
  const now = Date.now();
  db.prepare("INSERT INTO lesson_viewers (lesson_id, viewer_key, last_seen) VALUES (?, ?, ?) ON CONFLICT(lesson_id, viewer_key) DO UPDATE SET last_seen = excluded.last_seen").run(viewerLesson.id, viewerKey, now);
  const count = db.prepare("SELECT COUNT(*) AS n FROM lesson_viewers WHERE lesson_id = ? AND last_seen >= ?").get(viewerLesson.id, now - 45_000).n;
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ ok: true, count }));
  return;
  }

  const watchMatch = p.match(/^\/lesson\/(\d+)\/watch$/);
  if (watchMatch && method === "POST") {
  if (!user) {
  res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: false, login: true }));
  return;
  }
  const watchedLesson = db.prepare("SELECT * FROM lessons WHERE id = ?").get(Number(watchMatch[1]));
  if (!watchedLesson || watchedLesson.type !== "video") {
  res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: false }));
  return;
  }
  if (!admin && !isIntroVideoLesson(watchedLesson.id) && !hasLessonPermission(user.id, watchedLesson.id)) {
    res.writeHead(423, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ ok: false, locked: true, reason: "plan" }));
    return;
  }
  const seconds = Math.max(0, Math.min(24 * 3600, Number(fields.seconds) || 0));
  const duration = Math.max(0, Math.min(24 * 3600, Number(fields.duration) || 0));
  const now = Date.now();
  const stamp = nowISO();
  const currentWatch = db.prepare("SELECT max_seconds, updated_at, is_playing FROM video_watch WHERE user_id = ? AND lesson_id = ?")
    .get(user.id, watchedLesson.id);
  const lessonAlreadyCompleted = !!db.prepare("SELECT 1 FROM progress WHERE user_id = ? AND lesson_id = ? AND score IS NULL")
    .get(user.id, watchedLesson.id);
  const lastUpdate = currentWatch ? Date.parse(currentWatch.updated_at) : NaN;
  const elapsedPlaying = currentWatch && Number(currentWatch.is_playing) && Number.isFinite(lastUpdate)
    ? Math.max(0, Math.min(15, (now - lastUpdate) / 1000))
    : 0;
  const previousMax = Number(currentWatch && currentWatch.max_seconds) || 0;
  const previewOnly = !hasLessonPermission(user.id, watchedLesson.id) && !isIntroVideoLesson(watchedLesson.id);
  const trackedSeconds = lessonAlreadyCompleted
    ? seconds
    : Math.min(seconds, previousMax + elapsedPlaying * 2.05);
  const previewLimit = duration > 0 ? duration * 0.4 : 0;
  const acceptedSeconds = previewOnly && previewLimit > 0
    ? Math.min(trackedSeconds, previewLimit)
    : trackedSeconds;
  const locked = previewOnly && previewLimit > 0 && acceptedSeconds >= previewLimit - 0.25;
  const isPlaying = fields.playing === "1" && !locked ? 1 : 0;
  db.prepare(
  `INSERT INTO video_watch (user_id, lesson_id, max_seconds, duration, updated_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(user_id, lesson_id) DO UPDATE SET
  max_seconds = MAX(video_watch.max_seconds, excluded.max_seconds),
  duration = CASE WHEN excluded.duration > 0 THEN excluded.duration ELSE video_watch.duration END,
  updated_at = excluded.updated_at,
  is_playing = ?`
  ).run(user.id, watchedLesson.id, acceptedSeconds, duration, stamp, isPlaying);
  const saved = db.prepare("SELECT max_seconds, duration FROM video_watch WHERE user_id = ? AND lesson_id = ?").get(user.id, watchedLesson.id);
  const pct = saved && saved.duration > 0 ? Math.min(100, Math.round((saved.max_seconds / saved.duration) * 100)) : 0;
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ ok: true, pct, seconds: Number(saved && saved.max_seconds) || 0, limited: acceptedSeconds + 0.25 < seconds, locked }));
  return;
  }

  const lessonMatch = p.match(/^\/lesson\/(\d+)(\/complete|\/submit)?$/);
  if (lessonMatch && (method === "GET" || method === "POST")) {
  if (!user) return redirect(res, "/login");
  const lesson = db.prepare("SELECT * FROM lessons WHERE id = ?").get(Number(lessonMatch[1]));
  if (!lesson) return notFound(res, user, admin);
  if (!admin && lesson.type === "test") {
    const sequence = dashboardTestSequence(user.id);
    const index = sequence.tests.findIndex((item) => Number(item.id) === Number(lesson.id));
    if (index < 0) return redirect(res, "/dashboard");
    const isFirstCategoryTest = isFirstAttestationCategoryTest(sequence.tests[index], sequence.tests);
    const unmet = isFirstCategoryTest ? null : sequence.tests.slice(0, index).find((item) => !sequence.completed.has(Number(item.id)));
    if (unmet) return redirect(res, `/test/${unmet.id}`);
  }
  if (!admin && lesson.type !== "test" && lesson.type !== "video" && !hasLessonPermission(user.id, lesson.id)) return redirect(res, "/plans");
  if (!admin && lesson.type === "video" && !isIntroVideoLesson(lesson.id) && !hasLessonPermission(user.id, lesson.id)) return redirect(res, "/plans");
  const videoPreviewOnly = lesson.type === "video" && !admin && !hasLessonPermission(user.id, lesson.id) && !isIntroVideoLesson(lesson.id);
  if (!admin && lesson.type === "test" && Number(lesson.price) > 0 && !testOwned(user.id, lesson.id)) return redirect(res, `/test/${lesson.id}`);
  if (!admin) {
    const previous = db.prepare("SELECT id, type FROM lessons WHERE course_id = ? AND (position < ? OR (position = ? AND id < ?)) ORDER BY position DESC, id DESC LIMIT 1")
      .get(lesson.course_id, lesson.position, lesson.position, lesson.id);
    if (previous && previous.type === "test") {
      const result = db.prepare("SELECT score FROM progress WHERE user_id = ? AND lesson_id = ?").get(user.id, previous.id);
      const courseCategory = db.prepare("SELECT category FROM courses WHERE id = ?").get(lesson.course_id)?.category;
      const previousComplete = result && result.score !== null && Number(result.score) >= testPassPercent(courseCategory);
      if (!previousComplete) return redirect(res, `/test/${previous.id}?start=1`);
    }
  }
  if (lesson.type === "test" && !lessonMatch[2]) {
  redirect(res, `/test/${lesson.id}`);
  return;
  }
  const course = db.prepare("SELECT * FROM courses WHERE id = ?").get(lesson.course_id);
  const action = lessonMatch[2];

  if (action === "/complete" && method === "POST") {
  if (lesson.type === "video" && !admin) {
  const watched = db
  .prepare("SELECT max_seconds, duration FROM video_watch WHERE user_id = ? AND lesson_id = ?")
  .get(user.id, lesson.id);
  const watchDuration = Number(watched && watched.duration) || 0;
  const watchMax = Number(watched && watched.max_seconds) || 0;
  if (!watched || !watchDuration || watchMax < watchDuration * 0.9) {
  if (String(req.headers.accept || "").includes("application/json")) {
  res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: false, error: "watch" }));
  return;
  }
  redirect(res, `/lesson/${lesson.id}?err=watch`);
  return;
  }
  }
  db.prepare(
  `INSERT INTO progress (user_id, lesson_id, score, completed_at) VALUES (?, ?, NULL, ?)
  ON CONFLICT(user_id, lesson_id) DO UPDATE SET completed_at = excluded.completed_at`
  ).run(user.id, lesson.id, nowISO());
  if (String(req.headers.accept || "").includes("application/json")) {
  const nextRow = db
  .prepare(
  "SELECT id, type FROM lessons WHERE course_id = ? AND (position > ? OR (position = ? AND id > ?)) ORDER BY position, id LIMIT 1"
  )
  .get(lesson.course_id, lesson.position, lesson.position, lesson.id);
  const nextUrl = nextRow
  ? nextRow.type === "test"
  ? `/test/${nextRow.id}`
  : `/lesson/${nextRow.id}`
  : `/course/${lesson.course_id}`;
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ ok: true, next: nextUrl }));
  return;
  }
  redirect(res, `/lesson/${lesson.id}`);
  return;
  }

  if (action === "/submit" && method === "POST") {
  const questions = db.prepare("SELECT * FROM questions WHERE lesson_id = ? ORDER BY id").all(lesson.id);
  const answers = {};
  questions.forEach((q) => { answers[`q${q.id}`] = String(fields[`q${q.id}`] || ""); });
  let correct = 0;
  questions.forEach((q) => {
  if (String(fields[`q${q.id}`]) === String(q.correct)) correct += 1;
  });
  const score = questions.length ? Math.round((correct / questions.length) * 100): 0;
  const attemptInfo = db.prepare("INSERT INTO test_attempts (user_id, lesson_id, question_ids, answers_json, score, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(user.id, lesson.id, JSON.stringify(questions.map((q) => q.id)), JSON.stringify(answers), score, nowISO(), nowISO());
  db.prepare(
  `INSERT INTO progress (user_id, lesson_id, score, completed_at) VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id, lesson_id) DO UPDATE SET score = excluded.score, completed_at = excluded.completed_at`
  ).run(user.id, lesson.id, score, nowISO());
  redirect(res, `/lesson/${lesson.id}?result=${score}&attempt=${Number(attemptInfo.lastInsertRowid)}`);
  return;
  }

  const progressRow = db
    .prepare("SELECT score FROM progress WHERE user_id = ? AND lesson_id = ?")
    .get(user.id, lesson.id);
  const result = url.searchParams.get("result");
  let lessonReviewHtml = "";
  if (result !== null && lesson.type === "test") {
    const resultAttempt = db.prepare("SELECT * FROM test_attempts WHERE id = ? AND user_id = ? AND lesson_id = ? AND score IS NOT NULL")
      .get(Number(url.searchParams.get("attempt")) || 0, user.id, lesson.id);
    if (resultAttempt) {
      try {
        const ids = JSON.parse(resultAttempt.question_ids || "[]");
        const found = ids.length ? db.prepare(`SELECT * FROM questions WHERE lesson_id = ? AND id IN (${ids.map(() => "?").join(",")})`).all(lesson.id, ...ids) : [];
        const byId = new Map(found.map((q) => [q.id, q]));
        const resultQuestions = ids.map((id) => byId.get(Number(id))).filter(Boolean);
        const answers = JSON.parse(resultAttempt.answers_json || "{}");
        const mistakes = resultQuestions.filter((q) => String(answers[`q${q.id}`] || "") !== String(q.correct));
        lessonReviewHtml = `<section class="answer-review"><h2>Xatolarni ko'rib chiqing</h2>${mistakes.length ? mistakes.map((q) => `<article class="answer-mistake"><b>${h(q.text)}</b><p class="wrong-answer">Sizning javobingiz: ${h(q[`o${Number(answers[`q${q.id}`])}`] || "Javob berilmadi")}</p><p class="right-answer">To'g'ri javob: ${h(q[`o${q.correct}`])}</p>${q.passage ? `<details><summary>Matnni ko'rish</summary><p>${nl2br(q.passage)}</p></details>` : ""}</article>`).join("") : `<p class="muted">Xato javob yo'q — a'lo!</p>`}</section>`;
      } catch (e) {}
    }
  }
  const completed = !!progressRow;
  const lessonList = db
    .prepare("SELECT id, title, type, position FROM lessons WHERE course_id = ? ORDER BY position, id")
    .all(lesson.course_id);
  const lessonIndex = lessonList.findIndex((l) => l.id === lesson.id);
  const lessonNo = lessonIndex >= 0 ? lessonIndex + 1 : 1;
  const immediateNextLesson = lessonIndex >= 0 ? lessonList[lessonIndex + 1] || null : null;
  const relatedTest =
    lesson.type === "video"
      ? db
          .prepare(
            "SELECT id, title FROM lessons WHERE course_id = ? AND type = 'test' AND (position > ? OR (position = ? AND id > ?)) ORDER BY position, id LIMIT 1"
          )
          .get(course.id, lesson.position, lesson.position, lesson.id)
      : null;
  const testQuestionCount = relatedTest
    ? db.prepare("SELECT COUNT(*) AS n FROM questions WHERE lesson_id = ?").get(relatedTest.id).n
    : 0;
  const testProgress = relatedTest
    ? db.prepare("SELECT score FROM progress WHERE user_id = ? AND lesson_id = ?").get(user.id, relatedTest.id)
    : null;
  const testDone = !!(testProgress && Number(testProgress.score) >= testPassPercent(course.category));
  // A video lesson's first following test is its checkpoint. Once passed,
  // the next-lesson control must advance beyond that test instead of reopening it.
  const relatedTestIndex = relatedTest ? lessonList.findIndex((item) => item.id === relatedTest.id) : -1;
  const nextLesson =
    lesson.type === "video" && testDone && relatedTestIndex >= 0
      ? lessonList[relatedTestIndex + 1] || null
      : immediateNextLesson;
  const nextHref = nextLesson
    ? nextLesson.type === "test"
      ? `/test/${nextLesson.id}`
      : `/lesson/${nextLesson.id}`
    : `/course/${course.id}`;
  const hasTestStep = !!relatedTest;
  const stepsTotal = hasTestStep ? 3 : 2;
  const stepsDone =
    (completed ? 1 : 0) +
    (hasTestStep && testDone ? 1 : 0) +
    (completed && (!hasTestStep || testDone) && nextLesson ? 1 : 0);
  const materials = db.prepare("SELECT * FROM materials WHERE lesson_id = ? ORDER BY id").all(lesson.id);
  const views = Number(lesson.views) || 0;

  let contentHtml = "";
  let videoFile = false;
  if (lesson.type === "text") {
    contentHtml = `<div class="prose">${renderLessonMarkdown(lesson.content || "")}</div>`;
  } else if (lesson.type === "pdf") {
    contentHtml = `
      <div class="pdf-actions">
        <a class="btn btn-primary" href="/files/${lesson.id}" target="_blank" rel="noopener">PDF ochish</a>
        <a class="btn btn-ghost" href="/files/${lesson.id}?download=1">Yuklab olish</a>
      </div>
      <iframe class="pdf-frame" src="/files/${lesson.id}" title="PDF"></iframe>`;
  } else if (lesson.type === "video") {
    videoFile = !!lesson.file_id;
    contentHtml = lesson.file_id
      ? `<video class="lesson-video" id="lessonVideo" controls preload="metadata" controlsList="nodownload" disablePictureInPicture oncontextmenu="return false" src="/media/${lesson.id}?t=${mediaToken(
          lesson.id,
          user ? user.id : 0
        )}"></video>`
      : lesson.video_url
      ? videoEmbed(lesson.video_url, "lessonVideo")
      : `<div class="card empty">Video yuklanmagan yoki havola qo'shilmagan.</div>`;
  } else if (lesson.type === "test") {
    const questions = db.prepare("SELECT * FROM questions WHERE lesson_id = ?").all(lesson.id);
    if (!questions.length) {
      contentHtml = `<div class="card empty">Test savollari hali qo'shilmagan.</div>`;
    } else {
      contentHtml = `<form method="post" action="/lesson/${lesson.id}/submit" class="test-form">
        ${questions
          .map(
            (q, i) => `<fieldset class="question">
              <legend>${i + 1}. ${h(q.text)}</legend>
              ${[1, 2, 3, 4]
                .map(
                  (n) => `<label class="opt"><input type="radio" name="q${q.id}" value="${n}" required> <span>${h(
                    q["o" + n]
                  )}</span></label>`
                )
                .join("")}
            </fieldset>`
          )
          .join("")}
        <button class="btn btn-primary" type="submit">Testni yakunlash</button>
      </form>`;
    }
  }

  const resultHtml =
    url.searchParams.get("err") === "watch"
      ? alertBox("Avval videoni to'liq ko'ring — keyin dars tugaydi.", "error")
      : result !== null
      ? `${alertBox(`Test yakunlandi: ${result}% to'g'ri javob.`, Number(result) >= testPassPercent(course.category) ? "success" : "error")}${lessonReviewHtml}`
      : progressRow && lesson.type === "test"
      ? alertBox(
          `Bu testni tugatgansiz${progressRow.score != null ? ` | natija: ${progressRow.score}%` : ""}.`,
          "success"
        )
      : "";

  const stepOneTitle =
    lesson.type === "video" ? "Videoni ko'ring" : lesson.type === "pdf" ? "PDF bilan tanishing" : "Darsni o'qing";
  const savedWatch = lesson.type === "video"
    ? db.prepare("SELECT max_seconds, duration FROM video_watch WHERE user_id = ? AND lesson_id = ?").get(user.id, lesson.id)
    : null;
  if (lesson.type === "video" && !completed) {
    db.prepare(`INSERT INTO video_watch (user_id, lesson_id, max_seconds, duration, updated_at, is_playing)
      VALUES (?, ?, 0, 0, ?, 0) ON CONFLICT(user_id, lesson_id) DO NOTHING`)
      .run(user.id, lesson.id, nowISO());
  }
  const savedWatchDuration = Number(savedWatch && savedWatch.duration) || 0;
  const savedWatchSeconds = Number(savedWatch && savedWatch.max_seconds) || 0;
  const savedWatchPercent = savedWatchDuration > 0
    ? Math.min(100, Math.round((savedWatchSeconds / savedWatchDuration) * 100))
    : 0;
  const stepOnePercent = lesson.type === "video" ? (completed ? 100 : savedWatchPercent) : 0;
  const stepOneNote = lesson.type === "video"
    ? `${completed ? 100 : savedWatchPercent}% ko'rildi`
    : completed ? "Tugatildi" : "Tugatilmagan";
  const progressPercent = Math.round((stepsDone / stepsTotal) * 100);
  const canNext = completed && (!hasTestStep || testDone);
  const testStepClass = !completed ? "locked" : testDone ? "done" : "active";
  const testStepIcon = testDone ? "&#10003;" : completed ? "2" : "&#128274;";
  const testStepNote = testDone
    ? "O'tildi"
    : completed
    ? `${testQuestionCount} ta savol | o'tish balli 80%`
    : "Video tugagach ochiladi";
  const nextStepNote = !completed
    ? "Dars tugagach ochiladi"
    : hasTestStep && !testDone
    ? "Testdan o'tgach ochiladi"
    : "Ochiladi";

  const videoHead =
    lesson.type === "video"
      ? `<div class="lvc-head">
          <span class="lvc-title"><span class="lvc-ico"><svg viewBox="0 0 24 24"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/></svg></span> Video dars</span>
          <span class="lvc-meta"><span id="lessonViewerCount" class="lesson-viewer-count"><i></i> 1 ta talaba ko'rmoqda</span></span>
        </div>`
      : "";

  const completeBlock =
    !completed && lesson.type !== "test"
      ? (videoFile || lesson.type === "video")
      ? `<button class="btn btn-primary dash-next" type="button" id="completeLesson" data-lesson="${lesson.id}">Darsni tugatdim</button>`
        : `<form method="post" action="/lesson/${lesson.id}/complete" class="js-complete" data-lesson="${lesson.id}">
            <button class="btn btn-primary" type="submit">Darsni tugatdim</button>
          </form>`
      : "";

  const nextBlock = nextLesson
    ? canNext
      ? `<a class="dash-next-link" href="${nextHref}">Keyingi darsga o'tish &rarr;</a>`
      : hasTestStep && completed && !testDone
      ? `<a class="dash-next-link" href="/test/${relatedTest.id}">Testdan o'tish &rarr;</a>`
      : `<span class="dash-next-locked"><span class="lock-ico">&#128274;</span> ${nextStepNote}</span>`
    : `<a class="dash-next-link" href="/course/${course.id}">Kursga qaytish &rarr;</a>`;

  const relatedTestQuestions = relatedTest
    ? db.prepare("SELECT * FROM questions WHERE lesson_id = ? ORDER BY id").all(relatedTest.id)
    : [];
  const relatedTestPanel = relatedTest
    ? `<section class="card lesson-inline-test ${completed ? "is-unlocked" : "is-locked"}" id="lessonInlineTest">
        <div class="card-head"><h2>${h(relatedTest.title || "Dars testi")}</h2><span class="muted small">${testDone ? `Natija: ${testProgress.score}%` : completed ? `${relatedTestQuestions.length} ta savol` : "Video tugagach ochiladi"}</span></div>
        ${!completed ? `<p class="muted small">Dars bosqichlari tugagach, shu yerning o'zida test ishlaysiz.</p>` : testDone ? `<p class="muted">Test muvaffaqiyatli topshirildi.</p>` : relatedTestQuestions.length ? `<form method="post" action="/lesson/${relatedTest.id}/submit" class="test-form">
          ${relatedTestQuestions.map((q, i) => `<fieldset class="question"><legend>${i + 1}. ${h(q.text)}</legend>${[1,2,3,4].map((n) => `<label class="opt"><input type="radio" name="q${q.id}" value="${n}" required> <span>${h(q["o" + n])}</span></label>`).join("")}</fieldset>`).join("")}
          <button class="btn btn-primary" type="submit">Testni yakunlash</button>
        </form>` : `<p class="muted">Test savollari hali qo'shilmagan.</p><a class="btn btn-sm" href="/test/${relatedTest.id}">Testni ochish</a>`}
      </section>`
    : lesson.type === "video" ? `<section class="card lesson-inline-test"><div class="card-head"><h2>Dars testi</h2></div><p class="muted small">Bu dars uchun test hali qo'shilmagan.</p></section>` : "";

  const materialsHtml = materials.length
    ? `<div class="lesson-materials">${materials
        .map(
          (m) =>
            `<a class="lesson-material" href="/materials/${m.id}" ${
              m.type === "link" ? 'target="_blank" rel="noopener"' : ""
            }>
              <span class="lm-ico">${m.type === "file" ? "PDF" : m.type === "link" ? "LINK" : "TXT"}</span>
              <span class="lm-copy"><b>${h(m.title)}</b><small>${h(m.type)}</small></span>
              <span class="lm-go">&rarr;</span>
            </a>`
        )
        .join("")}</div>`
    : `<div class="card empty lesson-empty-materials"><span class="empty-ico">&#128196;</span><p class="muted">Materiallar hali qo'shilmagan</p></div>`;
  const readerContent = lesson.type === "video"
    ? String(lesson.content || "").trim() ? `<div class="prose">${renderLessonMarkdown(lesson.content)}</div>` : `<p class="muted">Bu dars uchun matnli qo'llanma qo'shilmagan.</p>`
    : lesson.type === "text" || lesson.type === "pdf" ? contentHtml : "";

  const body = `
    <a class="back" href="/course/${course.id}">&larr; ${h(course.title)}</a>
    <div class="lesson-head">
      <div class="lesson-badges">
        <span class="badge">${lessonNo}-dars</span>
        ${
          lesson.type === "video"
            ? `<span class="badge ghost">${TYPE_LABEL[lesson.type] || lesson.type}</span>`
            : `<span class="badge ghost">${TYPE_LABEL[lesson.type] || lesson.type}</span>`
        }
        ${completed ? `<span class="badge done">Tugatildi</span>` : ""}
      </div>
      <h1>${h(lesson.title)}</h1>
    </div>
    ${resultHtml}
    <div class="lesson-grid${lesson.type === "video" ? " video-lesson-layout" : ""}">
      <div class="lesson-main">
        <div class="video-reading-layout">
        <div class="lesson-video-card">
          ${videoHead}
          ${lesson.type === "video" || lesson.type === "test" ? contentHtml : ""}
          ${videoPreviewOnly ? `<div class="video-plan-lock" id="videoPlanLock" ${savedWatchDuration > 0 && savedWatchSeconds >= savedWatchDuration * 0.4 - 0.25 ? "" : "hidden"}><div class="video-plan-lock-card"><span class="video-plan-lock-icon">&#128274;</span><p class="video-plan-kicker">Bepul ko'rish chegarasi</p><h2>Videoning 40% qismi tugadi</h2><p>Siz tarif sotib olmagansiz. Davom ettirishni istasangiz, to'lovni amalga oshiring.</p><a class="btn btn-primary" href="/plans">Tarifni tanlash va to'lov</a></div></div>` : ""}
          ${lesson.type === "video" ? `<label class="video-speed-control" for="videoSpeed">Video tezligi <select id="videoSpeed"><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label>` : ""}
          ${
            lesson.type === "video"
              ? `<details class="video-help"><summary>Video ochilmayaptimi?</summary><ol class="muted small"><li>Sahifani yangilang.</li><li>Telegram yoki Instagram ichidagi brauzerdan emas, Chrome yoki Safari'da oching (pastdagi “...” → “Brauzerda ochish”).</li><li>Brauzerda “Kuzatuvni bloklash” yoki reklama blokerni shu sayt uchun o‘chiring.</li><li>Manzil <b>habibateacher.uz</b> ekaniga ishonch hosil qiling.</li><li>Yordam bo‘lmasa, kurator yoki qo‘llab-quvvatlashga yozing.</li></ol></details>`
              : ""
          }
        </div>
        </div>
        <div class="card lesson-materials-card">
          <div class="card-head"><h2>Dars materiallari</h2></div>
          ${readerContent ? `<section class="lesson-reader"><div class="lesson-reader-head"><span class="lm-ico">${icon("book")}</span><h3>Darslik</h3></div><div class="lesson-reader-body">${readerContent}</div></section>` : ""}
          ${materials.length ? materialsHtml : readerContent ? "" : materialsHtml}
        </div>
      </div>
      <aside class="lesson-side">
        <div class="card lesson-steps">
          <div class="card-head"><h2>Dars bosqichlari</h2><span class="muted small">${stepsDone}/${stepsTotal}</span></div>
          <div class="lesson-progress"><span style="width:${progressPercent}%"></span></div>
          <div class="lesson-step ${completed ? "done" : ""}">
            <span class="ls-ico">${completed ? "&#10003;" : "1"}</span>
          <span class="ls-copy" ${lesson.type === "video" ? 'style="flex:1"' : ""}><b>${stepOneTitle}</b><small id="lessonWatchPercent">${stepOneNote}</small>${lesson.type === "video" ? `<i class="video-watch-meter"><b id="lessonWatchBar" style="width:${stepOnePercent}%"></b></i>` : ""}</span>
          </div>
          ${
            hasTestStep
              ? `<div class="lesson-step ${testStepClass}">
                  <span class="ls-ico">${testStepIcon}</span>
                  <span class="ls-copy"><b>Testdan o'ting</b><small>${testStepNote}</small></span>
                </div>${
                  !completed
                    ? '<p class="muted small step-note">Test video oxirigacha ko\'rilgach ochiladi.</p>'
                    : ""
                }`
              : ""
          }
          <div class="lesson-step ${canNext ? "done" : "locked"}">
            <span class="ls-ico">${canNext ? "&#10003;" : "&#128274;"}</span>
            <span class="ls-copy"><b>Keyingi dars</b><small>${nextStepNote}</small></span>
          </div>
          ${completeBlock}
          ${nextBlock}
        </div>
        ${relatedTestPanel}
        <a class="card discuss-card" href="${h(config.telegram || "#")}" target="_blank" rel="noopener">
          <span class="dc-ico"><svg viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 20l1-4.1A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z"/></svg></span>
          <span class="dc-copy"><b>Muhokama guruhi</b><small>Savollaringizga Telegram guruhda javob oling</small></span>
          <span class="dc-go">&#8599;</span>
        </a>
      </aside>
    </div>
    ${
      lesson.type === "video" && (videoFile || lesson.video_url)
        ? `<script>
      (function () {
        var v = document.getElementById('lessonVideo');
        var ytNode = document.getElementById('lessonYoutube');
        var player = null, playerState = -1;
        var btn = document.getElementById('completeLesson');
        var note = document.getElementById('lessonWatchPercent');
        var watchBar = document.getElementById('lessonWatchBar');
        var viewerCount = document.getElementById('lessonViewerCount');
        var planLock = document.getElementById('videoPlanLock');
        var lessonId = ${lesson.id};
        var sent = false, videoEnded = ${completed ? "true" : "false"}, correctingSeek = false, maxWatched = ${savedWatchSeconds}, duration = ${savedWatchDuration}, lastSync = 0;
        var alreadyCompleted = ${completed ? "true" : "false"};
        var needsPlan = ${videoPreviewOnly ? "true" : "false"};
        var planLocked = needsPlan && duration > 0 && maxWatched >= duration * 0.4 - 0.25;
        function lockForPlan() {
          if (!needsPlan || alreadyCompleted) return;
          planLocked = true;
          if (v) v.pause();
          if (player && player.pauseVideo) player.pauseVideo();
          if (planLock) planLock.hidden = false;
        }
        function checkPlanLimit(currentTime) {
          if (!needsPlan || alreadyCompleted || !duration || currentTime < duration * 0.4) return false;
          var limit = duration * 0.4;
          maxWatched = limit;
          correctingSeek = true;
          if (v) { v.pause(); v.currentTime = limit; }
          if (player && player.pauseVideo) { player.pauseVideo(); player.seekTo(limit, true); }
          sync(true, false).then(lockForPlan);
          setTimeout(function () { correctingSeek = false; }, 500);
          return true;
        }
        var viewerKey = '';
        try {
          viewerKey = localStorage.getItem('ht_viewer_key') || '';
          if (!/^[a-f0-9-]{32,64}$/i.test(viewerKey)) {
            viewerKey = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(16) + '-' + Math.random().toString(16).slice(2) + '-' + Math.random().toString(16).slice(2));
            localStorage.setItem('ht_viewer_key', viewerKey);
          }
        } catch (e) { viewerKey = Date.now().toString(16) + '-' + Math.random().toString(16).slice(2) + '-' + Math.random().toString(16).slice(2); }
        function updateViewerCount() {
          if (!viewerCount || document.visibilityState === 'hidden') return;
          fetch('/lesson/' + lessonId + '/viewers', { method: 'POST', headers: { 'X-Viewer-Key': viewerKey, Accept: 'application/json' } })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) { if (d && d.ok) viewerCount.innerHTML = '<i></i> ' + d.count + ' ta talaba ko\\'rmoqda'; })
            .catch(function () {});
        }
        updateViewerCount();
        setInterval(updateViewerCount, 15000);
        document.addEventListener('visibilitychange', updateViewerCount);
        function percent() { return duration > 0 ? Math.min(100, Math.round((maxWatched / duration) * 100)) : 0; }
          function paint() {
          var p = alreadyCompleted ? 100 : percent();
          if (note) note.textContent = p + "% ko'rildi";
          if (watchBar) watchBar.style.width = p + "%";
          if (btn) {
            btn.disabled = !videoEnded;
            btn.textContent = videoEnded ? 'Darsni tugatdim' : 'Video tugagach faollashadi';
          }
        }
        function sync(force, playing) {
          if (!duration || (!force && Date.now() - lastSync < 8000)) return;
          lastSync = Date.now();
          var body = new URLSearchParams();
          body.set('seconds', maxWatched.toFixed(1));
          body.set('duration', duration.toFixed(1));
          body.set('playing', playing ? '1' : '0');
          return fetch('/lesson/' + lessonId + '/watch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
            body: body.toString()
          }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
            if (!d || !d.ok) return;
            if (d.locked) { maxWatched = Math.min(Number(d.seconds) || maxWatched, duration * 0.4); lockForPlan(); paint(); return; }
            if (!alreadyCompleted && Number(d.seconds) + 0.35 < maxWatched) {
              maxWatched = Number(d.seconds) || 0;
              if (v && Math.abs(v.currentTime - maxWatched) > 0.5) { correctingSeek = true; v.pause(); v.currentTime = maxWatched; setTimeout(function () { correctingSeek = false; }, 500); }
              if (player && player.seekTo && Math.abs((Number(player.getCurrentTime()) || 0) - maxWatched) > 0.5) { correctingSeek = true; player.pauseVideo(); player.seekTo(maxWatched, true); setTimeout(function () { correctingSeek = false; }, 500); }
              paint();
            }
          }).catch(function () {});
        }
        function finish() {
          if (sent) return;
          if (!videoEnded) return;
          sent = true;
          if (duration > 0) {
            maxWatched = duration;
            if (v && Math.abs(v.currentTime - duration) > 0.5) v.currentTime = duration;
            if (player && player.seekTo) player.seekTo(duration, true);
            paint();
          }
          Promise.resolve(sync(true, false)).then(function () {
          return fetch('/lesson/' + lessonId + '/complete', { method: 'POST', headers: { Accept: 'application/json' } });
          })
            .then(function (r) { return r.json(); })
            .then(function (d) {
              if (!d || !d.ok) {
                sent = false;
                alert(document.documentElement.lang==='en'?'Please watch the entire video to complete it.':'Video to'liq ko'rilmagan. Iltimos, oxirigacha ko'ring.');
                return;
              }
              location.reload();
            })
            .catch(function () { sent = false; });
        }
        if (v) {
          v.addEventListener('loadedmetadata', function () {
            duration = Number(v.duration) || 0;
            if (duration > 0) {
              maxWatched = alreadyCompleted ? duration : Math.min(maxWatched, duration);
              v.currentTime = maxWatched;
              if (needsPlan && maxWatched >= duration * 0.4 - 0.25) lockForPlan();
            }
            paint();
          });
          v.addEventListener('timeupdate', function () {
            if (checkPlanLimit(v.currentTime)) return;
            if (v.currentTime > maxWatched) maxWatched = v.currentTime;
            paint();
            sync(false, !v.paused && !v.ended);
          });
          v.addEventListener('play', function () { if (planLocked) { v.pause(); return; } sync(true, true); });
          v.addEventListener('pause', function () { sync(true, false); });
          v.addEventListener('seeking', function () {
            if (alreadyCompleted || correctingSeek || v.currentTime <= maxWatched + 0.25) return;
            correctingSeek = true;
            v.pause();
            v.currentTime = maxWatched;
          });
          v.addEventListener('seeked', function () { correctingSeek = false; });
          v.addEventListener('ended', function () { videoEnded = true; maxWatched = duration || v.currentTime; paint(); finish(); });
          v.addEventListener('contextmenu', function (e) { e.preventDefault(); });
          v.setAttribute('controlsList', 'nodownload');
          var speed = document.getElementById('videoSpeed');
          if (speed) speed.addEventListener('change', function () { v.playbackRate = Number(speed.value) || 1; });
        }
        if (ytNode) {
          window.onYouTubeIframeAPIReady = function () {
            player = new YT.Player('lessonYoutube', { videoId: ytNode.getAttribute('data-video-id'), playerVars: { controls: 1, disablekb: 1, playsinline: 1, rel: 0 }, events: {
              onReady: function (event) {
                duration = Number(event.target.getDuration()) || 0;
                if (duration > 0) {
                  maxWatched = alreadyCompleted ? duration : Math.min(maxWatched, duration);
                  event.target.seekTo(maxWatched, true);
                  if (needsPlan && maxWatched >= duration * 0.4 - 0.25) lockForPlan();
                }
                paint();
              },
              onStateChange: function (event) {
                playerState = event.data;
                sync(true, event.data === 1);
                if (event.data === 0) { videoEnded = true; maxWatched = duration || maxWatched; paint(); finish(); }
              }
            }});
            var speed = document.getElementById('videoSpeed');
            if (speed) speed.addEventListener('change', function () { if (player && player.setPlaybackRate) player.setPlaybackRate(Number(speed.value) || 1); });
          };
          var api = document.createElement('script'); api.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(api);
          setInterval(function () {
            if (!player) return;
            duration = Number(player.getDuration()) || duration;
            var current = Number(player.getCurrentTime()) || 0;
            if (planLocked) { player.pauseVideo(); return; }
            if (checkPlanLimit(current)) return;
            if (!alreadyCompleted && !correctingSeek && current > maxWatched + 0.25) {
              correctingSeek = true;
              player.pauseVideo();
              player.seekTo(maxWatched, true);
              setTimeout(function () { correctingSeek = false; }, 500);
              return;
            }
            if (playerState !== 1) return;
            maxWatched = Math.max(maxWatched, current); paint(); sync(false);
          }, 1000);
        }
        if (btn) { btn.disabled = true; btn.textContent = 'Video tugagach faollashadi'; btn.addEventListener('click', finish); }
      })();
      </script>`
        : ""
    }`;

  send(res, 200, layout({ title: lesson.title, body, user }));
  return;
  }


  /* -------------------------------------------------------- pdf serving */
  const mediaMatch = p.match(/^\/media\/(\d+)$/);
  if (mediaMatch && method === "GET") {
  if (!user && !admin) return redirect(res, "/login");
  const mediaLessonId = Number(mediaMatch[1]);
  const viewerId = user ? user.id : 0;
  if (!mediaTokenValid(mediaLessonId, viewerId, url.searchParams.get("t"))) {
  res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Video faqat platforma ichida ko'riladi.");
  return;
  }
  const lesson = db.prepare("SELECT * FROM lessons WHERE id = ?").get(mediaLessonId);
  if (!lesson || lesson.type !== "video" || !lesson.file_id) return notFound(res, user, admin);
  if (!admin && !isIntroVideoLesson(lesson.id) && !hasLessonPermission(user.id, lesson.id)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end("Bu videoni ko'rish uchun faol tarif kerak.");
    return;
  }
  const previewOnly = !admin && !hasLessonPermission(user.id, lesson.id) && !isIntroVideoLesson(lesson.id);
  if (previewOnly) {
    const watched = db.prepare("SELECT max_seconds, duration FROM video_watch WHERE user_id = ? AND lesson_id = ?").get(user.id, lesson.id);
    if (watched && Number(watched.duration) > 0 && Number(watched.max_seconds) >= Number(watched.duration) * 0.4 - 0.25) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
      res.end("Bepul video ko'rish chegarasi tugadi. Davom ettirish uchun tarifni tanlang.");
      return;
    }
  }
  const videoPath = path.join(STORAGE_DIR, lesson.file_id);
  if (!fs.existsSync(videoPath)) return notFound(res, user, admin);
  const stat = fs.statSync(videoPath);
  const ext = path.extname(lesson.file_id).toLowerCase();
  const types = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".mkv": "video/x-matroska"
  };
  const contentType = types[ext] || "application/octet-stream";
  const range = req.headers.range;
  if (range) {
  const match = /bytes=(\d*)-(\d*)/.exec(range);
  let start = match && match[1] ? Number(match[1]): 0;
  let end = match && match[2] ? Number(match[2]): stat.size - 1;
  if (start >= stat.size) {
  res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
  res.end();
  return;
  }
  end = Math.min(end, stat.size - 1);
  res.writeHead(206, {
  "Content-Type": contentType,
  "Content-Range": `bytes ${start}-${end}/${stat.size}`,
  "Accept-Ranges": "bytes",
  "Content-Length": end - start + 1,
  "Cache-Control": "private, max-age=600"
  });
  fs.createReadStream(videoPath, { start, end }).pipe(res);
  return;
  }
  res.writeHead(200, {
  "Content-Type": contentType,
  "Content-Length": stat.size,
  "Accept-Ranges": "bytes",
  "Cache-Control": "private, max-age=600"
  });
  fs.createReadStream(videoPath).pipe(res);
  return;
  }

  const fileMatch = p.match(/^\/files\/(\d+)$/);
  if (fileMatch && method === "GET") {
  if (!user && !admin) return redirect(res, "/login");
  const lesson = db.prepare("SELECT * FROM lessons WHERE id = ?").get(Number(fileMatch[1]));
  if (!lesson || lesson.type !== "pdf" || !lesson.file_id) return notFound(res, user, admin);
  if (!admin && !hasLessonPermission(user.id, lesson.id)) { redirect(res, "/plans"); return; }
  if (!admin && Number(lesson.price) > 0 && !testOwned(user.id, lesson.id)) {
  redirect(res, `/test/${lesson.id}`);
  return;
  }

  const filePath = path.join(STORAGE_DIR, lesson.file_id);
  if (!fs.existsSync(filePath)) return notFound(res, user, admin);

  const download = url.searchParams.get("download") === "1";
  res.writeHead(200, {
  "Content-Type": "application/pdf",
  "Content-Length": fs.statSync(filePath).size,
  "Content-Disposition": `${download ? "attachment": "inline"}; filename*=UTF-8''${encodeURIComponent(
  lesson.file_name || "darslik.pdf"
  )}`,
  "Cache-Control": "private, max-age=600"
  });
  fs.createReadStream(filePath).pipe(res);
  return;
  }

  /* ------------------------------------------------------- materials */
  const materialMatch = p.match(/^\/materials\/(\d+)$/);
  if (materialMatch && method === "GET") {
  if (!user && !admin) return redirect(res, `/login?next=${encodeURIComponent(p)}`);
  const material = db
.prepare(
  `SELECT m.*, l.price AS lesson_price, l.id AS parent_lesson_id
  FROM materials m JOIN lessons l ON l.id = m.lesson_id
  WHERE m.id = ?`
  )
.get(Number(materialMatch[1]));
  if (!material) return notFound(res, user, admin);
  if (!admin && !hasLessonPermission(user.id, material.parent_lesson_id)) { redirect(res, "/plans"); return; }
  if (!admin && Number(material.lesson_price) > 0 && !testOwned(user.id, material.lesson_id)) {
  redirect(res, `/test/${material.lesson_id}`);
  return;
  }
  if (material.type === "link") {
  redirect(res, material.url);
  return;
  }
  if (material.type === "text") {
  const body = `
  <a class="back" href="/test/${material.lesson_id}">  Test</a>
  <div class="page-head"><div><h1>${h(material.title)}</h1><p class="muted">Material</p></div></div>
  <div class="card"><div class="prose">${nl2br(material.body || "")}</div></div>`;
  send(res, 200, layout({ title: material.title, body, user, admin }));
  return;
  }
  const filePath = path.join(STORAGE_DIR, material.file_id);
  if (!material.file_id || !fs.existsSync(filePath)) return notFound(res, user, admin);
  res.writeHead(200, {
  "Content-Type": "application/pdf",
  "Content-Length": fs.statSync(filePath).size,
  "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(material.file_name || "material.pdf")}`,
  "Cache-Control": "private, max-age=600"
  });
  fs.createReadStream(filePath).pipe(res);
  return;
  }

  /* --------------------------------------------------------------- admin */
  if (p === "/admin/login") {
  if (admin) return redirect(res, "/admin");

  if (method === "GET") {
  const body = authCard(
  "Admin kirish",
  "Platformani boshqarish uchun parolni kiriting.",
  `<form method="post" action="/admin/login" class="form">
  <div class="field"><label>Parol</label><input name="password" type="password" required autofocus></div>
  <button class="btn btn-primary" type="submit">Kirish</button>
  </form>`
  );
  send(res, 200, layout({ title: "Admin kirish", body }));
  return;
  }

  const ip = clientIp(req);
  const lock = lockedFor(ip);
  if (lock) {
  send(res, 429, layout({ title: "Kutish", body: alertBox(`Juda ko'p urinish. ${lock} soniya kuting.`) }));
  return;
  }

  const passwordInput = String(fields.password || "");
  const storedAdminHash = metaGet("admin_password_hash", "");
  let authorized = false;
  if (storedAdminHash) {
  authorized = verifyPassword(passwordInput, storedAdminHash);
  } else if (config.adminPassword && safeEqual(passwordInput, config.adminPassword)) {
  authorized = true;
  } else {
  authorized = verifyPassword(passwordInput, DEFAULT_ADMIN_PASSWORD_HASH);
  }

  if (!authorized) {
  noteFailure(ip);
  const body = authCard(
  "Admin kirish",
  "Parol noto'g'ri.",
  `${alertBox("Parol noto'g'ri.")}
  <form method="post" action="/admin/login" class="form">
  <div class="field"><label>Parol</label><input name="password" type="password" required autofocus></div>
  <button class="btn btn-primary" type="submit">Kirish</button>
  </form>`
  );
  send(res, 401, layout({ title: "Admin kirish", body }));
  return;
  }

  clearFailures(ip);
  createAdminSession(res, req);
  redirect(res, "/admin");
  return;
  }

  if (p === "/admin/logout" && method === "POST") {
  const token = parseCookies(req).ht_admin;
  if (token) db.prepare("DELETE FROM admin_sessions WHERE token = ?").run(token);
  clearCookie(res, "ht_admin");
  redirect(res, "/admin/login");
  return;
  }

  if (p === "/admin/password") {
  if (!admin) return redirect(res, "/admin/login");
  if (method === "GET") {
  const saved = url.searchParams.get("saved") === "1";
  const err = url.searchParams.get("err") === "1";
  const body = `
  <a class="back" href="/admin">&larr; Admin panel</a>
  <div class="page-head"><div><h1>Admin paroli</h1><p class="muted">Admin panelga kirish parolini o'zgartirish.</p></div></div>
  ${saved ? alertBox("Parol saqlandi.", "success") : ""}
  ${err ? alertBox("Parol talablarga javob bermadi yoki kiritilgan parollar mos emas.") : ""}
  <div class="card">
  <form method="post" action="/admin/password" class="form">
  <div class="field"><label>Yangi parol</label><input name="password" type="password" required minlength="8" maxlength="64" autocomplete="new-password" autofocus>${passwordRequirementsMarkup()}</div>
  <div class="field"><label>Yangi parolni qayta kiriting</label><input name="password2" type="password" required minlength="8" maxlength="64" autocomplete="new-password"></div>
  <button class="btn btn-primary" type="submit">Saqlash</button>
  </form>
  </div>`;
  send(res, 200, layout({ title: "Admin paroli", body, admin }));
  return;
  }
  const password = String(fields.password || "");
  const password2 = String(fields.password2 || "");
  if (passwordPolicyError(password) || password !== password2) {
  redirect(res, "/admin/password?err=1");
  return;
  }
  metaSet("admin_password_hash", hashPassword(password));
  metaSet("admin_code_hash", "");
  metaSet("admin_code_exp", "0");
  redirect(res, "/admin/password?saved=1");
  return;
  }

  if (p === "/admin/template/xlsx" && method === "GET") {
  if (!admin) return redirect(res, "/admin/login");
  const buffer = questionsXlsxTemplate();
  res.writeHead(200, {
  "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "Content-Length": buffer.length,
  "Content-Disposition": "attachment; filename*=UTF-8''savollar-namuna.xlsx",
  "Cache-Control": "no-cache"
  });
  res.end(buffer);
  return;
  }

  if (p === "/admin/contract" && method === "GET") {
  if (!admin) return redirect(res, "/admin/login");
  const body = `
  <a class="back" href="/admin">&larr; Admin panel</a>
  <div class="page-head"><div><h1>Ta'lim shartnomasi</h1><p class="muted">Foydalanuvchilar platformaga kirganda ko'radigan matn</p></div></div>
  ${url.searchParams.get("saved") === "1" ? alertBox("Saqlandi.", "success") : ""}
  <div class="card">
  <form method="post" action="/admin/contract" class="form">
  <div class="field"><label>Shartnoma matni</label><textarea name="text" rows="18">${h(contractText())}</textarea></div>
  <button class="btn btn-primary" type="submit">Saqlash</button>
  </form>
  </div>`;
  send(res, 200, layout({ title: "Ta'lim shartnomasi", body, admin }));
  return;
  }

  if (p === "/admin/contract" && method === "POST") {
  if (!admin) return redirect(res, "/admin/login");
  const text = String(fields.text || "").trim().slice(0, 20000);
  metaSet("contract_text", text || DEFAULT_CONTRACT_TEXT);
  return redirect(res, "/admin/contract?saved=1");
  }

  if (p === "/admin/plans" && method === "GET") {
  if (!admin) return redirect(res, "/admin/login");
  const plans = getPlans();
  const body = `<a class="back" href="/admin">Admin panel</a><div class="page-head"><div><h1>Tarif narxlari</h1><p class="muted">Narxlar Tariflar sahifasida darhol yangilanadi.</p></div><a class="btn btn-ghost" href="/admin/payments">To'lov so'rovlari</a></div>
  ${url.searchParams.get("saved") === "1" ? alertBox("Tarif va karta ma'lumotlari saqlandi.", "success") : ""}
  ${url.searchParams.get("err") === "card" ? alertBox("Karta raqami 16 ta raqam bo'lsin; karta egasining ismini tekshiring.", "error") : ""}
  <div class="card"><form method="post" action="/admin/plans" class="form">${plans.map((plan) => `<div class="field"><label>${h(plan.title)} tarifi (so'm)</label><input type="number" name="${h(plan.id)}" min="0" step="1000" value="${plan.price}" required></div>`).join("")}<hr><h2>To'lov kartasi</h2><p class="muted">Karta raqamini bo'sh qoldirsangiz karta ma'lumotlari o'chiriladi.</p><div class="field"><label>Karta raqami</label><input name="card_number" inputmode="numeric" autocomplete="off" maxlength="23" value="${h(metaGet("payment_card_number", ""))}" placeholder="8600 0000 0000 0000"></div><div class="field"><label>Karta egasi</label><input name="card_holder" maxlength="80" value="${h(metaGet("payment_card_holder", ""))}" placeholder="ISM FAMILIYA"></div><button class="btn btn-primary" type="submit">Tarif va karta ma'lumotlarini saqlash</button></form></div>`;
  send(res, 200, layout({ title: "Tarif narxlari", body, admin }));
  return;
  }

  if (p === "/admin/plans" && method === "POST") {
  if (!admin) return redirect(res, "/admin/login");
  const cardNumber = String(fields.card_number || "").replace(/\D/g, "");
  const cardHolder = String(fields.card_holder || "").trim().replace(/\s+/g, " ");
  if ((cardNumber && cardNumber.length !== 16) || (cardNumber && !/^[\p{L}\s'-]{2,80}$/u.test(cardHolder))) return redirect(res, "/admin/plans?err=card");
  const prices = getPlans().map((plan) => ({ id: plan.id, price: Math.min(100000000, Math.max(0, Math.round(Number(fields[plan.id]) || 0))) }));
  metaSet("plans_json", JSON.stringify(prices));
  metaSet("payment_card_number", cardNumber);
  metaSet("payment_card_holder", cardNumber ? cardHolder : "");
  return redirect(res, "/admin/plans?saved=1");
  }

  const paymentReview = p.match(/^\/admin\/payments\/(\d+)\/(approve|reject)$/);
  if (paymentReview && method === "POST") {
  if (!admin) return redirect(res, "/admin/login");
  const request = db.prepare("SELECT pr.*, u.name, u.phone FROM payment_requests pr JOIN users u ON u.id = pr.user_id WHERE pr.id = ?").get(Number(paymentReview[1]));
  if (!request || request.status !== "pending") return redirect(res, "/admin/payments");
  if (paymentReview[2] === "approve") {
    const plan = getPlans().find((item) => item.id === request.plan_id) || DEFAULT_PLANS.find((item) => item.id === request.plan_id);
    const current = db.prepare("SELECT MAX(expires_at) AS expires_at FROM plan_subscriptions WHERE user_id = ? AND status = 'active' AND expires_at > ?").get(request.user_id, nowISO());
    const startsAt = nowISO();
    const base = current && current.expires_at ? Date.parse(current.expires_at) : Date.now();
    const expiresAt = new Date(Math.max(base, Date.now()) + (plan ? plan.days : 30) * 86400000).toISOString();
    db.prepare("INSERT INTO plan_subscriptions (user_id, plan_id, starts_at, expires_at, status) VALUES (?, ?, ?, ?, 'active')").run(request.user_id, request.plan_id, startsAt, expiresAt);
    db.prepare("UPDATE payment_requests SET status = 'approved', reviewed_at = ? WHERE id = ?").run(startsAt, request.id);
    sendUserMessage(request.user_id, `<b>To'lovingiz tasdiqlandi</b>\n${h(plan ? plan.title : request.plan_id)} tarifi ${h(expiresAt.slice(0, 10))} gacha faol.`, "/plans", "Tarifni ko'rish").catch(() => {});
  } else {
    db.prepare("UPDATE payment_requests SET status = 'rejected', reviewed_at = ? WHERE id = ?").run(nowISO(), request.id);
  }
  return redirect(res, "/admin/payments");
  }

  if (p === "/admin/payments" && method === "GET") {
  if (!admin) return redirect(res, "/admin/login");
  const requests = db.prepare(`SELECT pr.*, u.name, u.phone FROM payment_requests pr JOIN users u ON u.id = pr.user_id ORDER BY CASE pr.status WHEN 'pending' THEN 0 ELSE 1 END, pr.id DESC`).all();
  const rows = requests.length ? requests.map((request) => {
    const plan = getPlans().find((item) => item.id === request.plan_id);
    return `<tr><td>#${request.id}</td><td><b>${h(request.name)}</b><br><small>${h(request.phone)}</small></td><td>${h(plan ? plan.title : request.plan_id)}</td><td>${formatSum(request.amount)} so'm</td><td>${request.status === "approved" ? "Tasdiqlangan" : request.status === "rejected" ? "Rad etilgan" : "Kutilmoqda"}<br><small>${h(request.created_at)}</small></td><td>${request.status === "pending" ? `<form method="post" action="/admin/payments/${request.id}/approve" class="inline"><button class="btn btn-sm btn-primary">Tasdiqlash</button></form> <form method="post" action="/admin/payments/${request.id}/reject" class="inline"><button class="btn btn-sm btn-danger">Rad etish</button></form>` : ""}</td></tr>`;
  }).join("") : `<tr><td colspan="6" class="muted">Hozircha to'lov so'rovi yo'q.</td></tr>`;
  const body = `<a class="back" href="/admin">Admin panel</a><div class="page-head"><div><h1>To'lov so'rovlari</h1><p class="muted">Chekni Telegramda tekshiring, keyin tarifni tasdiqlang.</p></div><a class="btn btn-ghost" href="/admin/plans">Tarif narxlari</a></div><div class="card"><div class="table-wrap"><table><thead><tr><th>So'rov</th><th>O'quvchi</th><th>Tarif</th><th>Summa</th><th>Holat</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  send(res, 200, layout({ title: "To'lovlar", body, admin }));
  return;
  }

  if (p === "/author" && method === "GET") {
    if (!user) return redirect(res, "/login?next=/author");
    if (!author && !admin) return redirect(res, "/attestation");
    const courses = db.prepare(`SELECT c.id, c.title, c.category, c.is_published,
      (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count,
      (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id AND l.type = 'test') AS test_count
      FROM courses c ORDER BY c.id DESC`).all();
    const updatedCourseId = Number(url.searchParams.get("course")) || 0;
    const updatedCourse = courses.find((course) => Number(course.id) === updatedCourseId);
    const settingsNotice = url.searchParams.has("settings_updated")
      ? alertBox(`${Math.max(0, Number(url.searchParams.get("settings_updated")) || 0)} ta testning vaqti va bali${updatedCourse ? ` “${updatedCourse.title}” kursida` : ""} saqlandi.`, "success")
      : "";
    const settingsError = url.searchParams.get("err") === "course_settings" ? alertBox("Vaqt 1–180 daqiqa, ball esa 0–1000 oralig'ida bo'lishi kerak.", "error") : "";
    const courseRows = courses.length ? courses.map((course) => `<div class="card course-card">
      <div class="course-top"><div class="course-ico">${icon("layers")}</div><span class="badge">${course.lesson_count} dars</span></div>
      <h3>${h(course.title)}</h3><p class="muted">${h(categoryLabel(course.category))} · ${Number(course.is_published) ? "E'lon qilingan" : "Qoralama"}</p><a class="card-link" href="/admin/course/${course.id}">Tahrirlash</a>
      <form method="post" action="/author/course/${course.id}/test-settings" class="course-bulk-form" onsubmit="return confirm('Shu kursdagi barcha testlarning vaqt va ball qiymatlarini saqlaysizmi?')">
        <div class="course-bulk-fields"><div class="course-bulk-field"><label for="duration-${course.id}">Daqiqa</label><input id="duration-${course.id}" aria-label="Test vaqti daqiqada" type="number" name="duration_min" min="1" max="180" value="30" required ${Number(course.test_count) ? "" : "disabled"}></div>
        <div class="course-bulk-field"><label for="score-${course.id}">Ball</label><input id="score-${course.id}" aria-label="Test bali" type="number" name="max_score" min="0" max="1000" value="15" required ${Number(course.test_count) ? "" : "disabled"}></div></div>
        <button class="btn btn-sm btn-primary" type="submit" ${Number(course.test_count) ? "" : "disabled"}>Saqlash</button>
      </form>
      </div>`).join("") : `<div class="card empty">Hozircha kurs yo'q.</div>`;
    const body = `<div class="page-head"><div><h1>Muallif paneli</h1><p class="muted">Kurslar, darslar va test materiallarini boshqaring.</p></div></div>
      ${settingsNotice}
      ${settingsError}
      <div class="grid three">${courseRows}</div>
      <div class="card" style="margin-top:22px"><h2>Yangi kurs</h2><form method="post" action="/admin/course" class="form">
      <div class="field"><label>Yo'nalish</label><select name="category"><option value="attestation">Attestatsiya</option><option value="tkt">TKT</option></select></div>
      <div class="field"><label>Kurs nomi</label><input name="title" required maxlength="160"></div><div class="field"><label>Tavsif</label><textarea name="description" rows="2"></textarea></div>
      <button class="btn btn-primary" type="submit">Kurs yaratish</button></form></div>`;
    send(res, 200, layout({ title: "Muallif paneli", body, user, admin }));
    return;
  }

  const authorCourseDurationMatch = p.match(/^\/author\/course\/(\d+)\/test-duration$/);
  if (authorCourseDurationMatch && method === "POST") {
    if (!user) return redirect(res, "/login?next=/author");
    if (!author && !admin) return redirect(res, "/attestation");
    const courseId = Number(authorCourseDurationMatch[1]);
    if (!db.prepare("SELECT id FROM courses WHERE id = ?").get(courseId)) return redirect(res, "/author");
    const durationMin = Number(fields.duration_min);
    if (!Number.isInteger(durationMin) || durationMin < 1 || durationMin > 180) {
      return redirect(res, "/author?err=duration");
    }
    const result = db.prepare("UPDATE lessons SET duration_min = ? WHERE course_id = ? AND type = 'test'").run(durationMin, courseId);
    return redirect(res, `/author?times_updated=${result.changes}&course=${courseId}`);
  }

  const authorCourseScoreMatch = p.match(/^\/author\/course\/(\d+)\/test-score$/);
  if (authorCourseScoreMatch && method === "POST") {
    if (!user) return redirect(res, "/login?next=/author");
    if (!author && !admin) return redirect(res, "/attestation");
    const courseId = Number(authorCourseScoreMatch[1]);
    if (!db.prepare("SELECT id FROM courses WHERE id = ?").get(courseId)) return redirect(res, "/author");
    const maxScore = Number(fields.max_score);
    if (!Number.isInteger(maxScore) || maxScore < 0 || maxScore > 1000) {
      return redirect(res, "/author?err=score");
    }
    const result = db.prepare("UPDATE lessons SET max_score = ? WHERE course_id = ? AND type = 'test'").run(maxScore, courseId);
    return redirect(res, `/author?scores_updated=${result.changes}&course=${courseId}`);
  }

  const authorCourseSettingsMatch = p.match(/^\/author\/course\/(\d+)\/test-settings$/);
  if (authorCourseSettingsMatch && method === "POST") {
    if (!user) return redirect(res, "/login?next=/author");
    if (!author && !admin) return redirect(res, "/attestation");
    const courseId = Number(authorCourseSettingsMatch[1]);
    if (!db.prepare("SELECT id FROM courses WHERE id = ?").get(courseId)) return redirect(res, "/author");
    const durationMin = Number(fields.duration_min);
    const maxScore = Number(fields.max_score);
    if (!Number.isInteger(durationMin) || durationMin < 1 || durationMin > 180 || !Number.isInteger(maxScore) || maxScore < 0 || maxScore > 1000) {
      return redirect(res, "/author?err=course_settings");
    }
    const result = db.prepare("UPDATE lessons SET duration_min = ?, max_score = ? WHERE course_id = ? AND type = 'test'").run(durationMin, maxScore, courseId);
    const updatedTests = result.changes;
    return redirect(res, `/author?settings_updated=${updatedTests}&course=${courseId}`);
  }

  if (p === "/admin" && method === "GET") {
  if (!admin) return redirect(res, "/admin/login");

  const stats = {
  users: db.prepare("SELECT COUNT(*) AS n FROM users").get().n,
  courses: db.prepare("SELECT COUNT(*) AS n FROM courses").get().n,
  lessons: db.prepare("SELECT COUNT(*) AS n FROM lessons").get().n,
  done: db.prepare("SELECT COUNT(*) AS n FROM progress").get().n
  };

  const courses = db
.prepare(
  `SELECT c.*,
  (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count,
  (SELECT COUNT(DISTINCT e.user_id) FROM enrollments e WHERE e.course_id = c.id) AS student_count
  FROM courses c ORDER BY c.id DESC`
  )
.all();

  const rows = courses.length
  ? courses
.map(
  (c) => `<tr>
  <td><b>${h(c.title)}</b><br><small class="muted">${h(c.description || "")}</small></td>
  <td><span class="badge">${h(categoryLabel(c.category))}</span></td>
  <td>${c.lesson_count}</td>
  <td>${c.student_count}</td>
  <td class="ta-right">
  <a class="btn btn-sm" href="/admin/course/${c.id}#edit-course">Tahrirlash</a>
  <a class="btn btn-sm" href="/admin/course/${c.id}">Darslar</a>
  <form method="post" action="/admin/course/${c.id}/delete" class="inline" onsubmit="return confirm('Kurs va uning barcha darslari ochiriladi. Davom etilsinmi?')">
  <button class="btn btn-sm btn-danger" type="submit">O'chirish</button>
  </form>
  </td>
  </tr>`
  )
.join("")
: `<tr><td colspan="5" class="muted">Hozircha kurslar yo'q.</td></tr>`;

  const body = `
  <div class="page-head"><div><h1>Admin panel</h1><p class="muted">Kurslar, darslar va o'quvchilar boshqaruvi.</p></div><div class="actions"><a class="btn btn-ghost btn-sm" href="/admin/students">O'quvchilar</a><a class="btn btn-ghost btn-sm" href="/admin/site-settings">Sayt sozlamalari</a><a class="btn btn-ghost btn-sm" href="/admin/plans">Tariflar</a><a class="btn btn-ghost btn-sm" href="/admin/payments">To'lovlar</a><a class="btn btn-ghost btn-sm" href="/admin/password">Parolni o'zgartirish</a><a class="btn btn-ghost btn-sm" href="/admin/contract">Ta'lim shartnomasi</a></div></div>
  <div class="stats">
  <div class="stat"><b>${stats.users}</b><span>O'quvchilar</span></div>
  <div class="stat"><b>${stats.courses}</b><span>Kurslar</span></div>
  <div class="stat"><b>${stats.lessons}</b><span>Darslar</span></div>
  <div class="stat"><b>${stats.done}</b><span>Tugatilgan darslar</span></div>
  </div>

  <div class="card">
  <h2>Kurslar</h2>
  <div class="table-wrap">
  <table>
  <thead><tr><th>Kurs</th><th>Yo'nalish</th><th>Darslar</th><th>O'quvchilar</th><th></th></tr></thead>
  <tbody>${rows}</tbody>
  </table>
  </div>
  </div>

  <div class="card">
  <h2>Yangi kurs</h2>
  <form method="post" action="/admin/course" class="form">
  <div class="field">
  <label>Yo'nalish</label>
  <select name="category">
  <option value="attestation">Attestatsiya</option>
  <option value="tkt">TKT</option>
  </select>
  </div>
  <div class="field"><label>Kurs nomi</label><input name="title" required placeholder="Masalan: Atestatsiya testlariga tayyorlov"></div>
  <div class="field"><label>Tavsif</label><textarea name="description" rows="2" placeholder="Qisqacha tavsif"></textarea></div>
  <button class="btn btn-primary" type="submit">Kurs qo'shish</button>
  </form>
  </div>`;
  send(res, 200, layout({ title: "Admin panel", body, admin }));
  return;
  }

  if (p === "/admin/site-settings" && method === "GET") {
    if (!admin) return redirect(res, "/admin/login");
    const copy = siteTexts(true);
    const homeSections = homeSectionVisibility();
    const customHomeSections = homeCustomSections();
    const sectionOrder = homeSectionOrder(customHomeSections);
    const groups = [
      { id: "nav", title: "Menyu va sayt nomi", fields: [["site_name", "Sayt nomi"], ["nav_home", "Bosh sahifa"], ["nav_attestation", "Attestatsiya"], ["nav_tkt", "TKT"], ["nav_duel", "Duel"], ["nav_plans", "Tariflar"], ["nav_leaderboard", "Reyting"]] },
      { id: "hero", title: "Bosh sahifa — asosiy qism", fields: [["hero_eyebrow", "Yuqori kichik yozuv"], ["hero_title", "Sarlavhaning birinchi qismi"], ["hero_accent", "Rangli sarlavha qismi"], ["hero_title_end", "Sarlavhaning oxirgi qismi"], ["hero_description", "Tavsif"], ["hero_primary", "Asosiy tugma"], ["hero_primary_logged", "Kirish qilganlar tugmasi"], ["hero_secondary", "Yo'nalishni tanlash tugmasi"], ["hero_trust_1", "Afzallik 1"], ["hero_trust_2", "Afzallik 2"], ["hero_trust_3", "Afzallik 3"], ["hero_note", "Yangilik xabari"], ["hero_image_caption", "Rasm osti yozuvi"], ["hero_float_mark", "TKT belgisi"], ["hero_float_title", "TKT kartasi sarlavhasi"], ["hero_float_description", "TKT kartasi tavsifi"]] },
      { id: "overview", title: "Hisoblagich, kirish qismi va orbitalar", fields: [["stat_directions", "Yo'nalishlar hisoblagichi"], ["stat_lessons", "Video darslar hisoblagichi"], ["stat_tests", "Barcha testlar hisoblagichi"], ["stat_test_attestation", "Attestatsiya testlari nomi"], ["stat_test_tkt", "TKT testlari nomi"], ["stat_students", "O'quvchilar hisoblagichi"], ["stat_note_title", "Hisoblagich yonidagi sarlavha"], ["stat_note_description", "Hisoblagich yonidagi izoh"], ["orbit_kicker", "Orbital karta yuqori yozuvi"], ["orbit_test", "Orbital test yorlig'i"], ["orbit_lesson", "Orbital dars yorlig'i"], ["orbit_result", "Orbital natija yorlig'i"], ["orbit_tag_1", "Orbital teg 1"], ["orbit_tag_2", "Orbital teg 2"], ["orbit_tag_3", "Orbital teg 3"], ["orbit_tag_4", "Orbital teg 4"], ["overview_eyebrow", "Kirish bo'limi kichik sarlavhasi"], ["overview_title", "Kirish bo'limi sarlavhasi"], ["overview_accent", "Rangli sarlavha qismi"], ["overview_description", "Kirish bo'limi tavsifi"], ["pillar_1_title", "Afzallik 1 sarlavhasi"], ["pillar_1_description", "Afzallik 1 tavsifi"], ["pillar_2_title", "Afzallik 2 sarlavhasi"], ["pillar_2_description", "Afzallik 2 tavsifi"], ["pillar_3_title", "Afzallik 3 sarlavhasi"], ["pillar_3_description", "Afzallik 3 tavsifi"]] },
      { id: "directions", title: "Yo'nalishlar", fields: [["direction_heading", "Yo'nalishlar sarlavhasi"], ["direction_description", "Yo'nalishlar tavsifi"], ["direction_attestation_title", "Attestatsiya kartasi sarlavhasi"], ["direction_attestation_description", "Attestatsiya kartasi tavsifi"], ["direction_tkt_title", "TKT kartasi sarlavhasi"], ["direction_tkt_description", "TKT kartasi tavsifi"], ["direction_open", "Karta tugmasi"]] },
      { id: "features", title: "Biz haqimizda va imkoniyatlar", fields: [["about_eyebrow", "Biz haqimizda kichik sarlavha"], ["about_title", "Biz haqimizda sarlavhasi"], ["about_description", "Biz haqimizda tavsifi"], ["about_check_1", "Afzallik ro'yxati 1"], ["about_check_2", "Afzallik ro'yxati 2"], ["about_check_3", "Afzallik ro'yxati 3"], ["about_check_4", "Afzallik ro'yxati 4"], ["about_card_title", "Yon kartadagi sarlavha"], ["about_card_description", "Yon kartadagi izoh"], ["feature_eyebrow", "Imkoniyatlar kichik sarlavhasi"], ["feature_title", "Imkoniyatlar sarlavhasi"], ["feature_pdf_title", "PDF karta sarlavhasi"], ["feature_pdf_description", "PDF karta tavsifi"], ["feature_video_title", "Video karta sarlavhasi"], ["feature_video_description", "Video karta tavsifi"], ["feature_test_title", "Test karta sarlavhasi"], ["feature_test_description", "Test karta tavsifi"]] },
      { id: "program", title: "O'quv dasturi", fields: [["program_eyebrow", "Bo'lim kichik sarlavhasi"], ["program_title", "Bo'lim sarlavhasi"], ["program_accent", "Rangli sarlavha qismi"], ["program_description", "Bo'lim tavsifi"], ["program_direction_suffix", "Yo'nalishlar soni qo'shimchasi"], ["program_lesson_suffix", "Darslar soni qo'shimchasi"], ["program_attestation_tag", "1-bosqich yorlig'i"], ["program_tkt_tag", "2-bosqich yorlig'i"], ["program_practice_tag", "3-bosqich yorlig'i"], ["program_step_1_title", "Bosqich 1 sarlavhasi"], ["program_step_1_description", "Bosqich 1 tavsifi"], ["program_step_2_title", "Bosqich 2 sarlavhasi"], ["program_step_2_description", "Bosqich 2 tavsifi"], ["program_step_3_title", "Bosqich 3 sarlavhasi"], ["program_step_3_description", "Bosqich 3 tavsifi"]] },
      { id: "faq", title: "Tariflar va savol-javob", fields: [["pricing_eyebrow", "Tariflar kichik sarlavhasi"], ["pricing_title", "Tariflar sarlavhasi"], ["pricing_accent", "Rangli sarlavha qismi"], ["pricing_description", "Tariflar tavsifi"], ["pricing_all", "Barcha tariflar tugmasi"], ["pricing_button", "Tarif kartasi tugmasi"], ["faq_eyebrow", "Savol-javob kichik sarlavhasi"], ["faq_title", "Savol-javob sarlavhasi"], ["faq_accent", "Rangli sarlavha qismi"], ["faq_description", "Savol-javob tavsifi"], ["faq_contact", "Bog'lanish tugmasi"], ["faq_q1", "Savol 1"], ["faq_a1", "Javob 1"], ["faq_q2", "Savol 2"], ["faq_a2", "Javob 2"], ["faq_q3", "Savol 3"], ["faq_a3", "Javob 3"], ["faq_q4", "Savol 4"], ["faq_a4", "Javob 4"]] },
      { id: "footer", title: "Yakuniy chaqiriq va footer", fields: [["final_eyebrow", "Yakuniy bo'lim kichik sarlavhasi"], ["final_title", "Yakuniy sarlavha"], ["final_accent", "Rangli sarlavha qismi"], ["final_description", "Yakuniy bo'lim tavsifi"], ["final_button", "Tugma"], ["final_button_logged", "Kirish qilganlar tugmasi"], ["footer_tagline", "Pastki qism tavsifi"], ["footer_about", "Footer biz haqimizda havolasi"], ["footer_credit", "Footer muallif va huquq yozuvi"]] }
    ];
    groups.push({ id: "dashboard", title: "Kabinet", fields: [
      ["dashboard_page_title", "Sahifa nomi"], ["dashboard_registered_notice", "Ro'yxatdan o'tganlik xabari"], ["dashboard_quote_title", "Bugungi hikmat sarlavhasi"], ["dashboard_quote_override", "Hikmat matni o'rniga (ixtiyoriy)"], ["dashboard_quote_source", "Hikmat manbasi"],
      ["dashboard_greeting_eyebrow", "Xush kelibsiz yozuvi"], ["dashboard_greeting_prefix", "Salomlashish so'zi"], ["dashboard_welcome_lead", "Kabinet kirish tavsifi"],
      ["dashboard_streak_label", "Kunlik streak yozuvi"], ["dashboard_refresh_label", "Yangilash tugmasi"], ["dashboard_refresh_aria", "Yangilash tugmasi uchun yordamchi matn"], ["dashboard_refresh_help", "Yangilash izohi"], ["dashboard_install_label", "Ilovani o'rnatish tugmasi"], ["dashboard_install_aria", "Ilova tugmasi uchun yordamchi matn"], ["dashboard_install_ready", "Ilova o'rnatilgan xabari"], ["dashboard_install_help", "Ilovani o'rnatish bo'yicha yordam"],
      ["dashboard_done_title", "Barcha testlar tugaganda sarlavha"], ["dashboard_done_description", "Barcha testlar tugaganda tavsif"], ["dashboard_plan_required", "Tarif talab qilinadi yozuvi"], ["dashboard_next_test", "Keyingi test yozuvi"], ["dashboard_open_access", "Kirishni ochish yozuvi"],
      ["dashboard_completed", "Yakunlangan yozuvi"], ["dashboard_progress_title", "Testlar jarayoni"], ["dashboard_test_unit", "Test birligi"], ["dashboard_progress_encouragement", "Jarayon uchun ruhlantiruvchi yozuv"], ["dashboard_first_test_hint", "Birinchi test uchun yozuv"],
      ["dashboard_rank_position", "Guruhdagi o'rin yozuvi"], ["dashboard_achievements", "Yutuqlar yozuvi"], ["dashboard_group_ranking", "Guruh reytingi sarlavhasi"], ["dashboard_active_results", "Faol o'quvchilar tavsifi"], ["dashboard_weekly", "Haftalik tugma"],
      ["dashboard_weekly_empty", "Haftalik natija bo'sh bo'lgandagi yozuv"], ["dashboard_daily_growth", "Kunlik ruhlantiruvchi yozuv"], ["dashboard_tests_title", "Testlar sarlavhasi"], ["dashboard_test_count_suffix", "Testlar soni qo'shimchasi"],
      ["dashboard_test_search", "Test qidiruv maydoni"], ["dashboard_grid_view", "Katak ko'rinishidagi yordamchi matn"], ["dashboard_list_view", "Ro'yxat ko'rinishidagi yordamchi matn"], ["dashboard_no_tests", "Testlar bo'sh bo'lgandagi yozuv"],
      ["dashboard_status_previous", "Oldingi test holati"], ["dashboard_status_done", "Tugatilgan holati"], ["dashboard_status_plan", "Tarif kerak holati"], ["dashboard_status_start", "Boshlash holati"], ["dashboard_time_short", "Daqiqa qisqartmasi"], ["dashboard_duration_unit", "Daqiqa birligi"], ["dashboard_day_unit", "Kun birligi"], ["dashboard_page_label", "Sahifa yozuvi"], ["dashboard_test_list_label", "Test ro'yxati so'zi"]
    ]});
    const isLong = (key) => /description|faq_a|footer_credit|orbit_kicker|dashboard_(quote_override|quote_source|welcome_lead|done_description|progress_encouragement|first_test_hint|weekly_empty|daily_growth|refresh_help|install_ready|install_help)/.test(key);
    const removedCopyKeys = new Set(siteCopyRemoved());
    const copyExtras = siteCopyExtras();
    const fields = groups.map((group, groupIndex) => {
      const groupFields = group.fields.map(([key, label]) => {
        const isRemoved = removedCopyKeys.has(key);
        const control = isLong(key)
          ? `<textarea id="copy_${key}" name="${key}" maxlength="500" rows="3">${h(copy[key])}</textarea>`
          : `<input id="copy_${key}" name="${key}" value="${h(copy[key])}" maxlength="${key.startsWith("nav_") ? 32 : key === "site_name" ? 80 : 180}">`;
        return `<div class="field site-copy-field" data-copy-row data-copy-key="${key}"${isRemoved ? " hidden" : ""}><div class="site-copy-field-top"><label for="copy_${key}">${h(label)}</label><button class="btn btn-sm btn-danger" type="button" data-copy-remove>Olib tashlash</button></div>${control}</div>`;
      }).join("");
      const restoreButtons = group.fields.filter(([key]) => removedCopyKeys.has(key)).map(([key, label]) => `<button class="btn btn-sm" type="button" data-copy-restore="${key}">${h(label)} — qaytarish</button>`).join("");
      const extraRows = copyExtras.filter((row) => row.group === group.id).map((row) => `<div class="site-copy-extra-row" data-copy-extra data-copy-extra-id="${h(row.id)}"><label>Matn nomi<input data-copy-extra-label maxlength="100" value="${h(row.label)}"></label><label>Saytda ko'rinadigan matn<textarea data-copy-extra-text maxlength="1000" rows="2">${h(row.text)}</textarea></label><button class="btn btn-sm btn-danger" type="button" data-copy-extra-remove>Olib tashlash</button></div>`).join("");
      return `<details class="site-copy-group" data-copy-group="${group.id}"${groupIndex === 0 ? " open" : ""}><summary>${h(group.title)}<span>${group.fields.length} ta matn</span></summary><div class="site-copy-grid">${groupFields}<div class="site-copy-restore" data-copy-restore-list>${restoreButtons}</div><div class="site-copy-extras" data-copy-extras>${extraRows}</div><button class="btn btn-ghost" type="button" data-copy-add>+ Matn qo'shish</button></div></details>`;
    }).join("");
    const customByKey = new Map(customHomeSections.map((section) => [`custom_${section.id}`, section]));
    const sectionFields = sectionOrder.map((key) => {
      const custom = customByKey.get(key);
      if (custom) return `<div class="home-order-item home-custom-item" draggable="true" data-home-order-item data-section-key="${h(key)}"><div class="home-order-head"><span class="home-drag-handle" aria-hidden="true">⠿</span><label class="home-order-label"><input type="checkbox" data-custom-visible${custom.visible ? " checked" : ""}><span>${h(custom.title)}</span></label><div class="home-order-buttons"><button type="button" data-order-move="up" aria-label="Yuqoriga">↑</button><button type="button" data-order-move="down" aria-label="Pastga">↓</button></div></div><details class="home-custom-editor"><summary>Bo'lim matnlarini tahrirlash</summary><div class="home-custom-fields"><label>Sarlavha<input data-custom-title maxlength="180" value="${h(custom.title)}"></label><label>Tavsif<textarea data-custom-description maxlength="2000" rows="3">${h(custom.description)}</textarea></label><label>Tugma yozuvi (ixtiyoriy)<input data-custom-button maxlength="80" value="${h(custom.buttonLabel)}"></label><label>Tugma havolasi (ixtiyoriy)<input data-custom-url maxlength="500" value="${h(custom.buttonUrl)}" placeholder="/courses yoki https://..."></label><button class="btn btn-sm" type="button" data-remove-custom>Bo'limni o'chirish</button></div></details></div>`;
      const label = HOME_SECTION_LABELS[key];
      return `<div class="home-order-item" draggable="true" data-home-order-item data-section-key="${h(key)}"><div class="home-order-head"><span class="home-drag-handle" aria-hidden="true">⠿</span><label class="home-order-label"><input type="checkbox" name="home_section_${h(key)}" value="1"${homeSections[key] ? " checked" : ""}><span>${h(label)}</span></label><div class="home-order-buttons"><button type="button" data-order-move="up" aria-label="Yuqoriga">↑</button><button type="button" data-order-move="down" aria-label="Pastga">↓</button></div></div></div>`;
    }).join("");
    const sectionOrderJson = h(JSON.stringify(sectionOrder));
    const customSectionsJson = h(JSON.stringify(customHomeSections));
    const permanentlyRemovedButtons = new Set(removedSiteButtons());
    const siteButtonSettings = REMOVABLE_SITE_BUTTONS.map(([key, label]) => {
      const removed = permanentlyRemovedButtons.has(key);
      return `<div class="field site-copy-field"><label>${h(label)}</label>${removed ? `<span class="muted">Butunlay olib tashlangan</span>` : `<button class="btn btn-sm btn-danger" type="submit" formmethod="post" formaction="/admin/site-settings/remove-button" formnovalidate name="button_key" value="${h(key)}" onclick="return confirm('“${h(label)}” tugmasi saytdan butunlay olib tashlanadi va bu panel orqali qayta tiklab bo‘lmaydi. Davom etilsinmi?')">Butunlay olib tashlash</button>`}</div>`;
    }).join("");
    const body = `<a class="back" href="/admin">&larr; Admin panel</a>
      <div class="page-head"><div><h1>Sayt sozlamalari</h1><p class="muted">Menyu va bosh sahifadagi asosiy matnlarni shu yerdan tahrirlang. O'zgarishlar saqlangandan so'ng darhol ko'rinadi.</p></div></div>
      ${url.searchParams.get("saved") === "1" ? alertBox("Sayt matnlari saqlandi.", "success") : ""}
      ${url.searchParams.get("button_removed") === "1" ? alertBox("Sayt tugmasi butunlay olib tashlandi. Uni ushbu paneldan qaytarib bo'lmaydi.", "success") : ""}
      ${url.searchParams.get("err") === "length" ? alertBox("Qisqa yozuvlar 180, izohlar esa 500 belgigacha bo'lishi mumkin.", "error") : ""}
      <form method="post" action="/admin/site-settings" class="form site-copy-form">
        <input type="hidden" name="site_copy_removed" id="siteCopyRemoved" value="${h(JSON.stringify([...removedCopyKeys]))}">
        <input type="hidden" name="site_copy_extras" id="siteCopyExtras" value="${h(JSON.stringify(copyExtras))}">
        <section class="card"><h2>Yo'nalishlar</h2><p class="muted">Multilevel sahifasi olib tashlandi. Testlar Attestatsiya va TKT yo'nalishlarida saqlanadi.</p></section>
        <section class="card" style="margin-top:22px"><h2>Saytdagi tugmalarni butunlay olib tashlash</h2><p class="muted">Bu amal bosh sahifa, sayt menyusi va pastki qismdagi tashrif buyuruvchilar ko'radigan havola hamda tugmalar uchun. Olib tashlangan tugma bu paneldan qaytarilmaydi. Admin panelning saqlash va boshqaruv tugmalari o'zgarmaydi.</p><div class="site-copy-grid">${siteButtonSettings}</div></section>
        <button class="btn btn-primary" type="submit">Barcha matnlarni saqlash</button>
        <section class="home-section-settings"><div><h2>Bosh sahifa bo'limlari</h2><p class="muted">Bo'limlarni sudrab tartiblang, belgisini olib tashlab yashiring yoki yangi bo'lim qo'shing. Tartib saytga shu ko'rinishda chiqadi.</p></div><input type="hidden" name="home_section_order" id="homeSectionOrder" value="${sectionOrderJson}"><input type="hidden" name="home_custom_sections" id="homeCustomSections" value="${customSectionsJson}"><div class="home-order-list" id="homeSectionOrderList">${sectionFields}</div><button class="btn btn-ghost" id="addHomeSection" type="button">+ Yangi bo'lim qo'shish</button><small class="muted">Yangi bo'lim uchun sarlavha va tavsif kiriting. Ko'pi bilan 20 ta qo'shimcha bo'lim.</small></section>
        ${fields}
        <button class="btn btn-primary" type="submit">Barcha matnlarni saqlash</button>
      </form>
      `;
    const sectionScript = `<script>(function(){var list=document.getElementById('homeSectionOrderList');var form=list&&list.closest('form');var add=document.getElementById('addHomeSection');var orderInput=document.getElementById('homeSectionOrder');var customInput=document.getElementById('homeCustomSections');if(!list||!form||!orderInput||!customInput)return;function updateTitle(row){var input=row.querySelector('[data-custom-title]');var label=row.querySelector('.home-order-label span');if(input&&label)label.textContent=input.value||'Yangi bo\\'lim'}function makeCustom(){var id='custom_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);var row=document.createElement('div');row.className='home-order-item home-custom-item';row.draggable=true;row.dataset.homeOrderItem='';row.dataset.sectionKey=id;row.innerHTML='<div class="home-order-head"><span class="home-drag-handle" aria-hidden="true">⠿</span><label class="home-order-label"><input type="checkbox" data-custom-visible checked><span>Yangi bo\\'lim</span></label><div class="home-order-buttons"><button type="button" data-order-move="up" aria-label="Yuqoriga">↑</button><button type="button" data-order-move="down" aria-label="Pastga">↓</button></div></div><details class="home-custom-editor" open><summary>Bo\\'lim matnlarini tahrirlash</summary><div class="home-custom-fields"><label>Sarlavha<input data-custom-title maxlength="180" value=""></label><label>Tavsif<textarea data-custom-description maxlength="2000" rows="3"></textarea></label><label>Tugma yozuvi (ixtiyoriy)<input data-custom-button maxlength="80" value=""></label><label>Tugma havolasi (ixtiyoriy)<input data-custom-url maxlength="500" placeholder="/courses yoki https://..."></label><button class="btn btn-sm" type="button" data-remove-custom>Bo\\'limni o\\'chirish</button></div></details>';list.appendChild(row);row.querySelector('[data-custom-title]').focus()}if(add)add.addEventListener('click',function(){if(list.querySelectorAll('.home-custom-item').length>=20){alert('Ko\\'pi bilan 20 ta yangi bo\\'lim qo\\'shish mumkin.');return}makeCustom()});list.addEventListener('input',function(event){var row=event.target.closest('.home-custom-item');if(row&&event.target.matches('[data-custom-title]'))updateTitle(row)});list.addEventListener('click',function(event){var row=event.target.closest('[data-home-order-item]');if(!row)return;if(event.target.closest('[data-remove-custom]')){row.remove();return}var move=event.target.closest('[data-order-move]');if(!move)return;if(move.dataset.orderMove==='up'&&row.previousElementSibling)list.insertBefore(row,row.previousElementSibling);if(move.dataset.orderMove==='down'&&row.nextElementSibling)list.insertBefore(row.nextElementSibling,row)});var dragging=null;list.addEventListener('dragstart',function(event){dragging=event.target.closest('[data-home-order-item]');if(dragging){dragging.classList.add('is-dragging');event.dataTransfer.effectAllowed='move'}});list.addEventListener('dragend',function(){if(dragging)dragging.classList.remove('is-dragging');dragging=null});list.addEventListener('dragover',function(event){if(!dragging)return;event.preventDefault();var target=event.target.closest('[data-home-order-item]');if(!target||target===dragging)return;var rect=target.getBoundingClientRect();list.insertBefore(dragging,event.clientY<rect.top+rect.height/2?target:target.nextElementSibling)});form.addEventListener('submit',function(){var rows=Array.from(list.querySelectorAll('[data-home-order-item]'));orderInput.value=JSON.stringify(rows.map(function(row){return row.dataset.sectionKey}));customInput.value=JSON.stringify(rows.filter(function(row){return row.classList.contains('home-custom-item')}).map(function(row){var val=function(selector){var el=row.querySelector(selector);return el?el.value.trim():''};var visible=row.querySelector('[data-custom-visible]');return{id:row.dataset.sectionKey.replace(/^custom_/,'').slice(0,40),title:val('[data-custom-title]'),description:val('[data-custom-description]'),buttonLabel:val('[data-custom-button]'),buttonUrl:val('[data-custom-url]'),visible:!!(visible&&visible.checked)}}))})})();</script>`;
    const copyScript = `<script>(function(){var form=document.querySelector('.site-copy-form');var removed=document.getElementById('siteCopyRemoved');var extras=document.getElementById('siteCopyExtras');if(!form||!removed||!extras)return;function addExtra(group){var row=document.createElement('div');row.className='site-copy-extra-row';row.dataset.copyExtra='';row.dataset.copyExtraId='copy_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);var label=document.createElement('label');label.textContent='Matn nomi';var name=document.createElement('input');name.maxLength=100;name.dataset.copyExtraLabel='';label.appendChild(name);var textLabel=document.createElement('label');textLabel.textContent='Saytda ko\\'rinadigan matn';var text=document.createElement('textarea');text.maxLength=1000;text.rows=2;text.dataset.copyExtraText='';textLabel.appendChild(text);var remove=document.createElement('button');remove.type='button';remove.className='btn btn-sm btn-danger';remove.dataset.copyExtraRemove='';remove.textContent='Olib tashlash';row.append(label,textLabel,remove);group.querySelector('[data-copy-extras]').appendChild(row);name.focus()}form.addEventListener('click',function(event){var remove=event.target.closest('[data-copy-remove]');if(remove){var row=remove.closest('[data-copy-row]');if(row){row.hidden=true;var list=row.closest('.site-copy-grid').querySelector('[data-copy-restore-list]');var restore=document.createElement('button');restore.type='button';restore.className='btn btn-sm';restore.dataset.copyRestore=row.dataset.copyKey;restore.textContent=row.querySelector('label').textContent+' — qaytarish';list.appendChild(restore)}return}var restore=event.target.closest('[data-copy-restore]');if(restore){var key=restore.dataset.copyRestore;var row=form.querySelector('[data-copy-key="'+key+'"]');if(row)row.hidden=false;restore.remove();return}var deleteExtra=event.target.closest('[data-copy-extra-remove]');if(deleteExtra){deleteExtra.closest('[data-copy-extra]').remove();return}var add=event.target.closest('[data-copy-add]');if(add)addExtra(add.closest('[data-copy-group]'))});form.addEventListener('submit',function(){var removedKeys=Array.from(form.querySelectorAll('[data-copy-row][hidden]')).map(function(row){return row.dataset.copyKey});removed.value=JSON.stringify(removedKeys);var rows=Array.from(form.querySelectorAll('[data-copy-extra]')).map(function(row){return{id:row.dataset.copyExtraId,group:row.closest('[data-copy-group]').dataset.copyGroup,label:(row.querySelector('[data-copy-extra-label]').value||'').trim(),text:(row.querySelector('[data-copy-extra-text]').value||'').trim()}}).filter(function(row){return row.label&&row.text});extras.value=JSON.stringify(rows.slice(0,100))})})();</script>`;
    const fullBody = body + sectionScript + copyScript;
    send(res, 200, layout({ title: "Sayt sozlamalari", body: fullBody, admin }));
    return;
  }

  if (p === "/admin/site-settings/remove-button" && method === "POST") {
    if (!admin) return redirect(res, "/admin/login");
    const key = String(fields.button_key || "");
    const valid = new Set(REMOVABLE_SITE_BUTTONS.map(([buttonKey]) => buttonKey));
    if (!valid.has(key)) return redirect(res, "/admin/site-settings?err=button");
    const removed = new Set(removedSiteButtons());
    removed.add(key);
    metaSet("site_buttons_removed_json", JSON.stringify([...removed]));
    return redirect(res, "/admin/site-settings?button_removed=1");
  }

  if (p === "/admin/site-settings" && method === "POST") {
    if (!admin) return redirect(res, "/admin/login");
    let removedCopyKeys = [];
    try { removedCopyKeys = JSON.parse(String(fields.site_copy_removed || "[]")); } catch (e) {}
    const validCopyKeys = new Set(Object.keys(SITE_TEXT_DEFAULTS));
    removedCopyKeys = [...new Set((Array.isArray(removedCopyKeys) ? removedCopyKeys : []).filter((key) => validCopyKeys.has(key)))];
    metaSet("site_copy_removed_json", JSON.stringify(removedCopyKeys));
    let previousSiteTexts = {};
    try { previousSiteTexts = JSON.parse(metaGet("site_texts_json", "{}")) || {}; } catch (e) {}
    const saved = {};
    for (const [key, fallback] of Object.entries(SITE_TEXT_DEFAULTS)) {
      if (removedCopyKeys.includes(key)) { saved[key] = String(previousSiteTexts[key] ?? fallback); continue; }
      const value = String(fields[key] ?? fallback).trim().replace(/\s+/g, " ");
      const max = key.startsWith("nav_") ? 32 : key === "site_name" ? 80 : /description|faq_a|footer_credit|orbit_kicker|dashboard_(quote_override|quote_source|welcome_lead|done_description|progress_encouragement|first_test_hint|weekly_empty|daily_growth|refresh_help|install_ready|install_help)/.test(key) ? 500 : 180;
      if (value.length > max) return redirect(res, "/admin/site-settings?err=length");
      saved[key] = value || fallback;
    }
    metaSet("site_texts_json", JSON.stringify(saved));
    let submittedCopyExtras = [];
    try { submittedCopyExtras = JSON.parse(String(fields.site_copy_extras || "[]")); } catch (e) {}
    const allowedCopyGroups = new Set(["nav", "hero", "overview", "directions", "features", "program", "faq", "footer", "dashboard"]);
    const copyExtraIds = new Set();
    const normalizedCopyExtras = (Array.isArray(submittedCopyExtras) ? submittedCopyExtras : []).slice(0, 100).map((row, index) => {
      const id = String(row.id || `copy_${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
      if (!id || copyExtraIds.has(id) || !allowedCopyGroups.has(row.group)) return null;
      copyExtraIds.add(id);
      return { id, group: row.group, label: String(row.label || "").trim().slice(0, 100), text: String(row.text || "").trim().slice(0, 1000) };
    }).filter((row) => row && row.label && row.text);
    metaSet("site_copy_extras_json", JSON.stringify(normalizedCopyExtras));
    const sectionVisibility = Object.fromEntries(Object.keys(HOME_SECTION_LABELS).map((key) => [key, fields[`home_section_${key}`] === "1"]));
    metaSet("home_sections_json", JSON.stringify(sectionVisibility));
    let submittedCustom = [];
    try { submittedCustom = JSON.parse(String(fields.home_custom_sections || "[]")); } catch (e) {}
    const customIds = new Set();
    const normalizedCustom = (Array.isArray(submittedCustom) ? submittedCustom : []).slice(0, 20).map((section, index) => {
      const id = String(section.id || `section_${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
      if (!id || customIds.has(id)) return null;
      customIds.add(id);
      return {
        id,
        title: String(section.title || "").trim().slice(0, 180),
        description: String(section.description || "").replace(/\r\n/g, "\n").trim().slice(0, 2000),
        buttonLabel: String(section.buttonLabel || "").trim().slice(0, 80),
        buttonUrl: String(section.buttonUrl || "").trim().slice(0, 500),
        visible: section.visible !== false
      };
    }).filter((section) => section && section.title);
    metaSet("home_custom_sections_json", JSON.stringify(normalizedCustom));
    const validKeys = new Set([...Object.keys(HOME_SECTION_LABELS), ...normalizedCustom.map((section) => `custom_${section.id}`)]);
    let submittedOrder = [];
    try { submittedOrder = JSON.parse(String(fields.home_section_order || "[]")); } catch (e) {}
    const normalizedOrder = [];
    for (const key of Array.isArray(submittedOrder) ? submittedOrder : []) {
      if (validKeys.has(key) && !normalizedOrder.includes(key)) normalizedOrder.push(key);
    }
    for (const key of validKeys) if (!normalizedOrder.includes(key)) normalizedOrder.push(key);
    metaSet("home_section_order_json", JSON.stringify(normalizedOrder));
    return redirect(res, "/admin/site-settings?saved=1");
  }

  const studentAction = p.match(/^\/admin\/student\/(\d+)\/(block|unblock|grant|revoke|author|delete)$/);
  if (studentAction && method === "POST") {
  if (!admin) return redirect(res, "/admin/login");
  const studentId = Number(studentAction[1]);
  const action = studentAction[2];
  if (action === "author") {
    db.prepare("UPDATE users SET is_author = CASE WHEN is_author = 1 THEN 0 ELSE 1 END WHERE id = ?").run(studentId);
  } else if (action === "delete") {
    const target = db.prepare("SELECT id, phone, telegram_id, telegram_username FROM users WHERE id = ?").get(studentId);
    if (target) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const duelIds = db.prepare("SELECT id FROM duels WHERE creator_id = ? OR opponent_id = ?").all(studentId, studentId).map((d) => d.id);
        const matchIds = db.prepare("SELECT id FROM tournament_matches WHERE p1 = ? OR p2 = ? OR winner = ?").all(studentId, studentId, studentId).map((m) => m.id);
        for (const duelId of duelIds) {
          db.prepare("DELETE FROM duel_questions WHERE duel_id = ?").run(duelId);
          db.prepare("DELETE FROM duel_plays WHERE duel_id = ?").run(duelId);
          db.prepare("DELETE FROM duel_starts WHERE duel_id = ?").run(duelId);
        }
        for (const matchId of matchIds) db.prepare("DELETE FROM tournament_starts WHERE match_id = ?").run(matchId);
        db.prepare("DELETE FROM duels WHERE creator_id = ? OR opponent_id = ?").run(studentId, studentId);
        db.prepare("DELETE FROM tournament_entries WHERE user_id = ?").run(studentId);
        db.prepare("DELETE FROM tournament_starts WHERE user_id = ?").run(studentId);
        db.prepare("UPDATE tournament_matches SET p1 = CASE WHEN p1 = ? THEN NULL ELSE p1 END, p2 = CASE WHEN p2 = ? THEN NULL ELSE p2 END, winner = CASE WHEN winner = ? THEN NULL ELSE winner END, status = CASE WHEN p1 = ? OR p2 = ? THEN 'pending' ELSE status END, s1 = CASE WHEN p1 = ? OR p2 = ? THEN NULL ELSE s1 END, s2 = CASE WHEN p1 = ? OR p2 = ? THEN NULL ELSE s2 END, t1 = CASE WHEN p1 = ? OR p2 = ? THEN NULL ELSE t1 END, t2 = CASE WHEN p1 = ? OR p2 = ? THEN NULL ELSE t2 END, finished_at = CASE WHEN p1 = ? OR p2 = ? THEN NULL ELSE finished_at END WHERE p1 = ? OR p2 = ? OR winner = ?").run(...Array(18).fill(studentId));
        for (const table of ["sessions", "device_sessions", "progress", "enrollments", "purchases", "likes", "video_watch", "test_attempts", "plan_subscriptions", "payment_requests", "tournament_entries"]) db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(studentId);
        db.prepare("DELETE FROM login_codes WHERE phone = ?").run(target.phone);
        db.prepare("DELETE FROM login_links WHERE phone = ?").run(target.phone);
        if (target.telegram_username) db.prepare("DELETE FROM telegram_users WHERE username = ?").run(target.telegram_username);
        if (target.telegram_id) db.prepare("DELETE FROM telegram_users WHERE chat_id = ?").run(String(target.telegram_id));
        db.prepare("DELETE FROM users WHERE id = ?").run(studentId);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
    return redirect(res, "/admin/students");
  } else if (action === "block" || action === "unblock") {
    db.prepare("UPDATE users SET is_blocked = ? WHERE id = ?").run(action === "block" ? 1 : 0, studentId);
    if (action === "block") {
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(studentId);
      db.prepare("DELETE FROM device_sessions WHERE user_id = ?").run(studentId);
    }
  } else if (action === "grant") {
    const fullAccess = fields.duration === "full";
    const startsAt = nowISO();
    const months = Math.max(1, Math.min(120, Math.round(Number(fields.months) || 1)));
    const expiryDate = String(fields.expiry_date || "").trim();
    const dateExpiry = fields.duration === "date" && /^\d{4}-\d{2}-\d{2}$/.test(expiryDate)
      ? Date.parse(`${expiryDate}T23:59:59.999+05:00`)
      : NaN;
    if (fields.duration === "date" && !Number.isFinite(dateExpiry)) return redirect(res, "/admin/students");
    db.prepare("UPDATE plan_subscriptions SET status = 'revoked' WHERE user_id = ? AND status = 'active'").run(studentId);
    const expiresAt = fullAccess
      ? "9999-12-31T23:59:59.999Z"
      : fields.duration === "date"
        ? new Date(dateExpiry).toISOString()
        : new Date(Date.now() + months * 30 * 86400000).toISOString();
    if (!Number.isFinite(dateExpiry) || dateExpiry > Date.now()) {
      db.prepare("INSERT INTO plan_subscriptions (user_id, plan_id, starts_at, expires_at, status) VALUES (?, ?, ?, ?, 'active')")
        .run(studentId, fullAccess ? "admin_full" : fields.duration === "date" ? "admin_date" : `admin_${months}m`, startsAt, expiresAt);
    }
  } else {
    db.prepare("UPDATE plan_subscriptions SET status = 'revoked' WHERE user_id = ? AND status = 'active'").run(studentId);
  }
  return redirect(res, "/admin/students");
  }

  if (p === "/admin/students" && method === "GET") {
  if (!admin) return redirect(res, "/admin/login");
  const students = db
.prepare(
  `SELECT u.id, u.name, u.phone, u.telegram_id, u.telegram_username, u.created_at, u.is_blocked, u.is_author,
  (SELECT COUNT(*) FROM progress p WHERE p.user_id = u.id) AS done,
  (SELECT MAX(expires_at) FROM plan_subscriptions s WHERE s.user_id = u.id AND s.status = 'active' AND s.expires_at > ?) AS plan_expires
  FROM users u ORDER BY u.id DESC`
  )
.all(nowISO());
  const rows = students.length
  ? students
.map(
  (s) => `<tr>
  <td><b>${h(s.name)}</b></td>
  <td>${h(s.phone)}</td>
  <td>${s.telegram_username ? "@" + h(s.telegram_username) : s.telegram_id ? h(s.telegram_id) : " "}</td>
  <td>${s.done}</td>
  <td>${s.plan_expires ? String(s.plan_expires).startsWith("9999-") ? "To'liq ruxsat" : `Faol: ${h(String(s.plan_expires).slice(0, 10))}` : "Ruxsat yo'q"}</td>
  <td>${Number(s.is_blocked) ? `<span class="badge danger">Cheklangan</span>` : `<span class="badge done">Faol</span>`}</td>
  <td><form method="post" action="/admin/student/${s.id}/${Number(s.is_blocked) ? "unblock" : "block"}" class="inline"><button class="btn btn-sm ${Number(s.is_blocked) ? "btn-primary" : "btn-danger"}">${Number(s.is_blocked) ? "Ruxsat berish" : "Cheklash"}</button></form>
  <form method="post" action="/admin/student/${s.id}/author" class="inline"><button class="btn btn-sm">${Number(s.is_author) ? "Mualliflikni bekor qilish" : "Muallif tayinlash"}</button></form>
  <form method="post" action="/admin/student/${s.id}/delete" class="inline" onsubmit="return confirm('Foydalanuvchi va unga tegishli ma’lumotlar o‘chiriladi. Davom etilsinmi?')"><button class="btn btn-sm btn-danger">O‘chirish</button></form>
  <form method="post" action="/admin/student/${s.id}/grant" class="inline"><label class="small">Muddat <select name="months" style="min-width:100px">${Array.from({length:120},(_,i)=>`<option value="${i+1}"${i===2?" selected":""}>${i+1} oy</option>`).join("")}</select></label><button class="btn btn-sm" name="duration" value="set">Ruxsat berish</button><label class="small">Tugash sanasi <input type="date" name="expiry_date" value="${s.plan_expires && !String(s.plan_expires).startsWith("9999-") ? h(String(s.plan_expires).slice(0, 10)) : ""}"></label><button class="btn btn-sm" name="duration" value="date">Sanani belgilash</button><button class="btn btn-sm" name="duration" value="full">To'liq ochish</button></form>
  ${s.plan_expires ? `<form method="post" action="/admin/student/${s.id}/revoke" class="inline"><button class="btn btn-sm btn-danger">Tarifni yopish</button></form>` : ""}</td>
  <td>${h(String(s.created_at).slice(0, 10))}</td>
  </tr>`
  )
.join("")
: `<tr><td colspan="8" class="muted">Hozircha o'quvchilar yo'q.</td></tr>`;

  const body = `
  <div class="page-head"><div><h1>O'quvchilar</h1><p class="muted">Ro'yxatdan o'tgan foydalanuvchilar.</p></div></div>
  <div class="card">
  <div class="table-wrap">
  <table>
  <thead><tr><th>Ism</th><th>Telefon</th><th>Telegram</th><th>Tugatgan darslari</th><th>Tarif</th><th>Holat</th><th>Boshqaruv</th><th>Ro'yxatdan o'tgan</th></tr></thead>
  <tbody>${rows}</tbody>
  </table>
  </div>
  </div>`;
  send(res, 200, layout({ title: "O'quvchilar", body, admin }));
  return;
  }

  const adminMaterialDelete = p.match(/^\/admin\/material\/(\d+)\/delete$/);
  if (adminMaterialDelete && method === "POST") {
  if (!admin) return redirect(res, "/admin/login");
  const material = db.prepare("SELECT * FROM materials WHERE id = ?").get(Number(adminMaterialDelete[1]));
  if (!material) return redirect(res, "/admin");
  if (material.file_id) {
  try {
  fs.unlinkSync(path.join(STORAGE_DIR, material.file_id));
  } catch (e) {}
  }
  db.prepare("DELETE FROM materials WHERE id = ?").run(material.id);
  redirect(res, `/admin/lesson/${material.lesson_id}/materials`);
  return;
  }

  if (p === "/admin/access-code" && method === "POST") {
  if (!admin) return redirect(res, "/admin/login");
  const code = String(fields.code || "").trim().slice(0, 20);
  if (code.length >= 4) metaSet("access_code", code);
  redirect(res, "/admin");
  return;
  }


  if (p === "/admin/course" && method === "POST") {
  if (!contentManager) return redirect(res, "/admin/login");
  const title = String(fields.title || "").trim();
  const description = String(fields.description || "").trim();
  const category = DIRECTION_IDS.includes(fields.category)
  ? fields.category
: "attestation";
  if (!title) return redirect(res, "/admin");
  const info = db
.prepare("INSERT INTO courses (title, description, category, created_at) VALUES (?, ?, ?, ?)")
.run(title, description, category, nowISO());
  redirect(res, `/admin/course/${Number(info.lastInsertRowid)}`);
  return;
  }

  const adminCourseMatch = p.match(/^\/admin\/course\/(\d+)(\/delete)?$/);
  if (adminCourseMatch) {
  if (!contentManager || (author && adminCourseMatch[2] === "/delete")) return redirect(res, author ? "/author" : "/admin/login");
  const courseId = Number(adminCourseMatch[1]);
  const course = db.prepare("SELECT * FROM courses WHERE id = ?").get(courseId);
  if (!course) return notFound(res, user, admin);

  if (adminCourseMatch[2] === "/delete" && method === "POST") {  const lessons = db.prepare("SELECT * FROM lessons WHERE course_id = ?").all(courseId);
  lessons.forEach((l) => {
  if (l.file_id) {
  try {
  fs.unlinkSync(path.join(STORAGE_DIR, l.file_id));
  } catch (e) {}
  }
  db.prepare("DELETE FROM questions WHERE lesson_id = ?").run(l.id);
  db.prepare("DELETE FROM progress WHERE lesson_id = ?").run(l.id);
  db.prepare("SELECT file_id FROM materials WHERE lesson_id = ?")
.all(l.id)
.forEach((m) => {
  if (!m.file_id) return;
  try {
  fs.unlinkSync(path.join(STORAGE_DIR, m.file_id));
  } catch (e) {}
  });
  db.prepare("DELETE FROM materials WHERE lesson_id = ?").run(l.id);
  });
  db.prepare("DELETE FROM purchases WHERE lesson_id IN (SELECT id FROM lessons WHERE course_id = ?)").run(courseId);
  db.prepare("DELETE FROM lessons WHERE course_id = ?").run(courseId);
  db.prepare("DELETE FROM enrollments WHERE course_id = ?").run(courseId);
  db.prepare("DELETE FROM courses WHERE id = ?").run(courseId);
  redirect(res, "/admin");
  return;
  }

  if (!adminCourseMatch[2] && method === "POST") {
  const title = String(fields.title || "").trim();
  const description = String(fields.description || "").trim();
  const category = DIRECTION_IDS.includes(fields.category)
  ? fields.category
: course.category || "attestation";
  if (title) {
  db.prepare("UPDATE courses SET title = ?, description = ?, category = ? WHERE id = ?").run(
  title,
  description,
  category,
  courseId
  );
  }
  redirect(res, `/admin/course/${courseId}?saved=1`);
  return;
  }

  if (method === "GET") {
  const lessons = db
.prepare(
  `SELECT l.*, (SELECT COUNT(*) FROM questions q WHERE q.lesson_id = l.id) AS qcount
  FROM lessons l WHERE l.course_id = ? ORDER BY l.position, l.id`
  )
.all(courseId);

  const rows = lessons.length
  ? lessons
.map(
  (l, i) => `<tr id="lesson-${l.id}">
  <td>${i + 1}</td>
  <td><b>${h(l.title)}</b><br><small class="muted">${h(
  l.type === "pdf" ? l.file_name || "PDF": l.type === "video" ? l.video_url: ""
  )}</small>${Number(l.price) > 0 ? `<br><small class="muted">${formatSum(l.price)} so'm. PRO</small>`: ""}
  <details class="q-edit">
  <summary>Tahrirlash</summary>
  <form method="post" action="/admin/lesson/${l.id}/update" class="form" enctype="multipart/form-data" id="lesson-edit-${l.id}" data-video-upload data-video-upload-key="${l.id}">
  <div class="field"><label>Nomi</label><input name="title" value="${h(l.title)}" required></div>
  ${l.type === "video" ? `<div class="field"><label>Video havolasi</label><input name="video_url" value="${h(l.video_url || "")}" placeholder="https://youtu.be/... yoki https://.../video.mp4"><small class="muted">Yangi video fayl yuklansa, havola o‘rniga fayl ishlatiladi.</small></div>
  <input type="hidden" name="video_upload_id" id="video-upload-token-${l.id}" data-video-upload-id form="lesson-edit-${l.id}"><small class="muted">Hozirgi video: ${h(l.file_name || l.video_url || "mavjud emas")}. Yangi fayl tanlasangiz, joriy video almashtiriladi.</small>
  <div class="field"><label><input type="checkbox" name="remove_video" value="1"> Videoni olib tashlash</label><small class="muted">Yangi fayl yoki havola kiritilsa, olib tashlash belgisi e’tiborga olinmaydi.</small></div>
  <div class="field"><label>Video matni / transkript</label><textarea name="content" rows="5">${h(l.content || "")}</textarea></div>` : ""}
  ${
  l.type === "test"
  ? `<div class="grid two">
  <div class="field"><label>Ajratilgan vaqt (daqiqa)</label><input type="number" name="duration_min" min="1" max="180" value="${
  Number(l.duration_min) || 30
  }"></div>
  <div class="field"><label>Savollar soni</label><input type="number" name="question_count" min="0" max="500" value="${
  Number(l.question_count) || 20
  }"><small class="muted">0   haqiqiy savollar soni</small></div>
  <div class="field"><label>Eng yuqori ball</label><input type="number" name="max_score" min="0" max="1000" value="${
  Number(l.max_score) || 100
  }"></div>
  <div class="field"><label>Narx (so'm)</label><input type="number" name="price" min="0" step="1000" value="${
  Number(l.price) || 0
  }"><small class="muted">0   bepul</small></div>
  </div>`
: ""
  }
  <button class="btn btn-sm btn-primary" type="submit">Saqlash</button>
  </form>
  </details>
  </td>
  <td>${typeBadge(l.type)}${l.type === "video" ? `<div class="lesson-file-actions"><label class="btn btn-sm lesson-file-picker" for="lesson-video-file-${l.id}">Video yuklash</label><input type="file" class="lesson-file-input" id="lesson-video-file-${l.id}" data-video-file data-video-upload-key="${l.id}" form="lesson-edit-${l.id}" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v,.mkv"><button class="btn btn-sm" type="button" data-clear-video-for="${l.id}" hidden>Tanlovni olib tashlash</button><small class="muted" id="video-upload-status-${l.id}" data-video-status>${h(l.file_name || l.video_url || "Video tanlanmagan")}</small></div>` : ""}</td>
  <td>${l.type === "test" ? l.qcount : l.type === "video" ? lessons[i + 1]?.type === "test" ? `<a class="btn btn-sm" href="/admin/lesson/${lessons[i + 1].id}/questions">Test savollarini tahrirlash (${lessons[i + 1].qcount})</a>` : `<form method="post" action="/admin/lesson/${l.id}/add-test" class="inline"><button class="btn btn-sm btn-primary">Shu darsga test qo'shish</button></form>` : " "}</td>
  <td class="ta-right">
  ${l.type === "test" ? `<a class="btn btn-sm" href="/admin/lesson/${l.id}/questions">Savollar</a>`: ""}
  ${l.type === "test" ? `<a class="btn btn-sm" href="/admin/lesson/${l.id}/materials">Materiallar</a>`: ""}
  ${l.type === "test" && Number(l.price) > 0 ? `<a class="btn btn-sm" href="/admin/lesson/${l.id}/access">Ruxsat</a>`: ""}
  ${l.type === "test" ? `<form method="post" action="/admin/lesson/${l.id}/duplicate" class="inline"><input name="copies" type="number" min="1" max="19" value="1" aria-label="Nechta nusxa" title="Nechta nusxa" style="width:4.5rem;padding:.45rem .35rem"><button class="btn btn-sm" type="submit" title="Sozlamalarini nusxalab, savollarsiz yangi test darslari yaratadi">＋ Nusxa</button></form>`: ""}
  <form method="post" action="/admin/lesson/${l.id}/delete" class="inline" onsubmit="return confirm('Dars ochirilsinmi?')">
  <button class="btn btn-sm btn-danger" type="submit">O'chirish</button>
  </form>
  </td>
  </tr>`
  )
.join("")
: `<tr><td colspan="5" class="muted">Hozircha darslar yo'q.</td></tr>`;

  const body = `
  <a class="back" href="${author ? "/author" : "/admin"}">  ${author ? "Muallif paneli" : "Admin panel"}</a>
  <div class="page-head">
  <div><h1>${h(course.title)}</h1><p class="muted">${h(course.description || "")}</p></div>
  </div>
  ${url.searchParams.get("saved") === "1" ? alertBox("Saqlandi.", "success"): ""}
  ${url.searchParams.has("duplicated") ? alertBox(`${h(url.searchParams.get("duplicated") || "1")} ta test darsi nusxalandi. Savollarni alohida Excel fayllardan yuklang.`, "success"): ""}

  <div class="card" id="edit-course">
  <h2>Kurs nomini tahrirlash</h2>
  <form method="post" action="/admin/course/${course.id}" class="form">
  <div class="field"><label>Kurs nomi</label><input name="title" value="${h(course.title)}" required></div>
  <div class="field"><label>Tavsif</label><textarea name="description" rows="2">${h(
  course.description || ""
  )}</textarea></div>
  <div class="field">
  <label>Yo'nalish</label>
  <select name="category">
  ${[
   ["attestation", "Attestatsiya"],
   ["tkt", "TKT"],
  ]
.map(
  ([value, label]) =>
   `<option value="${value}"${(course.category || "attestation") === value ? " selected": ""}>${h(label)}</option>`
  )
.join("")}
  </select>
  </div>
  <button class="btn btn-primary" type="submit">Saqlash</button>
  </form>
  </div>

  <div class="card">
  <h2>Darslar</h2>
  <div class="table-wrap">
  <table>
  <thead><tr><th>#</th><th>Nomi</th><th>Turi</th><th>Savollar</th><th></th></tr></thead>
  <tbody>${rows}</tbody>
  </table>
  </div>
  </div>

  <div class="card" id="new-lesson">
  <h2>Yangi dars</h2>
  <form method="post" action="/admin/lesson" enctype="multipart/form-data" class="form" data-video-upload data-video-upload-key="new">
  <input type="hidden" name="course_id" value="${course.id}">
  <div class="field"><label>Dars nomi</label><input name="title" required placeholder="Masalan: Modul 1   Metodika"></div>
  <div class="field">
  <label>Dars turi</label>
  <select name="type" id="lessonType">
  <option value="text">Matn</option>
  <option value="pdf">PDF fayl</option>
  <option value="video">Video (havola)</option>
  <option value="test">Test</option>
  </select>
  </div>
  <div class="field" data-for="text,test">
  <label>Matn / o'qish matni</label>
  <textarea name="content" rows="6" placeholder="Dars matni yoki test uchun reading passage..."></textarea>
  </div>
  <div class="field" data-for="pdf">
  <label>PDF fayl (maks. ${config.maxUploadMb} MB)</label>
  <input type="file" name="file" accept="application/pdf,.pdf">
  </div>
  <div class="field" data-for="video">
  <label>Video havolasi</label>
  <input name="video_url" placeholder="https://youtu.be/... yoki https://.../video.mp4">
  <small class="muted">YouTube'da unlisted qilib qo'ying   havola orqali ko'rinadi.</small>
  </div>
  <div class="field" data-for="video"><label>Video dars matni / transkripti</label><textarea name="transcript" rows="6" placeholder="Videoda tushuntirilgan mavzu matni shu yerda ko'rinadi."></textarea></div>
  <div class="field" data-for="video">
  <label>Yoki video fayl tanlang (maks. 4 GB)</label>
  <input type="file" id="lessonVideoFile" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v,.mkv">
  <input type="hidden" name="video_upload_id" id="videoUploadId">
  <button class="btn btn-sm" type="button" id="clearVideoSelection" hidden>Tanlangan videoni olib tashlash</button>
  <small class="muted" id="videoUploadStatus">MP4 tavsiya etiladi. Video avtomatik qismlarga yuboriladi, 4 GB gacha.</small>
  </div>
  <div class="field" data-for="test">
  <label>Test davomiyligi (daqiqa)</label>
  <input type="number" name="duration_min" min="1" max="180" value="30">
  <small class="muted">Test yaratilgach, Savollar bo'limida savollarni qo'shasiz.</small>
  </div>
  <div class="field" data-for="test">
  <label>Narx (so'm)</label>
  <input type="number" name="price" min="0" step="1000" value="0">
  <small class="muted">0   bepul. Narx kiritilsa, test PRO bo'ladi va to'lovdan keyin ochiladi.</small>
  </div>
  <div class="field" data-for="test">
  <label>Maksimal ball</label>
  <input type="number" name="max_score" min="0" max="1000" value="100">
  </div>
  <div class="field" data-for="test">
  <label>E'lon qilinadigan savollar soni</label>
  <input type="number" name="question_count" min="0" max="500" value="20">
  <small class="muted">Video darsdan keyingi test uchun 20 ta savol kiriting.</small>
  </div>
  <button class="btn btn-primary" type="submit">Dars qo'shish</button>
  </form>
  <script>
  (function () {
  var type = document.getElementById('lessonType');
  function sync() {
  document.querySelectorAll('[data-for]').forEach(function (el) {
  el.style.display = el.getAttribute('data-for').split(',').indexOf(type.value) !== -1 ? '': 'none';
  });
  }
  type.addEventListener('change', sync);
  sync();
  document.querySelectorAll('form[data-video-upload]').forEach(function (lessonForm) {
    var uploadKey = lessonForm.getAttribute('data-video-upload-key') || 'new';
    var videoInput = lessonForm.querySelector('[data-video-file]') || document.getElementById(uploadKey === 'new' ? 'lessonVideoFile' : 'lesson-video-file-' + uploadKey);
    var uploadId = lessonForm.querySelector('[data-video-upload-id]') || document.getElementById(uploadKey === 'new' ? 'videoUploadId' : 'video-upload-token-' + uploadKey);
    var uploadStatus = lessonForm.querySelector('[data-video-status]') || document.getElementById(uploadKey === 'new' ? 'videoUploadStatus' : 'video-upload-status-' + uploadKey);
    var clearVideo = document.querySelector('[data-clear-video-for="' + uploadKey + '"]');
    if (!videoInput || !uploadId) return;
    var uploading = false;
    function syncClearVideo() { if (clearVideo) clearVideo.hidden = !((videoInput.files && videoInput.files.length) || uploadId.value); }
    if (clearVideo) clearVideo.addEventListener('click', function () {
      if (uploading) return;
      videoInput.value = ''; videoInput.disabled = false; uploadId.value = '';
      if (uploadStatus) uploadStatus.textContent = uploadKey === 'new' ? 'Video tanlanmagan. MP4 tavsiya etiladi.' : 'Video tanlanmagan.';
      syncClearVideo();
    });
    videoInput.addEventListener('change', function () {
      syncClearVideo();
      if (uploadStatus && videoInput.files && videoInput.files[0]) uploadStatus.textContent = 'Tanlandi: ' + videoInput.files[0].name + ' (' + Math.ceil(videoInput.files[0].size / 1048576) + ' MB)';
    });
    lessonForm.addEventListener('submit', async function (event) {
      var file = videoInput.files && videoInput.files[0];
      if ((uploadKey === 'new' && type.value !== 'video') || !file || uploadId.value || uploading) { if (uploading) event.preventDefault(); return; }
      event.preventDefault();
      if (file.size > ${MAX_VIDEO_UPLOAD}) { alert('Video hajmi 4 GB dan oshmasin.'); return; }
      uploading = true;
      var submit = lessonForm.querySelector('button[type="submit"]');
      if (submit) submit.disabled = true;
      if (uploadStatus) uploadStatus.textContent = 'Video yuklanmoqda: 0%';
      try {
        var initResponse = await fetch('/admin/video-upload/start', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ name: file.name, size: String(file.size) }).toString() });
        var initData = await initResponse.json();
        if (!initResponse.ok) throw new Error(initData.error || 'Video yuklashni boshlash amalga oshmadi.');
        var offset = 0;
        while (offset < file.size) {
          var part = file.slice(offset, Math.min(offset + initData.chunkSize, file.size));
          var partResponse = await fetch('/admin/video-upload/' + initData.token + '?offset=' + offset, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: part });
          var partData = await partResponse.json();
          if (!partResponse.ok) throw new Error(partData.error || 'Video bo‘lagini serverga yuborib bo‘lmadi (HTTP ' + partResponse.status + ').');
          offset = partData.offset;
          if (uploadStatus) uploadStatus.textContent = 'Video yuklanmoqda: ' + Math.floor(offset / file.size * 100) + '%';
        }
        uploadId.value = initData.token;
        videoInput.disabled = true;
        uploading = false;
        if (uploadStatus) uploadStatus.textContent = 'Video yuklandi. Dars saqlanmoqda...';
        lessonForm.submit();
      } catch (error) {
        uploading = false;
        if (submit) submit.disabled = false;
        if (uploadStatus) uploadStatus.textContent = 'Yuklash tugamadi. Tanlangan faylni “Tanlovni olib tashlash” tugmasi bilan tozalab, yana urinib ko‘ring.';
        syncClearVideo();
        alert(error && error.message ? error.message : 'Video yuklanmadi.');
      }
    });
  });
  })();
  </script>
  </div>`;
  send(res, 200, layout({ title: course.title, body, admin }));
  return;
  }
  }

  if (p === "/admin/lesson" && method === "POST") {
  if (!contentManager) return redirect(res, "/admin/login");
  const courseId = Number(fields.course_id);
  const course = db.prepare("SELECT * FROM courses WHERE id = ?").get(courseId);
  if (!course) return redirect(res, "/admin");

  const title = String(fields.title || "").trim();
  const type = String(fields.type || "text");
  if (!title || !["text", "pdf", "video", "test"].includes(type)) {
  redirect(res, `/admin/course/${courseId}?err=invalid`);
  return;
  }

  let content = String(fields.content || "").trim();
  if (type === "video") content = String(fields.transcript || "").trim();
  let videoUrl = String(fields.video_url || "").trim();
  let fileId = "";
  let fileName = "";
  let fileSize = 0;

  if (type === "pdf") {
  const file = files.file;
  if (!file || !file.size) {
  redirect(res, `/admin/course/${courseId}?err=nofile`);
  return;
  }
  if (file.size > MAX_UPLOAD) {
  redirect(res, `/admin/course/${courseId}?err=big`);
  return;
  }
  const isPdf =
  file.type === "application/pdf" ||
  (file.buffer.length > 4 && file.buffer.slice(0, 4).toString() === "%PDF");
  if (!isPdf) {
  redirect(res, `/admin/course/${courseId}?err=notpdf`);
  return;
  }
  fileId = `${randomBytes(12).toString("hex")}.pdf`;
  fs.writeFileSync(path.join(STORAGE_DIR, fileId), file.buffer);
  fileName = file.name;
  fileSize = file.size;
  }

  if (type === "video") {
  const videoFile = files.video;
  const uploadToken = String(fields.video_upload_id || "");
  if (uploadToken) {
  const upload = videoUploadSessions.get(uploadToken);
  if (!upload || upload.offset !== upload.size) {
  redirect(res, `/admin/course/${courseId}?err=video_upload`);
  return;
  }
  const ext = path.extname(upload.name).toLowerCase();
  if (![".mp4", ".webm", ".mov", ".m4v", ".mkv"].includes(ext)) {
  redirect(res, `/admin/course/${courseId}?err=notvideo`);
  return;
  }
  fileId = `${randomBytes(12).toString("hex")}${ext}`;
  fs.renameSync(upload.path, path.join(STORAGE_DIR, fileId));
  fileName = upload.name;
  fileSize = upload.size;
  videoUrl = "";
  videoUploadSessions.delete(uploadToken);
  } else if (videoFile && videoFile.size) {
  const ext = (path.extname(videoFile.name || "") || ".mp4").toLowerCase();
  const allowed = [".mp4", ".webm", ".mov", ".m4v", ".mkv"];
  if (!allowed.includes(ext) || !/^video\//i.test(String(videoFile.type || ""))) {
  redirect(res, `/admin/course/${courseId}?err=notvideo`);
  return;
  }
  if (videoFile.size > MAX_VIDEO_UPLOAD) {
  redirect(res, `/admin/course/${courseId}?err=big`);
  return;
  }
  fileId = `${randomBytes(12).toString("hex")}${ext}`;
  fs.writeFileSync(path.join(STORAGE_DIR, fileId), videoFile.buffer);
  fileName = videoFile.name;
  fileSize = videoFile.size;
  videoUrl = "";
  }
  }

  if (type === "video" && !fileId && videoUrl && !/^https?:\/\//i.test(videoUrl)) {
  redirect(res, `/admin/course/${courseId}?err=badurl`);
  return;
  }

  const position = db
.prepare("SELECT COALESCE(MAX(position), 0) + 1 AS n FROM lessons WHERE course_id = ?")
.get(courseId).n;

  const durationMin = Math.min(180, Math.max(1, Number(fields.duration_min) || 30));
  const price = type === "test" ? Math.max(0, Math.round(Number(fields.price) || 0)): 0;
  const isPro = price > 0 ? 1: 0;
  const maxScore = type === "test" ? Math.min(1000, Math.max(0, Number(fields.max_score) || 100)): 0;
  const questionCount = type === "test" ? Math.min(500, Math.max(0, Number(fields.question_count) || 20)): 0;

  const info = db
.prepare(
  `INSERT INTO lessons
  (course_id, title, type, content, video_url, file_id, file_name, file_size, duration_min, price, is_pro, max_score, question_count, position, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
.run(
  courseId,
  title,
  type,
  content,
  videoUrl,
  fileId,
  fileName,
  fileSize,
  durationMin,
  price,
  isPro,
  maxScore,
  questionCount,
  position,
  nowISO()
  );

  const lessonId = Number(info.lastInsertRowid);
  if (type === "test") redirect(res, `/admin/lesson/${lessonId}/questions`);
  else redirect(res, `/admin/course/${courseId}`);
  return;
  }

  const duplicateLessonMatch = p.match(/^\/admin\/lesson\/(\d+)\/duplicate$/);
  if (duplicateLessonMatch && method === "POST") {
    if (!contentManager) return redirect(res, "/admin/login");
    const source = db.prepare("SELECT * FROM lessons WHERE id = ? AND type = 'test'").get(Number(duplicateLessonMatch[1]));
    if (!source) return redirect(res, "/admin");

    const copies = Math.min(19, Math.max(1, Math.floor(Number(fields.copies) || 1)));
    const baseTitle = (String(source.title || "Test").trim().replace(/\s+\(\d+\)$/, "") || "Test").slice(0, 180);
    const price = Math.max(0, Number(source.price) || 0);
    const existingTitles = new Set(db.prepare("SELECT title FROM lessons WHERE course_id = ?").all(source.course_id)
      .map((row) => String(row.title || "").trim()));
    let copyNo = 2;
    let position = Number(db.prepare("SELECT COALESCE(MAX(position), 0) + 1 AS n FROM lessons WHERE course_id = ?")
      .get(source.course_id).n);
    let lastCopyId = 0;
    const insertCopy = db.prepare(
      `INSERT INTO lessons
       (course_id, title, type, content, video_url, file_id, file_name, file_size, duration_min, price, is_pro, max_score, question_count, position, created_at)
       VALUES (?, ?, 'test', '', '', '', '', 0, ?, ?, ?, ?, ?, ?, ?)`
    );
    db.exec("BEGIN IMMEDIATE");
    try {
      for (let i = 0; i < copies; i += 1) {
        let title = `${baseTitle} (${copyNo})`;
        while (existingTitles.has(title)) {
          copyNo += 1;
          title = `${baseTitle} (${copyNo})`;
        }
        copyNo += 1;
        existingTitles.add(title);
        const info = insertCopy.run(
          source.course_id,
          title,
          Math.min(180, Math.max(1, Number(source.duration_min) || 30)),
          price,
          price > 0 ? 1 : 0,
          Math.min(1000, Math.max(0, Number(source.max_score) || 100)),
          Math.min(500, Math.max(0, Number(source.question_count) || 20)),
          position,
          nowISO()
        );
        lastCopyId = Number(info.lastInsertRowid);
        position += 1;
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return redirect(res, `/admin/course/${source.course_id}?duplicated=${copies}#lesson-${lastCopyId}`);
  }

  const addVideoTestMatch = p.match(/^\/admin\/lesson\/(\d+)\/add-test$/);
  if (addVideoTestMatch && method === "POST") {
    if (!contentManager) return redirect(res, "/admin/login");
    const video = db.prepare("SELECT * FROM lessons WHERE id = ? AND type = 'video'").get(Number(addVideoTestMatch[1]));
    if (!video) return redirect(res, "/admin");
    const immediateNext = db.prepare("SELECT id, type FROM lessons WHERE course_id = ? AND (position > ? OR (position = ? AND id > ?)) ORDER BY position, id LIMIT 1")
      .get(video.course_id, video.position, video.position, video.id);
    if (immediateNext?.type === "test") return redirect(res, "/admin/lesson/" + immediateNext.id + "/questions");
    db.exec("BEGIN IMMEDIATE");
    let testId;
    try {
      db.prepare("UPDATE lessons SET position = position + 1 WHERE course_id = ? AND position > ?").run(video.course_id, video.position);
      const title = (video.title + " - Test").slice(0, 200);
      const info = db.prepare("INSERT INTO lessons (course_id, title, type, content, video_url, duration_min, position, price, is_pro, max_score, question_count, created_at) VALUES (?, ?, 'test', '', '', 20, ?, 0, 0, 100, 20, ?)")
        .run(video.course_id, title, video.position + 1, nowISO());
      testId = Number(info.lastInsertRowid);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return redirect(res, "/admin/lesson/" + testId + "/questions");
  }

  const adminLessonMatch = p.match(/^\/admin\/lesson\/(\d+)(\/questions|\/sections|\/rename|\/update|\/delete|\/access|\/materials|\/about)?$/);
  if (adminLessonMatch) {
  if (!contentManager || (author && adminLessonMatch[2] === "/access")) return redirect(res, author ? "/author" : "/admin/login");
  const lesson = db.prepare("SELECT * FROM lessons WHERE id = ?").get(Number(adminLessonMatch[1]));
  if (!lesson) return notFound(res, user, admin);

  if ((adminLessonMatch[2] === "/rename" || adminLessonMatch[2] === "/update") && method === "POST") {
  const title = String(fields.title || "").trim();
  if (title) db.prepare("UPDATE lessons SET title = ? WHERE id = ?").run(title, lesson.id);
  if (adminLessonMatch[2] === "/update" && lesson.type === "video") {
    let nextFileId = lesson.file_id || "";
    let nextFileName = lesson.file_name || "";
    let nextFileSize = Number(lesson.file_size) || 0;
    let nextVideoUrl = lesson.video_url || "";
    const uploadToken = String(fields.video_upload_id || "");
    const upload = uploadToken ? videoUploadSessions.get(uploadToken) : null;
    if (uploadToken && (!upload || upload.offset !== upload.size)) return redirect(res, `/admin/course/${lesson.course_id}?err=video_upload`);
    if (upload) {
      const ext = path.extname(upload.name).toLowerCase();
      if (![".mp4", ".webm", ".mov", ".m4v", ".mkv"].includes(ext)) return redirect(res, `/admin/course/${lesson.course_id}?err=notvideo`);
      nextFileId = `${randomBytes(12).toString("hex")}${ext}`;
      fs.renameSync(upload.path, path.join(STORAGE_DIR, nextFileId));
      nextFileName = upload.name;
      nextFileSize = upload.size;
      nextVideoUrl = "";
      videoUploadSessions.delete(uploadToken);
    } else if (String(fields.video_url || "").trim()) {
      nextVideoUrl = String(fields.video_url).trim();
      if (!/^https?:\/\//i.test(nextVideoUrl)) return redirect(res, `/admin/course/${lesson.course_id}?err=badurl`);
      nextFileId = ""; nextFileName = ""; nextFileSize = 0;
    } else if (String(fields.remove_video || "") === "1") {
      nextVideoUrl = ""; nextFileId = ""; nextFileName = ""; nextFileSize = 0;
    }
    db.prepare("UPDATE lessons SET content = ?, video_url = ?, file_id = ?, file_name = ?, file_size = ? WHERE id = ?")
      .run(String(fields.content || "").trim(), nextVideoUrl, nextFileId, nextFileName, nextFileSize, lesson.id);
    if (lesson.file_id && lesson.file_id !== nextFileId) {
      try { fs.unlinkSync(path.join(STORAGE_DIR, lesson.file_id)); } catch (e) {}
    }
  }
  if (adminLessonMatch[2] === "/update" && lesson.type === "test") {
  const duration = Math.min(180, Math.max(1, Number(fields.duration_min) || lesson.duration_min || 30));
  const qcount = Math.min(500, Math.max(0, Number(fields.question_count) || 20));
  const maxScore = Math.min(1000, Math.max(0, Number(fields.max_score) || 0));
  const price = Math.max(0, Math.round(Number(fields.price) || 0));
  db.prepare(
  "UPDATE lessons SET duration_min = ?, question_count = ?, max_score = ?, price = ?, is_pro = ? WHERE id = ?"
  ).run(duration, qcount, maxScore, price, price > 0 ? 1: 0, lesson.id);
  }
  redirect(res, `/admin/course/${lesson.course_id}?saved=1`);
  return;
  }

  if (adminLessonMatch[2] === "/delete" && method === "POST") {
  if (lesson.file_id) {
  try {
  fs.unlinkSync(path.join(STORAGE_DIR, lesson.file_id));
  } catch (e) {}
  }
  db.prepare("DELETE FROM questions WHERE lesson_id = ?").run(lesson.id);
  db.prepare("DELETE FROM test_sections WHERE lesson_id = ?").run(lesson.id);
  db.prepare("DELETE FROM progress WHERE lesson_id = ?").run(lesson.id);
  db.prepare("DELETE FROM purchases WHERE lesson_id = ?").run(lesson.id);
  db.prepare("SELECT file_id FROM materials WHERE lesson_id = ?")
.all(lesson.id)
.forEach((m) => {
  if (!m.file_id) return;
  try {
  fs.unlinkSync(path.join(STORAGE_DIR, m.file_id));
  } catch (e) {}
  });
  db.prepare("DELETE FROM materials WHERE lesson_id = ?").run(lesson.id);
  db.prepare("DELETE FROM lessons WHERE id = ?").run(lesson.id);
  redirect(res, `/admin/course/${lesson.course_id}`);
  return;
  }

  if (adminLessonMatch[2] === "/about" && method === "POST") {
  const about = String(fields.about || "").trim();
  db.prepare("UPDATE lessons SET about = ? WHERE id = ?").run(about, lesson.id);
  redirect(res, `/admin/lesson/${lesson.id}/materials?saved=1`);
  return;
  }

  if (adminLessonMatch[2] === "/materials" && method === "POST") {
  const title = String(fields.title || "").trim();
  const type = ["pdf", "link", "text"].includes(fields.type) ? fields.type: "link";
  const urlValue = String(fields.url || "").trim();
  const bodyValue = String(fields.body || "").trim();
  let fileId = "";
  let fileName = "";
  let fileSize = 0;

  const fail = (code) => redirect(res, `/admin/lesson/${lesson.id}/materials?err=${code}`);

  if (!title) return fail("title");
  if (type === "pdf") {
  const file = files.file;
  if (!file || !file.size) return fail("nofile");
  if (file.size > MAX_UPLOAD) return fail("big");
  const isPdf =
  file.type === "application/pdf" ||
  (file.buffer.length > 4 && file.buffer.subarray(0, 4).toString() === "%PDF");
  if (!isPdf) return fail("notpdf");
  fileId = `${randomBytes(12).toString("hex")}.pdf`;
  fs.writeFileSync(path.join(STORAGE_DIR, fileId), file.buffer);
  fileName = file.name;
  fileSize = file.size;
  } else if (type === "link") {
  if (!/^https?:\/\//i.test(urlValue)) return fail("badurl");
  } else if (!bodyValue) {
  return fail("body");
  }

  db.prepare(
  `INSERT INTO materials (lesson_id, title, type, url, file_id, file_name, file_size, body, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(lesson.id, title, type, type === "link" ? urlValue: "", fileId, fileName, fileSize, bodyValue, nowISO());
  redirect(res, `/admin/lesson/${lesson.id}/materials?saved=1`);
  return;
  }

  if (adminLessonMatch[2] === "/materials" && method === "GET") {
  const materials = db.prepare("SELECT * FROM materials WHERE lesson_id = ? ORDER BY id").all(lesson.id);
  const err = url.searchParams.get("err");
  const errText =
  {
  title: "Material sarlavhasini kiriting.",
  nofile: "PDF faylni tanlang.",
  big: "Fayl hajmi juda katta.",
  notpdf: "Faqat PDF fayl yuklash mumkin.",
  badurl: "Havola http:// yoki https:// bilan boshlanishi kerak.",
  body: "Matn kiriting."
  }[err] || "";

  const list = materials.length
  ? materials
.map(
  (m) => `<div class="material-admin-row">
  <span class="material-ico">${icon(m.type === "pdf" ? "file": m.type === "link" ? "link": "book")}</span>
  <div class="material-main">
  <b>${h(m.title)}</b>
  <small class="muted">${m.type === "pdf" ? `PDF. ${formatSize(m.file_size)}`: m.type === "link" ? h(m.url): "Matn"}</small>
  </div>
  <form method="post" action="/admin/material/${m.id}/delete" class="inline" onsubmit="return confirm('Material ochirilsinmi?')">
  <button class="btn btn-sm btn-danger" type="submit">O'chirish</button>
  </form>
  </div>`
  )
.join("")
: `<p class="muted">Hozircha material yo'q.</p>`;

  const body = `
  <a class="back" href="/admin/course/${lesson.course_id}">  Kurs</a>
  <div class="page-head">
  <div><h1>${h(lesson.title)}</h1><p class="muted">Test paneli. tavsif va materiallar</p></div>
  </div>
  ${url.searchParams.get("saved") ? alertBox("Saqlandi.", "success"): ""}
  ${errText ? alertBox(errText): ""}

  <div class="card">
  <h2>Test tavsifi</h2>
  <p class="muted small">Bu matn test sahifasidagi Test haqida bo'limida ko'rinadi.</p>
  <form method="post" action="/admin/lesson/${lesson.id}/about" class="form">
  <div class="field"><textarea name="about" rows="5" placeholder="Test haqida qisqa ma'lumot...">${h(lesson.about || "")}</textarea></div>
  <button class="btn btn-primary" type="submit">Tavsifni saqlash</button>
  </form>
  </div>

  <div class="card">
  <div class="card-head"><h2>Materiallar</h2><a class="btn btn-sm" href="/admin/lesson/${lesson.id}/questions">Savollar</a></div>
  <div class="material-admin-list">${list}</div>

  <h3 style="margin-top:22px">Yangi material</h3>
  <form method="post" action="/admin/lesson/${lesson.id}/materials" enctype="multipart/form-data" class="form">
  <input type="hidden" name="action" value="add">
  <div class="field"><label>Sarlavha</label><input name="title" required placeholder="Masalan: Reading qo'llanma"></div>
  <div class="field">
  <label>Turi</label>
  <select name="type" id="materialType">
  <option value="pdf">PDF fayl</option>
  <option value="link">Havola</option>
  <option value="text">Matn</option>
  </select>
  </div>
  <div class="field" data-mfor="pdf">
  <label>PDF fayl (maks. ${config.maxUploadMb} MB)</label>
  <input type="file" name="file" accept="application/pdf,.pdf">
  </div>
  <div class="field" data-mfor="link">
  <label>Havola</label>
  <input name="url" placeholder="https://...">
  </div>
  <div class="field" data-mfor="text">
  <label>Matn</label>
  <textarea name="body" rows="5" placeholder="Material matni..."></textarea>
  </div>
  <button class="btn btn-primary" type="submit">Material qo'shish</button>
  </form>
  <script>
  (function () {
  var type = document.getElementById('materialType');
  function sync() {
  document.querySelectorAll('[data-mfor]').forEach(function (el) {
  el.style.display = el.getAttribute('data-mfor') === type.value ? '': 'none';
  });
  }
  type.addEventListener('change', sync);
  sync();
  })();
  </script>
  </div>`;
  send(res, 200, layout({ title: "Test paneli", body, admin }));
  return;
  }

  if (adminLessonMatch[2] === "/access" && method === "POST") {
  const userId = Number(fields.user_id);
  if (userId) {
  if (fields.action === "remove") {
  db.prepare("DELETE FROM purchases WHERE user_id = ? AND lesson_id = ?").run(userId, lesson.id);
  } else {
  db.prepare("INSERT OR IGNORE INTO purchases (user_id, lesson_id, created_at) VALUES (?, ?, ?)").run(
  userId,
  lesson.id,
  nowISO()
  );
  }
  }
  redirect(res, `/admin/lesson/${lesson.id}/access`);
  return;
  }

  if (adminLessonMatch[2] === "/access" && method === "GET") {
  const users = db.prepare("SELECT id, name, phone FROM users ORDER BY name").all();
  const owned = new Set(
  db
.prepare("SELECT user_id FROM purchases WHERE lesson_id = ?")
.all(lesson.id)
.map((r) => r.user_id)
  );
  const rows = users.length
  ? users
.map(
  (u) => `<tr>
  <td><b>${h(u.name)}</b><br><small class="muted">${h(u.phone)}</small></td>
  <td>${owned.has(u.id) ? `<span class="badge done">Ochilgan</span>`: `<span class="muted"> </span>`}</td>
  <td class="ta-right">
  <form method="post" action="/admin/lesson/${lesson.id}/access" class="inline">
  <input type="hidden" name="user_id" value="${u.id}">
  <input type="hidden" name="action" value="${owned.has(u.id) ? "remove": "add"}">
  <button class="btn btn-sm ${owned.has(u.id) ? "btn-danger": "btn-primary"}" type="submit">${
  owned.has(u.id) ? "Yopish": "Ochish"
  }</button>
  </form>
  </td>
  </tr>`
  )
.join("")
: `<tr><td colspan="3" class="muted">Hozircha o'quvchilar yo'q.</td></tr>`;

  const body = `
  <a class="back" href="/admin/course/${lesson.course_id}">  Kurs</a>
  <div class="page-head">
  <div><h1>${h(lesson.title)}</h1><p class="muted">Test narxi: ${formatSum(lesson.price)} so'm. PRO ruxsatlar</p></div>
  </div>
  <div class="card">
  <h2>Kimga ochilgan</h2>
  <div class="table-wrap">
  <table>
  <thead><tr><th>O'quvchi</th><th>Holat</th><th></th></tr></thead>
  <tbody>${rows}</tbody>
  </table>
  </div>
  </div>`;
  send(res, 200, layout({ title: "Ruxsatlar", body, admin }));
  return;
  }

  if (adminLessonMatch[2] === "/questions" && method === "GET") {
  const questions = db.prepare("SELECT * FROM questions WHERE lesson_id = ? ORDER BY id").all(lesson.id);
  const sectionCount = db
.prepare("SELECT COUNT(*) AS n FROM test_sections WHERE lesson_id = ?")
.get(lesson.id).n;
  const list = questions.length
  ? questions
.map(
  (q, i) => `<div class="question-item">
  <div><b>${i + 1}. ${h(q.text)}</b>${String(q.passage || "").trim() ? ` <span class="badge done">matn</span>`: ""}</div>
  <div class="muted small">To'g'ri javob: ${q.correct}) ${h(q["o" + q.correct])}</div>
  <details class="q-edit">
  <summary>Tahrirlash</summary>
  <form method="post" action="/admin/question/${q.id}/update" class="form" data-bulk-save>
  <div class="field"><label>Savol matni</label><input name="text" value="${h(q.text)}" required></div>
  <div class="grid two">
  <div class="field"><label>1-variant</label><input name="o1" value="${h(q.o1)}" required></div>
  <div class="field"><label>2-variant</label><input name="o2" value="${h(q.o2)}" required></div>
  <div class="field"><label>3-variant</label><input name="o3" value="${h(q.o3)}" required></div>
  <div class="field"><label>4-variant</label><input name="o4" value="${h(q.o4)}" required></div>
  </div>
  <div class="field">
  <label>To'g'ri javob</label>
  <select name="correct">
  ${[1, 2, 3, 4]
.map(
  (n) =>
  `<option value="${n}"${Number(q.correct) === n ? " selected": ""}>${n}-variant</option>`
  )
.join("")}
  </select>
  </div>
  </div>
  <div class="field"><label>Matn (savol yonida chiqadigan passage)</label><textarea name="passage" rows="5" placeholder="Bo'sh bo'lsa bo'lim matni yoki umumiy matn ishlatiladi">${h(q.passage || "")}</textarea></div>
  <button class="btn btn-primary btn-sm" type="submit">Saqlash</button>
  </form>
  </details>
  <form method="post" action="/admin/question/${q.id}/delete" class="inline" onsubmit="return confirm('Savol ochirilsinmi?')">
  <button class="btn btn-sm btn-danger" type="submit">O'chirish</button>
  </form>
  </div>`
  )
.join("")
: `<p class="muted">Hozircha savollar yo'q.</p>`;

  const body = `
  <a class="back" href="/admin/course/${lesson.course_id}">  Kurs</a>
  <div class="page-head">
  <div><h1>${h(lesson.title)}</h1><p class="muted">Test savollari. ${questions.length} ta</p></div>
  <div class="actions"><a class="btn btn-ghost btn-sm" href="/admin/lesson/${lesson.id}/sections">Bo'limlar va matnlar${
  sectionCount ? ` (${sectionCount})`: ""
  }</a></div>
  </div>
  ${adminBulkSaveBar("savol", questions.length)}
  ${
  url.searchParams.get("imported")
  ? alertBox(`${url.searchParams.get("imported")} ta savol muvaffaqiyatli qo'shildi.`, "success")
: ""
  }
  ${
  url.searchParams.get("err")
  ? alertBox(
  {
  nofile: "Fayl tanlanmadi.",
  format: "Faqat.xlsx yoki.docx fayl qabul qilinadi.",
  empty: "Fayldan savollar topilmadi. Formatni tekshiring."
  }[url.searchParams.get("err")] || "Yuklashda xatolik.",
  "error"
  )
: ""
  }
  <div class="card"><div class="question-list">${list}</div></div>
  <div class="card">
  <h2>Yangi savol</h2>
  <form method="post" action="/admin/lesson/${lesson.id}/question" class="form">
  <div class="field"><label>Savol matni</label><input name="text" required></div>
  <div class="grid two">
  <div class="field"><label>1-variant</label><input name="o1" required></div>
  <div class="field"><label>2-variant</label><input name="o2" required></div>
  <div class="field"><label>3-variant</label><input name="o3" required></div>
  <div class="field"><label>4-variant</label><input name="o4" required></div>
  </div>
  <div class="field">
  <label>To'g'ri javob</label>
  <select name="correct">
  <option value="1">1-variant</option>
  <option value="2">2-variant</option>
  <option value="3">3-variant</option>
  <option value="4">4-variant</option>
  </select>
  </div>
  <div class="field"><label>Matn (ixtiyoriy   savol yonida chiqadi)</label><textarea name="passage" rows="5" placeholder="Passage matni. Bo'sh qoldirsangiz   bo'lim matni yoki birinchi 15 savol uchun umumiy matn."></textarea></div>
  <button class="btn btn-primary" type="submit">Savol qo'shish</button>
  </form>
  </div>

  <div class="card">
  <h2>Excel / Word dan yuklash</h2>
  <p class="muted small">Tayyor savollarni <b>.xlsx</b> yoki <b>.docx</b> fayldan bir marta yuklab, testni to'ldirish mumkin. Maksimal 500 savol.</p>
  <div class="actions" style="margin-bottom:14px">
  <a class="btn btn-ghost btn-sm" href="/admin/template/xlsx">x  Namuna Excel faylni yuklab olish</a>
  </div>
  <form method="post" action="/admin/lesson/${lesson.id}/import" enctype="multipart/form-data" class="form">
  <div class="field">
  <label>Fayl (.xlsx yoki.docx)</label>
  <input type="file" name="file" accept=".xlsx,.docx" required>
  </div>
  <button class="btn btn-primary" type="submit">Yuklash</button>
  </form>
  <details class="q-edit">
  <summary>Fayl formati qanday bo'lishi kerak?</summary>
  <p class="muted small"><b>Excel:</b> birinchi qator sarlavha   <b>Savol | A | B | C | D | Javob | Matn</b>. Javob ustuniga A/B/C/D yoki 1 4 yoziladi. Matn ustuni ixtiyoriy.</p>
  <p class="muted small"><b>Word:</b> har bir savol shunday yoziladi:</p>
  <p class="muted small" style="white-space:pre-line">1. Savol matni
A) birinchi variant
B) ikkinchi variant
C) uchinchi variant
D) to'rtinchi variant
Javob: B
Matn: passage matni (ixtiyoriy)</p>
  </details>
  </div>`;
  send(res, 200, layout({ title: "Test savollari", body, admin }));
  return;
  }

  if (adminLessonMatch[2] === "/sections" && method === "GET") {
  const secs = db
.prepare("SELECT * FROM test_sections WHERE lesson_id = ? ORDER BY position, id")
.all(lesson.id);
  const qcount = db.prepare("SELECT COUNT(*) AS n FROM questions WHERE lesson_id = ?").get(lesson.id).n;
  const list = secs.length
  ? secs
.map(
  (s, i) => `<div class="card section-item">
  <form method="post" action="/admin/section/${s.id}" class="form" data-bulk-save>
  <div class="grid two">
  <div class="field"><label>Bo'lim nomi</label><input name="title" value="${h(s.title)}" required></div>
  <div class="field"><label>Savollar oralig'i</label>
  <div class="range-row">
  <input name="from_no" type="number" min="1" value="${s.from_no}" required>
  <span class="muted"> </span>
  <input name="to_no" type="number" min="0" value="${s.to_no}">
  </div>
  <small class="muted">0 = oxirgi savolgacha</small>
  </div>
  </div>
  <div class="field"><label>Matn (shu bo'lim savollari yonida chiqadi)</label>
  <textarea name="passage" rows="6" placeholder="Bo'sh bo'lsa matn ko'rsatilmaydi">${h(s.passage || "")}</textarea>
  </div>
  <div class="actions">
  <button class="btn btn-primary btn-sm" type="submit">Saqlash</button>
  <span class="muted small">${i + 1}-bo'lim</span>
  </div>
  </form>
  <form method="post" action="/admin/section/${s.id}/delete" class="inline" onsubmit="return confirm('Bolim ochirilsinmi? Savollar ochmaydi.')">
  <button class="btn btn-sm btn-danger" type="submit">Bo'limni o'chirish</button>
  </form>
  </div>`
  )
.join("")
: `<p class="muted">Hozircha bo'limlar sozlanmagan. Standart: 1 35 va 36 oxiri.</p>`;

  const body = `
  <a class="back" href="/admin/lesson/${lesson.id}/questions">  Savollar</a>
  <div class="page-head"><div><h1>${h(lesson.title)}</h1><p class="muted">Bo'limlar va matnlar. ${qcount} savol</p></div></div>
  ${adminBulkSaveBar("bo'lim", secs.length)}
  <div class="card">
  <b>Qanday ishlaydi?</b>
  <p class="muted small">Har bir bo'lim uchun savollar oralig'ini va matnni belgilang. Shu oraliqdagi savollarda matn chap tomonda, savol o'ng tomonda chiqadi. Matn kiritilmagan bo'limlar oddiy test ko'rinishida bo'ladi. Savolga alohida matn ham qo'shish mumkin   u bo'lim matnidan ustun turadi.</p>
  </div>
  ${list}
  <div class="card">
  <h2>Yangi bo'lim</h2>
  <form method="post" action="/admin/lesson/${lesson.id}/section" class="form">
  <div class="grid two">
  <div class="field"><label>Bo'lim nomi</label><input name="title" placeholder="1-bosqich. Mutaxassislik fani" required></div>
  <div class="field"><label>Savollar oralig'i</label>
  <div class="range-row">
  <input name="from_no" type="number" min="1" value="1" required>
  <span class="muted"> </span>
  <input name="to_no" type="number" min="0" value="0">
  </div>
  <small class="muted">0 = oxirgi savolgacha</small>
  </div>
  </div>
  <div class="field"><label>Matn (ixtiyoriy)</label><textarea name="passage" rows="6" placeholder="Masalan, birinchi 15 savol uchun umumiy matn"></textarea></div>
  <button class="btn btn-primary" type="submit">Bo'lim qo'shish</button>
  </form>
  </div>`;
  send(res, 200, layout({ title: "Bo'limlar", body, admin }));
  return;
  }
  }

  if (p.match(/^\/admin\/lesson\/\d+\/question$/) && method === "POST") {
  if (!contentManager) return redirect(res, "/admin/login");
  const lessonId = Number(p.split("/")[3]);
  const lesson = db.prepare("SELECT * FROM lessons WHERE id = ?").get(lessonId);
  if (!lesson) return redirect(res, "/admin");

  const text = String(fields.text || "").trim();
  const o1 = String(fields.o1 || "").trim();
  const o2 = String(fields.o2 || "").trim();
  const o3 = String(fields.o3 || "").trim();
  const o4 = String(fields.o4 || "").trim();
  const correct = Math.min(4, Math.max(1, Number(fields.correct) || 1));
  const passage = String(fields.passage || "").trim();

  if (text && o1 && o2 && o3 && o4) {
  db.prepare(
  "INSERT INTO questions (lesson_id, text, o1, o2, o3, o4, correct, passage) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(lessonId, text, o1, o2, o3, o4, correct, passage);
  }
  redirect(res, `/admin/lesson/${lessonId}/questions`);
  return;
  }

  const questionUpdate = p.match(/^\/admin\/question\/(\d+)\/update$/);
  if (questionUpdate && method === "POST") {
  if (!contentManager) return redirect(res, "/admin/login");
  const q = db.prepare("SELECT * FROM questions WHERE id = ?").get(Number(questionUpdate[1]));
  if (!q) return redirect(res, "/admin");
  const text = String(fields.text || "").trim();
  const o1 = String(fields.o1 || "").trim();
  const o2 = String(fields.o2 || "").trim();
  const o3 = String(fields.o3 || "").trim();
  const o4 = String(fields.o4 || "").trim();
  const correct = Math.min(4, Math.max(1, Number(fields.correct) || 1));
  const passage = String(fields.passage || "").trim();
  if (text && o1 && o2 && o3 && o4) {
  db.prepare(
  "UPDATE questions SET text = ?, o1 = ?, o2 = ?, o3 = ?, o4 = ?, correct = ?, passage = ? WHERE id = ?"
  ).run(text, o1, o2, o3, o4, correct, passage, q.id);
  }
  redirect(res, `/admin/lesson/${q.lesson_id}/questions`);
  return;
  }

  const sectionAdd = p.match(/^\/admin\/lesson\/(\d+)\/section$/);
  if (sectionAdd && method === "POST") {
  if (!contentManager) return redirect(res, "/admin/login");
  const lessonId = Number(sectionAdd[1]);
  const lesson = db.prepare("SELECT * FROM lessons WHERE id = ?").get(lessonId);
  if (!lesson) return redirect(res, "/admin");
  const title = String(fields.title || "").trim() || "Bo'lim";
  const fromNo = Math.max(1, Number(fields.from_no) || 1);
  const toNo = Math.max(0, Number(fields.to_no) || 0);
  const passage = String(fields.passage || "").trim();
  const position =
  db.prepare("SELECT COALESCE(MAX(position), 0) + 1 AS n FROM test_sections WHERE lesson_id = ?").get(lessonId)
.n || 1;
  db.prepare(
  "INSERT INTO test_sections (lesson_id, title, from_no, to_no, passage, position) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(lessonId, title, fromNo, toNo, passage, position);
  redirect(res, `/admin/lesson/${lessonId}/sections`);
  return;
  }

  const sectionEdit = p.match(/^\/admin\/section\/(\d+)(\/delete)?$/);
  if (sectionEdit && method === "POST") {
  if (!contentManager) return redirect(res, "/admin/login");
  const section = db.prepare("SELECT * FROM test_sections WHERE id = ?").get(Number(sectionEdit[1]));
  if (!section) return redirect(res, "/admin");
  if (sectionEdit[2] === "/delete") {
  db.prepare("DELETE FROM test_sections WHERE id = ?").run(section.id);
  } else {
  const title = String(fields.title || "").trim() || "Bo'lim";
  const fromNo = Math.max(1, Number(fields.from_no) || 1);
  const toNo = Math.max(0, Number(fields.to_no) || 0);
  const passage = String(fields.passage || "").trim();
  db.prepare("UPDATE test_sections SET title = ?, from_no = ?, to_no = ?, passage = ? WHERE id = ?").run(
  title,
  fromNo,
  toNo,
  passage,
  section.id
  );
  }
  redirect(res, `/admin/lesson/${section.lesson_id}/sections`);
  return;
  }

  const lessonImport = p.match(/^\/admin\/lesson\/(\d+)\/import$/);
  if (lessonImport && method === "POST") {
  if (!contentManager) return redirect(res, "/admin/login");
  const lessonId = Number(lessonImport[1]);
  const lesson = db.prepare("SELECT * FROM lessons WHERE id = ?").get(lessonId);
  if (!lesson) return redirect(res, "/admin");
  const file = files.file;
  if (!file || !file.buffer || !file.buffer.length) {
  redirect(res, `/admin/lesson/${lessonId}/questions?err=nofile`);
  return;
  }
  const ext = path.extname(String(file.name || "")).toLowerCase();
  if (ext !== ".xlsx" && ext !== ".docx") {
  redirect(res, `/admin/lesson/${lessonId}/questions?err=format`);
  return;
  }
  let parsed = [];
  try {
  parsed = ext === ".xlsx" ? parseQuestionsFromXlsx(file.buffer): parseQuestionsFromDocx(file.buffer);
  } catch (e) {
  parsed = [];
  }
  if (!parsed.length) {
  redirect(res, `/admin/lesson/${lessonId}/questions?err=empty`);
  return;
  }
  const insert = db.prepare(
  "INSERT INTO questions (lesson_id, text, o1, o2, o3, o4, correct, passage) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  let added = 0;
  for (const q of parsed.slice(0, 500)) {
  insert.run(lessonId, q.text, q.o1, q.o2, q.o3, q.o4, q.correct, q.passage || "");
  added += 1;
  }
  db.prepare("UPDATE lessons SET question_count = ? WHERE id = ? AND question_count = 0").run(added, lessonId);
  redirect(res, `/admin/lesson/${lessonId}/questions?imported=${added}`);
  return;
  }

  const questionDelete = p.match(/^\/admin\/question\/(\d+)\/delete$/);
  if (questionDelete && method === "POST") {
  if (!contentManager) return redirect(res, "/admin/login");
  const q = db.prepare("SELECT * FROM questions WHERE id = ?").get(Number(questionDelete[1]));
  if (q) {
  db.prepare("DELETE FROM questions WHERE id = ?").run(q.id);
  redirect(res, `/admin/lesson/${q.lesson_id}/questions`);
  } else {
  redirect(res, "/admin");
  }
  return;
  }

  /* ---------------------------------------------------------------- 404 */
  return notFound(res, user, admin);
  } catch (err) {
  console.error("[error]", err);
  send(
  res,
  500,
  layout({
  title: "Server xatosi",
  body: `<div class="card"><h1>Server xatosi</h1><p class="muted">Iltimos, keyinroq qayta urinib ko'ring.</p><a class="btn" href="/">Bosh sahifa</a></div>`
  })
  );
  }
});

function notFound(res, user, admin) {
  send(
  res,
  404,
  layout({
  title: "Topilmadi",
  body: `<div class="card"><h1>Sahifa topilmadi</h1><p class="muted">Havola eskirgan yoki o'chirilgan.</p><a class="btn btn-primary" href="${admin ? "/admin": user ? "/attestation": "/"}">Davom etish</a></div>`,
  user,
  admin
  })
  );
}

server.headersTimeout = 65_000;
server.requestTimeout = 15 * 60 * 1000;
server.listen(PORT, () => {
  console.log(`Platforma ishga tushdi: http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/admin  (parol: config.json ichida)`);
});

startTournamentScheduler();
startReminderScheduler();
startEngagementScheduler();
startPlatformBot();
