import shutil
s=open('src/shell.html').read()
s=s.replace('/*CSS*/',open('src/app.css').read()).replace('/*QRLIB*/',open('node_modules/qrcode-generator/dist/qrcode.js').read()).replace('/*APP*/',open('src/app.js').read())
open('dist/index.html','w').write(s)
for f in ['manifest.json','sw.js']: shutil.copy('src/'+f,'dist/'+f)
print(len(s))
