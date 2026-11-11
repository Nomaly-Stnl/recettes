import shutil, subprocess, os
if not os.path.exists('/tmp/jsqr.min.js'):
    subprocess.run(['npx','-y','terser','node_modules/jsqr/dist/jsQR.js','-c','-m','-o','/tmp/jsqr.min.js'],check=True)
s=open('src/shell.html').read()
s=s.replace('/*CSS*/',open('src/app.css').read()).replace('/*QRLIB*/',open('node_modules/qrcode-generator/dist/qrcode.js').read()+'\n'+open('/tmp/jsqr.min.js').read()).replace('/*APP*/',open('src/app.js').read())
open('dist/index.html','w').write(s)
for f in ['manifest.json','sw.js']: shutil.copy('src/'+f,'dist/'+f)
print(len(s))
