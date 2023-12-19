import { lstatSync, readdirSync, writeFileSync } from 'fs';
import path from 'path';
import { VMTranslator } from './VMTranslator';

if (process.argv.length < 3) { console.error("No file provided.  Quitting."); process.exit(); }

let filename = process.argv[2];

const bootstrapTranslator = new VMTranslator();
const bootstrapSnippet = bootstrapTranslator.loadSnippet('bootstrap');
let hasSysInit = false;

const translatedFiles = [ new VMTranslator().inflateSnippet(bootstrapSnippet, false) ];

if (lstatSync(filename).isDirectory()) {
  const files = readdirSync(filename, { recursive: true }) as string[];

  files.filter(f => (f.split('.').pop() === 'vm')).forEach(file => {
    const translatedFile = new VMTranslator(path.join(filename, file)).translate();
    if (translatedFile.includes('(Sys.init)')) hasSysInit = true;
    translatedFiles.push(translatedFile);
  });

  if (filename.endsWith(path.sep)) filename = filename.slice(0, -1);
  filename += path.sep + filename.split(path.sep).pop() + '.asm';
} else if (lstatSync(filename).isFile()) {
  const translatedFile = new VMTranslator(filename).translate();
  if (translatedFile.includes('(Sys.init)')) hasSysInit = true;
  translatedFiles.push(translatedFile);

  const nameParts = filename.split('.');
  if (nameParts.length === 1 || nameParts[nameParts.length - 1] !== 'vm') nameParts.push('');  
  nameParts[nameParts.length - 1] = 'asm';
  filename = nameParts.join('.');
} else { console.error ("File/Folder not found.  Quitting."); process.exit(); }

if (!hasSysInit) {
  console.log('Sys.init not found, assuming test framework.');
  translatedFiles.shift();
}

writeFileSync(filename, translatedFiles.join('\n\n\n'));

console.log(`Translated Assembly Code Written to:\n${filename}`);
