import { inflateRawSync } from "node:zlib";

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

function zipEntries(buffer) {
  const entries = new Map();
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 66000); i -= 1) {
  if (buffer.readUInt32LE(i) === 0x06054b50) {
  end = i;
  break;
  }
  }
  if (end < 0) return entries;
  const count = buffer.readUInt16LE(end + 10);
  let ptr = buffer.readUInt32LE(end + 16);
  for (let i = 0; i < count && ptr + 46 <= buffer.length; i += 1) {
  if (buffer.readUInt32LE(ptr) !== 0x02014b50) break;
  const method = buffer.readUInt16LE(ptr + 10);
  const compSize = buffer.readUInt32LE(ptr + 20);
  const nameLen = buffer.readUInt16LE(ptr + 28);
  const extraLen = buffer.readUInt16LE(ptr + 30);
  const commentLen = buffer.readUInt16LE(ptr + 32);
  const localOff = buffer.readUInt32LE(ptr + 42);
  const name = buffer.toString("utf8", ptr + 46, ptr + 46 + nameLen).replace(/\\/g, "/");
  ptr += 46 + nameLen + extraLen + commentLen;
  if (localOff + 30 > buffer.length || buffer.readUInt32LE(localOff) !== 0x04034b50) continue;
  const localName = buffer.readUInt16LE(localOff + 26);
  const localExtra = buffer.readUInt16LE(localOff + 28);
  const start = localOff + 30 + localName + localExtra;
  const data = buffer.subarray(start, start + compSize);
  try {
  entries.set(name, method === 0 ? Buffer.from(data): inflateRawSync(data));
  } catch (e) {}
  }
  return entries;
}

function xmlDecode(value) {
  return String(value || "")
.replace(/&lt;/g, "<")
.replace(/&gt;/g, ">")
.replace(/&quot;/g, '"')
.replace(/&apos;/g, "'")
.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
.replace(/&amp;/g, "&");
}

function xmlPlain(value) {
  return xmlDecode(String(value || "").replace(/<[^>]*>/g, " "))
.replace(/\u00a0/g, " ")
.replace(/\s+/g, " ")
.trim();
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1): c >>> 1;
  table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const names = Object.keys(files);
  for (const name of names) {
  const data = files[name];
  const nameBuf = Buffer.from(name, "utf8");
  const crc = crc32(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt16LE(0, 10);
  local.writeUInt16LE(0, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  chunks.push(local, nameBuf, data);
  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0);
  cen.writeUInt16LE(20, 4);
  cen.writeUInt16LE(20, 6);
  cen.writeUInt16LE(0x0800, 8);
  cen.writeUInt16LE(0, 10);
  cen.writeUInt16LE(0, 12);
  cen.writeUInt16LE(0, 14);
  cen.writeUInt32LE(crc, 16);
  cen.writeUInt32LE(data.length, 20);
  cen.writeUInt32LE(data.length, 24);
  cen.writeUInt16LE(nameBuf.length, 28);
  cen.writeUInt16LE(0, 30);
  cen.writeUInt16LE(0, 32);
  cen.writeUInt16LE(0, 34);
  cen.writeUInt16LE(0, 36);
  cen.writeUInt32LE(0, 38);
  cen.writeUInt32LE(offset, 42);
  central.push(cen, nameBuf);
  offset += local.length + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, centralBuf, end]);
}

