import {spawnSync} from 'node:child_process';
import {appendFileSync,writeFileSync,existsSync} from 'node:fs';
const command=process.argv[2];
const r=spawnSync(command,{shell:'/bin/zsh',cwd:import.meta.dirname,encoding:'utf8',maxBuffer:50*1024*1024});
const output=(r.stdout??'')+(r.stderr??'');
appendFileSync(import.meta.dirname+'/log.jsonl',JSON.stringify({at:new Date().toISOString(),type:'command',command,exit:r.status,signal:r.signal,output})+'\n');
if(r.status!==0&&!existsSync(import.meta.dirname+'/first-failure.txt'))writeFileSync(import.meta.dirname+'/first-failure.txt',command+'\n'+output);
process.stdout.write(output);process.exitCode=r.status??1;
