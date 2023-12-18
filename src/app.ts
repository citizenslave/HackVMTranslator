import fs from 'fs';
import { VMTranslator } from './VMTranslator';

if (process.argv.length < 3) { console.error("No file provided.  Quitting."); process.exit(); }

const filename = process.argv[2];

if (!fs.existsSync(filename)) { console.error ("File not found.  Quitting."); process.exit(); }

const translatedFile = new VMTranslator(filename).translate();

const nameParts = filename.split('.');
nameParts[nameParts.length - 1] = 'asm';
const outputName = nameParts.join('.');

fs.writeFileSync(outputName, translatedFile);

console.log(`Translated Assembly Code Written to:\n${outputName}`);
