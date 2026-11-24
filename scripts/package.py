"""Immutable deterministic archives; no network and no private Git history."""
from pathlib import Path
import json,hashlib,subprocess,zipfile,io
ROOT=Path(__file__).resolve().parents[1];DIST=ROOT/'dist';m=json.loads((DIST/'manifest.json').read_text());release=json.loads((ROOT/'release.json').read_text());pkg=json.loads((ROOT/'package.json').read_text());slug=pkg['name']
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
assert not subprocess.check_output(['git','status','--porcelain'],cwd=ROOT,text=True).strip(),'Commit/review working changes before freezing a release'
assert m['sourceCommit']==commit,'Rebuild from this exact source commit'
def sha(b):return hashlib.sha256(b).hexdigest()
def archive(name,entries):
 out=io.BytesIO()
 with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
  for n,b in sorted(entries.items()):
   assert not n.startswith('/') and '..' not in Path(n).parts
   info=zipfile.ZipInfo(n,(2026,11,24,0,0,0));info.create_system=3;info.external_attr=0o100644<<16
   z.writestr(info,b,compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
 data=out.getvalue();p=DIST/name
 if p.exists():assert p.read_bytes()==data,'Refusing replacement of immutable archive '+name
 else:p.write_bytes(data)
 with zipfile.ZipFile(p) as z:
  assert z.testzip() is None;assert set(z.namelist())==set(entries)
  for n,b in entries.items():assert z.read(n)==b
 return {'file':name,'bytes':len(data),'files':len(entries),'sha256':sha(data)}
reports=[]
for kind,files in m['packages'].items():
 entries={};prefix='retrorealm-basic-lab' if kind=='plugin' else 'retrorealm-basic-'+kind
 for f in files:
  p=DIST/kind/f['path'];assert p.is_file() and not p.is_symlink();b=p.read_bytes();assert sha(b)==f['sha256'];entries[prefix+'/'+f['path']]=b
 reports.append(archive(f'{slug}-{kind}-{release["version"]}-{release["build"]}.zip',entries))
files=subprocess.check_output(['git','ls-files','-z'],cwd=ROOT).decode().split('\0');entries={}
for f in filter(None,files):
 assert not any(x in Path(f).parts for x in ['.git','.local','node_modules','dist']);p=ROOT/f;assert not p.is_symlink();entries[slug+'/'+f]=p.read_bytes()
reports.append(archive(f'{slug}-source-{release["version"]}-{release["build"]}.zip',entries))
record={**release,'sourceCommit':commit,'packages':reports};(DIST/'archives.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record,indent=2))
