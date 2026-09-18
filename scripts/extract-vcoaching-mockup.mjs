import fs from 'node:fs';
import crypto from 'node:crypto';
const path = process.argv[2];
if (!path) throw new Error('Pass the approved HTML mockup path.');
const html = fs.readFileSync(path, 'utf8');
const match = html.match(/<script\b[^>]*id=["']source-data["'][^>]*>([\s\S]*?)<\/script>/);
if (!match) throw new Error('Missing source-data in the approved mockup');
const source = JSON.parse(match[1]);
if (source.names.length !== 3 || source.steps.length !== 3 || source.steps.some(s => s.length !== 8)) throw new Error('Unexpected source shape');
const output = JSON.stringify(source, null, 2)+'\n';
if (process.argv.includes('--check')) {
  if (fs.readFileSync('vcoaching/approved_mockup.json', 'utf8') !== output) throw new Error('Approved source differs from the mockup');
} else {
  fs.writeFileSync('vcoaching/approved_mockup.json', output);
}
console.log(JSON.stringify({names:source.names,steps:source.steps.flat().length,questions:source.steps.flat().reduce((n,s)=>n+s.questions.length,0),cards:source.steps.flat().reduce((n,s)=>n+s.cards.length,0),documents:Object.keys(source.docs),sha256:crypto.createHash('sha256').update(output).digest('hex')},null,2));
