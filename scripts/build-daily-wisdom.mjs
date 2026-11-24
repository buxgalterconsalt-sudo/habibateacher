import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(ROOT, "seed-data", "daily-wisdom-uz.json");
const practices = [
  "ilm izlash", "yangi bilim o'rganish", "kitob mutolaa qilish", "savol berish", "diqqat bilan tinglash",
  "o'rganganini qayta ko'rib chiqish", "bilimni amalda qo'llash", "xatodan xulosa chiqarish", "ustozdan maslahat so'rash", "o'rganganini boshqalarga tushuntirish",
  "muntazam mashq qilish", "reja tuzish", "vazifani vaqtida boshlash", "qiyin mavzuga qaytish", "muammoni bo'laklarga ajratish",
  "fikrni dalil bilan asoslash", "mustaqil izlanish", "bir mavzuni chuqur o'rganish", "yangi ko'nikmani takrorlash", "darsdan keyin qayd yozish",
  "fikrlarni taqqoslash", "bilmaganini tan olish", "fikrni aniq ifodalash", "vaqtni rejalash", "tartibli ishlash",
  "diqqatni bir ishga jamlash", "javobni mustaqil izlash", "qadam-baqadam o'rganish", "xatoni tuzatish", "til o'rganish",
  "yozish mashqini bajarish", "o'qib tushunish", "fikr bildirish", "sinab ko'rish", "misollar bilan o'rganish",
  "o'rganganini o'z so'zi bilan aytish", "yangi bilimga ochiq bo'lish", "ustozga hurmat ko'rsatish", "shogirdning qiziqishini qo'llash", "hamkorlikda ishlash",
  "tajriba almashish", "qiyinchilikdan qochmaslik", "maqsadga sodiq qolish", "kichik natijani qadrlash", "sabr bilan davom etish",
  "izchil odatlarni shakllantirish", "o'z ustida ishlash", "o'qishga vaqt ajratish", "savollar ro'yxatini tuzish", "manbani tekshirish",
  "eslatma yozib borish", "fikrlarni tartiblash", "darsga tayyorlanish", "darsda faol qatnashish", "xulosani qayd etish",
  "suhbatdoshni hurmat bilan tinglash", "fikrni qayta tekshirish", "javobdan saboq olish", "matnni qayta o'qish", "yangilikka qiziqish",
  "bilim bilan qo'rquvni yengish", "o'z oldiga talab qo'yish", "bilimni chuqurlashtirish", "ishonchli manbaga tayanish", "o'qiganini amalda sinash",
  "mustaqil fikrlash", "ustoz tajribasini qadrlash", "shogird mehnatini rag'batlantirish", "bilim uchun minnatdor bo'lish", "bugungi darsni puxta yakunlash",
  "yangi g'oyani izlab topish", "o'z fikrini tinglash", "vazifani oxirigacha bajarish"
];
const templates = [
  (topic) => `Har kuni ${topic} — ilm yo'lidagi yangi qadam.`,
  (topic) => `${topic[0].toUpperCase()}${topic.slice(1)} fikringizni charxlab, imkoniyatlaringizni kengaytiradi.`,
  (topic) => `Muntazam ravishda ${topic} bugungi mehnatni ertangi mahoratga aylantiradi.`,
  (topic) => `${topic[0].toUpperCase()}${topic.slice(1)}ni sabr bilan davom ettiring — natija albatta keladi.`,
  (topic) => `Kichik odat bo'lgan ${topic} vaqt o'tib katta samara beradi.`
];

const wisdom = Array.from({ length: 365 }, (_, index) => ({
  text: templates[index % templates.length](practices[(index * 13) % practices.length])
}));
wisdom[0] = { text: "Ilm izlash — o'zingizga qilgan eng yaxshi sarmoyadir." };
if (wisdom.length !== 365) throw new Error(`Expected 365 entries, created ${wisdom.length}`);
fs.writeFileSync(OUTPUT, `${JSON.stringify(wisdom, null, 2)}\n`, "utf8");
process.stdout.write(`Wrote ${wisdom.length} daily wisdom entries to ${path.relative(ROOT, OUTPUT)}.\n`);