export function questionsXlsxTemplate() {
  const headers = ["Savol", "A", "B", "C", "D", "Javob", "Matn"];
  const rows = [
  ["She ___ to school every day.", "go", "goes", "going", "gone", "B", ""],
  [
  "Choose the correct sentence",
  "Cats catch mice and dogs.",
  "Cats and dogs catch mice.",
  "Cats catch and dogs mice.",
  "Dogs catch cats and mice.",
  "C",
  "Read the passage and choose the best option."
  ]
  ];
  const colLetters = ["A", "B", "C", "D", "E", "F", "G"];
  const cell = (ref, value) =>
  `<c r="${ref}" t="inlineStr"><is><t>${escapeHtml(String(value || ""))}</t></is></c>`;
  const sheetRows = [
  `<row r="1">${headers.map((value, i) => cell(`${colLetters[i]}1`, value)).join("")}</row>`,
...rows.map(
  (row, r) =>
  `<row r="${r + 2}">${row.map((value, i) => cell(`${colLetters[i]}${r + 2}`, value)).join("")}</row>`
  )
  ].join("");
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols><col min="1" max="1" width="55" customWidth="1"/><col min="2" max="5" width="32" customWidth="1"/><col min="6" max="6" width="10" customWidth="1"/><col min="7" max="7" width="55" customWidth="1"/></cols>
<sheetData>${sheetRows}</sheetData>
</worksheet>`;
  return zipStore({
  "[Content_Types].xml": Buffer.from(
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
  "utf8"
  ),
  "_rels/.rels": Buffer.from(
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  "utf8"
  ),
  "xl/workbook.xml": Buffer.from(
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Savollar" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
  "utf8"
  ),
  "xl/_rels/workbook.xml.rels": Buffer.from(
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
  "utf8"
  ),
  "xl/worksheets/sheet1.xml": Buffer.from(sheet, "utf8")
  });
}

export function parseQuestionsFromXlsx(buffer) {  const files = zipEntries(buffer);
  const shared = [];
  const stringsXml = files.get("xl/sharedStrings.xml");
  if (stringsXml) {
  for (const item of stringsXml.toString("utf8").matchAll(/<si\b[\s\S]*?<\/si>/g)) {
  const parts = [...item[0].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => xmlDecode(m[1]));
  shared.push(parts.join(""));
  }
  }
  const sheetName = [...files.keys()]
.filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
.sort()[0];
  if (!sheetName) return [];
  const xml = files.get(sheetName).toString("utf8");
  const rows = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
  const cells = [];
  for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
  const attrs = cellMatch[1] || "";
  const inner = cellMatch[2] || "";
  const ref = (attrs.match(/\br="([A-Z]+)\d+"/i) || [])[1] || "";
  const type = (attrs.match(/\bt="([^"]+)"/) || [])[1] || "";
  let text = "";
  if (type === "inlineStr") {
  text = xmlPlain((inner.match(/<is\b[\s\S]*?<\/is>/) || [inner])[0]);
  } else {
  const raw = (inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/) || [])[1] || "";
  text = type === "s" ? shared[Number(raw)] || "": xmlDecode(raw);
  }
  if (!text) continue;
  let col = 0;
  for (const ch of ref.toUpperCase()) col = col * 26 + (ch.charCodeAt(0) - 64);
  cells[col - 1] = text.replace(/\u00a0/g, " ").trim();
  }
  if (cells.some((c) => c)) rows.push(cells);
  }
  return questionsFromRows(rows);
}

function normalizeAnswer(value, options) {
  const text = String(value || "").trim();
  if (!text) return 0;
  const letter = text.match(/^[ABCD]/i);
  if (letter) return "ABCD".indexOf(letter[0].toUpperCase()) + 1;
  if (/^[1-4]$/.test(text)) return Number(text);
  const byText = options.findIndex((option) => option && option.trim().toLowerCase() === text.toLowerCase());
  return byText >= 0 ? byText + 1: 0;
}

export function questionsFromRows(rows) {
  const header = (rows[0] || []).map((cell) => String(cell || "").toLowerCase().replace(/[`'"]/g, "").trim());
  const find = (tests) => header.findIndex((cell) => tests.some((test) => test(cell)));
  let map = {
  text: find([(c) => c.includes("savol") && !c.includes("matn"), (c) => c === "question", (c) => c === "text"]),
  o1: find([(c) => c.includes("variant1") || c.includes("1variant") || c === "a" || c === "a1"]),
  o2: find([(c) => c.includes("variant2") || c.includes("2variant") || c === "b" || c === "b1"]),
  o3: find([(c) => c.includes("variant3") || c.includes("3variant") || c === "c" || c === "c1"]),
  o4: find([(c) => c.includes("variant4") || c.includes("4variant") || c === "d" || c === "d1"]),
  correct: find([(c) => c.includes("javob") || c.includes("correct") || c.includes("answer")]),
  passage: find([(c) => c.includes("matn") || c.includes("passage") || c.includes("reading")])
  };
  const detected = map.text >= 0 && map.o1 >= 0 && map.o2 >= 0 && map.o3 >= 0 && map.o4 >= 0 && map.correct >= 0;
  let start = detected ? 1: 0;
  if (!detected) map = { text: 0, o1: 1, o2: 2, o3: 3, o4: 4, correct: 5, passage: 6 };
  const result = [];
  for (let i = start; i < rows.length; i += 1) {
  const row = rows[i];
  const text = String(row[map.text] || "").trim();
  const options = [
  String(row[map.o1] || "").trim(),
  String(row[map.o2] || "").trim(),
  String(row[map.o3] || "").trim(),
  String(row[map.o4] || "").trim()
  ];
  const correct = normalizeAnswer(row[map.correct], options);
  if (!text || options.some((option) => !option) || !correct) continue;
  result.push({
  text: text.replace(/^\d+[.)]\s*/, ""),
  o1: options[0],
  o2: options[1],
  o3: options[2],
  o4: options[3],
  correct,
  passage: map.passage >= 0 ? String(row[map.passage] || "").trim(): ""
  });
  }
  return result;
}

