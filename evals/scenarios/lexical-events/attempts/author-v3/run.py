import pathlib,sys,json,subprocess,datetime
app=pathlib.Path(__file__).parent
spec=json.loads(sys.argv[1]); argv=spec['command']
r=subprocess.run(argv,cwd=app,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
out=r.stdout+r.stderr
if spec.get('artifact'): (app/spec['artifact']).write_text(out)
if r.returncode and not (app/'first-failure.txt').exists(): (app/'first-failure.txt').write_text(out)
entry={**spec,'exit_code':r.returncode,'time':datetime.datetime.now().isoformat()}
with (app/'log.jsonl').open('a') as f: f.write(json.dumps(entry,ensure_ascii=False)+'\n')
print(out,end='');sys.exit(r.returncode)
