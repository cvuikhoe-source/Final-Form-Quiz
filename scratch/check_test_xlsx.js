import fs from 'fs';
import * as XLSX from 'xlsx';

const buf = fs.readFileSync('test.xlsx');
const wb = XLSX.read(buf, { type: 'buffer' });
console.log('Sheets in test.xlsx:', wb.SheetNames);
for (const s of wb.SheetNames) {
  const ws = wb.Sheets[s];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
  console.log(`Sheet "${s}" has ${data.length} rows`);
  if (data.length > 0) {
    console.log('Row 0:', data[0]);
    console.log('Row 1:', data[1]);
  }
}