export function parseQuestionsFromDocx(buffer) {
  const files = zipEntries(buffer);
  const documentXml = files.get("word/document.xml");
  if (!documentXml) return [];
  const xml = documentXml.toString("utf8");
  const paragraphs = [];
  for (const para of xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)) {
  const texts = [...para[0].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => xmlDecode(m[1]));
  const line = texts.join("").replace(/\u00a0/g, " ").trim();
  paragraphs.push(line);
  }
  const optionRe = /^([A-D-   ])[).\-:]\s*(.+)$/i;
  const answerRe = /^(?:javob|to'g'ri javob|togri javob|answer|correct)\s*[:\-]\s*(.+)$/i;
  const passageRe = /^(?:matn|passage|reading|matn:)\s*[:\-]\s*(.*)$/i;
  const result = [];
  let current = null;
  let passageMode = false;
  const flush = () => {
  if (current && current.text && current.options.length === 4 && current.correct) {
  result.push({
  text: current.text,
  o1: current.options[0],
  o2: current.options[1],
  o3: current.options[2],
  o4: current.options[3],
  correct: current.correct,
  passage: current.passage.join("\n").trim()
  });
  }
  current = null;
  passageMode = false;
  };
  for (const line of paragraphs) {
  if (!line) {
  passageMode = false;
  continue;
  }
  const numbered = line.match(/^(\d+)\s*[.)]\s*(.+)$/);
  if (numbered && (!current || current.options.length === 4 || current.correct)) {
  flush();
  current = { text: numbered[2].trim(), options: [], correct: 0, passage: [] };
  continue;
  }
  const answer = line.match(answerRe);
  if (answer && current && !current.correct) {
  current.correct = normalizeAnswer(answer[1], current.options);
  passageMode = false;
  continue;
  }
  const passage = line.match(passageRe);
  if (passage && current) {
  passageMode = true;
  if (passage[1].trim()) current.passage.push(passage[1].trim());
  continue;
  }
  const option = line.match(optionRe);
  if (option && current && current.options.length < 4 && !current.correct) {
  current.options.push(option[2].trim());
  passageMode = false;
  continue;
  }
  if (passageMode && current) {
  current.passage.push(line);
  continue;
  }
  if (!current) {
  current = { text: line, options: [], correct: 0, passage: [] };
  } else if (current.options.length === 4 && !current.correct) {
  flush();
  current = { text: line, options: [], correct: 0, passage: [] };
  } else if (!current.correct && current.options.length < 4) {
  current.text += " " + line;
  }
  }
  flush();
  return result;
}
