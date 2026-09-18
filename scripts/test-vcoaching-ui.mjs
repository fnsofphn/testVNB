import assert from 'node:assert/strict';
import {mkdtemp, readFile, unlink, rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {realpathSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {build}=createRequire(realpathSync(require.resolve('vite/package.json')))('esbuild');

// Render the real component without login, a browser session, or database access.
const folder = await mkdtemp(path.join(tmpdir(), 'vcoaching-ui-test-'));
const output = path.join(folder, 'render.cjs');
try {
  await build({stdin:{contents:`
    import {createElement} from 'react';
    import {renderToStaticMarkup} from 'react-dom/server';
    import Worksheet from './src/modules/vcoaching/ExpertWorksheet';
    export const render = props => renderToStaticMarkup(createElement(Worksheet, props));
  `,resolveDir:process.cwd(),loader:'tsx'},outfile:output,bundle:true,platform:'node',format:'cjs',jsx:'automatic'});
  const {render} = await import(pathToFileURL(output).href);
  let cases=0;
  for (const lane of ['expert','unit']) {
    for (const rating of ['', 'missing', 'partial', 'clear', 'verify']) {
      for (const locked of [false,true]) {
        const html = render({id:'isolated-ui',version:1,lane,locked,busy:false,command:async()=>true,
          sheet:{revision:1,base_version:1,steps:{'1':[{id:'q1',question:'Nội dung kiểm thử',answer:'Câu trả lời đã lưu',rating}]}}});
        assert.equal((html.match(/type="radio"/g)||[]).length,4);
        assert.ok(!html.includes('<select'), 'Worksheet ratings must not become dropdowns');
        assert.equal((html.match(/checked=""/g)||[]).length,rating?1:0);
        for (const label of ['Chưa rõ','Cần bổ sung','Đã rõ','Cần xác minh']) assert.ok(html.includes(label));
        assert.ok(html.includes('Câu trả lời đã lưu'));
        assert.ok(html.includes(`isolated-ui-${lane}-1-q1-rating`));
        assert.ok(html.includes(locked?'<fieldset class="vc-rating" disabled="">':'<fieldset class="vc-rating">'));
        if(rating) assert.match(html,new RegExp(`checked="" value="${rating}"|value="${rating}" checked=""`));
        cases++;
      }
    }
  }
  const css=await readFile('src/modules/vcoaching/vcoaching.css','utf8');
  const page=await readFile('src/modules/vcoaching/VCoachingPage.tsx','utf8');
  assert.ok(page.includes("page==='self'||actor?.role==='expert'?'self'"),'Lecturer must open the editable worksheet, not legacy comments');
  const tokens=Object.fromEntries([...css.matchAll(/(--vc-[\w-]+):\s*(#[a-f\d]{6})/gi)].map(m=>[m[1],m[2]]));
  const luminance=hex=>hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((n,x,i)=>n+x*[.2126,.7152,.0722][i],0);
  const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  for(const [a,b] of [['--vc-ink','--vc-panel'],['--vc-muted','--vc-panel'],['--vc-ink','--vc-bg'],['--vc-muted','--vc-bg']]) assert.ok(contrast(tokens[a],tokens[b])>=4.5,`${a}/${b} contrast`);
  assert.ok(contrast('#ffffff',tokens['--vc-blue'])>=4.5,'Selected rating contrast');
  assert.equal(tokens['--vc-bg'],'#bccbd6','Workspace must keep the approved slate-blue canvas');
  assert.equal(tokens['--vc-panel'],'#d3dee5','Reading cards must keep the approved low-glare surface');
  assert.equal(tokens['--vc-navy'],'#102b43','Approved option 1 sidebar navy');
  for(const key of ['--vc-navy','--vc-blue-dark']) assert.ok(contrast('#ffffff',tokens[key])>=4.5,`${key} on white contrast`);
  assert.ok(contrast(tokens['--vc-ink'],tokens['--vc-header-bg'])>=4.5,'Header text contrast');
  console.log(`${cases} worksheet render cases passed; palette contrast checks passed.`);
} finally {
  await unlink(output).catch(e=>{if(e.code!=='ENOENT')throw e;});
  await rmdir(folder);
}
