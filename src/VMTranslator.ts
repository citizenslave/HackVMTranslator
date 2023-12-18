import { readFileSync } from "fs";
import path from "path";

export class VMTranslator {
  filename: string;
  vmCode: string;
  labelIndex: number = 0;

  constructor(filename: string) {
    this.filename = filename.split(path.sep).pop() as string;

    const fileParts = this.filename.split('.');
    fileParts.pop();
    this.filename = fileParts.join('.');

    this.vmCode = readFileSync(filename).toString();
  }

  translate(): string {
    const lines = this.vmCode.split('\n').filter(l => l.trim() && !l.trim().startsWith('//'));

    const translatedLines = lines.map(l => this.translateLine(l));

    return translatedLines.join('\n');
  }
  
  translateLine(line: string): string {

    const memOpPattern = /(push|pop) (D|A|local|argument|this|that|constant|static|pointer|temp) ?(\d+)?/;

    const memOpParams = memOpPattern.exec(line);

    if (memOpParams) {
      const memOp = 'memOps' + path.sep + memOpParams[1].trim();
      const segment = memOpParams[2].trim();
      const index = memOpParams[3]?.trim();
      switch (segment) {
        case 'D':
        case 'A':
          return this.inflateSnippet(this.loadSnippet('memOps' + path.sep + line));

        case 'constant':
          const constantSnippet = this.loadSnippet(`${memOp} constant`);
          return this.inflateSnippet(constantSnippet.replace(/value/g, index));
        case 'static':
          const staticSnippet = this.loadSnippet(`${memOp} static`);
          return this.inflateSnippet(staticSnippet.replace(/reference/g, `${this.filename}.${index}`));
        case 'pointer':
          const pointerSnippet = this.loadSnippet(`${memOp} pointer`);
          return this.inflateSnippet(pointerSnippet.replace(/id/g, index === '0' ? 'THIS' : 'THAT'));
        case 'temp':
          const tempSnippet = this.loadSnippet(`${memOp} temp`);
          return this.inflateSnippet(tempSnippet.replace(/reference/g, `${5 + Number(index)}`));

        case 'local':
        case 'argument':
        case 'this':
        case 'that':
        default:
          const segmentPtr = segment === 'local' ? 'LCL' : (segment === 'argument' ? 'ARG' : segment.toUpperCase());
          const memSnippet = this.loadSnippet(`${memOp} segment`);
          return this.inflateSnippet(memSnippet.replace(/index/g, index).replace(/segment/g, segmentPtr));
      }
    } else {
      return this.inflateSnippet(this.loadSnippet('aluOps' + path.sep + line));
    }
  }

  loadSnippet(snippetName: string): string {
    const  snippetPath = path.join(__dirname, '../snippets/', snippetName.trim() + '.vasm');
    return readFileSync(snippetPath).toString();
  }

  inflateSnippet(snippet: string): string {
    const subSnippetPattern = /\{(.+)\}/;
    const labelPattern = /\((\S+)\)/g;

    const labels = [];
    for (let label; label = labelPattern.exec(snippet);) {
      labels.push(label[1]);
    }

    labels.forEach(label => {
      snippet = snippet.replaceAll(new RegExp(`(@|\\()${label}`, 'g'), `$1${label}.${this.labelIndex}`);
    });
    if (labels.length) this.labelIndex++;

    const snippetLines = snippet.split('\n');

    return snippetLines.map(l => {
      const subSnippetMatch = subSnippetPattern.exec(l);
      if (!subSnippetMatch) return l;
      return `// VM_SUBSNIPPET -> ${subSnippetMatch[1]}\n${this.translateLine(subSnippetMatch[1])}`;
    }).join('\n');
  }
}