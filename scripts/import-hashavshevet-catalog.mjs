import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/import-hashavshevet-catalog.mjs <export.csv>');
  process.exit(2);
}
const text = await readFile(resolve(input), 'utf8');
const rows = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
const parse = (line) => {
  const out=[]; let cur=''; let quote=false;
  for (let i=0;i<line.length;i++){const c=line[i]; if(c==='"'){ if(quote && line[i+1]==='"'){cur+='"';i++;} else quote=!quote; } else if(c===',' && !quote){out.push(cur);cur='';} else cur+=c;}
  out.push(cur); return out.map(v=>v.trim());
};
const header = parse(rows.shift() || '').map(h=>h.toLowerCase());
const aliases = {
  sku:['sku','item','itemcode','catalog','מק"ט','מקט','קוד פריט','פריט'],
  name:['name','description','itemname','שם פריט','תיאור'],
  price:['price','saleprice','מחיר','מחיר מכירה','מחיר כולל מעמ'],
  stock:['stock','qty','quantity','מלאי','יתרה'],
  category:['category','קבוצה','קטגוריה'],
  brand:['brand','יצרן','מותג'],
  description:['description','details','תיאור מורחב','פרטים'],
  image:['imageurl','image url','image','תמונה','קישור תמונה'],
  online:['online','web','אונליין','למכירה באתר']
};
const col = (key) => { for (const a of aliases[key]) { const i=header.indexOf(a.toLowerCase()); if(i>=0)return i; } return -1; };
const idx = Object.fromEntries(Object.keys(aliases).map(k=>[k,col(k)]));
if (idx.sku<0 || idx.name<0 || idx.price<0) throw new Error('Missing required columns: SKU, name, price');
const truthy = new Set(['1','true','yes','כן','y']);
const products = rows.map(parse).map(r=>({
  sku:r[idx.sku]||'', name:r[idx.name]||'',
  category:idx.category>=0?r[idx.category]||'':'מוצרים',
  brand:idx.brand>=0?r[idx.brand]||'':'',
  description:idx.description>=0?r[idx.description]||'':'',
  priceIlsVat:Number(String(r[idx.price]||'0').replace(/[^0-9.\-]/g,''))||0,
  stock:idx.stock>=0?(Number(String(r[idx.stock]||'0').replace(/[^0-9.\-]/g,''))||0):0,
  online:idx.online>=0?truthy.has(String(r[idx.online]||'').toLowerCase()):false,
  imageUrl:idx.image>=0?r[idx.image]||'':''
})).filter(p=>p.sku&&p.name&&p.priceIlsVat>0);
const output={schemaVersion:1,source:'Hashavshevet CSV export',updatedAt:new Date().toISOString(),products};
await writeFile('public/customer-portal/catalog/hashavshevet-products.json',JSON.stringify(output,null,2)+'\n','utf8');
console.log('Imported',products.length,'products; online',products.filter(p=>p.online).length);
