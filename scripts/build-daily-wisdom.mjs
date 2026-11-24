import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(root, "seed-data", "daily-wisdom-uz.json");
const wisdom = JSON.parse(fs.readFileSync(file, "utf8"));
if (wisdom.length !== 365) throw new Error(`Expected 365 entries, found ${wisdom.length}`);
const normalized = wisdom.map(({ text }) => text.trim().toLocaleLowerCase("uz"));
if (new Set(normalized).size !== wisdom.length) throw new Error("Duplicate wisdom entries found");
console.log(`Validated ${wisdom.length} unique daily wisdom entries.`);
