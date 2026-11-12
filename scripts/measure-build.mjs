import { spawnSync } from 'node:child_process';
import { readdir, stat, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
const begin=performance.now();
const result=spawnSync('pnpm',['build'],{stdio:'inherit'});
if(result.status!==0)process.exit(result.status??1);
const milliseconds=Math.round(performance.now()-begin);
async function files(directory){const output=[];for(const name of await readdir(directory)){const path=join(directory,name);if((await stat(path)).isDirectory())output.push(...await files(path));else{const data=await readFile(path);output.push({path,bytes:data.length,gzipBytes:gzipSync(data).length});}}return output;}
const measurement={recordedAt:new Date().toISOString(),node:process.version,architecture:'client-rendered vanilla TypeScript + Node REST + SQLite',buildMilliseconds:milliseconds,files:await files('dist'),notes:['One local production build, not a benchmark distribution.','Gzip sizes are computed per file; HTTP compression depends on the host.','Provider IO, database scaling, and network latency are not measured.']};
await writeFile('docs/BUILD_MEASUREMENT.json',JSON.stringify(measurement,null,2)+'\n');
console.log('Recorded docs/BUILD_MEASUREMENT.json');
