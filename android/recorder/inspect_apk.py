"""Verify the delivered archive contains current shared sources and exact reviewed engines."""
from pathlib import Path
import hashlib, json, zipfile, sys, gzip
from datetime import date
root=Path(__file__).resolve().parents[2]
apk=Path(sys.argv[1]) if len(sys.argv)>1 else root/'android/recorder/build/outputs/apk/debug/recorder-debug.apk'
def digest(stream):
    sha=hashlib.sha256()
    while chunk:=stream.read(1024*1024): sha.update(chunk)
    return sha.hexdigest()
checks={}
with zipfile.ZipFile(apk) as archive:
    for stem in ['duolingo-board-profile','duolingo-night-profile']:
        profile=f'assets/review/assets/{stem}.json'
        expected=gzip.decompress((root/f'review/assets/{stem}.json.gz').read_bytes())
        assert archive.read(profile)==expected, 'Missing/stale packaged recognition profile'
        checks[profile]=hashlib.sha256(expected).hexdigest()
    pairs={f'assets/review/{name}':root/'review'/name for name in ['index.html','core.js','library.js','analysis-policy.js','battle-clock.js','ratings.js','demo-analysis.js','app.js','themes.js','board-motion.js','style.css','assets/oscar-panic.png']}
    for piece in (root/'review/assets/pieces').iterdir():
        if piece.suffix in ('.svg','.png'):pairs['assets/review/assets/pieces/'+piece.name]=piece
    pairs['res/drawable-nodpi-v4/oscar_panic.png']=root/'review/assets/oscar-panic.png'
    forbidden=[name for name in archive.namelist() if any(x in name.lower() for x in ['duolingo-game','duolingo-promotion','duolingo-install','.xapk','oscar-screenshot-fixture','official-day.jpg','official-night.jpg'])]
    assert not forbidden, f'Test material in main APK: {forbidden}'
    pairs['assets/src/controlMap.js']=root/'src/controlMap.js'
    pairs['assets/vendor/chess.min.js']=root/'vendor/chess.min.js'
    for piece in (root/'vendor/pieces').glob('*.svg'):pairs['assets/vendor/pieces/'+piece.name]=piece
    for abi in ['arm64-v8a','x86_64']:pairs[f'lib/{abi}/libstockfish.so']=root/f'vendor/stockfish/{abi}/libstockfish.so'
    for net in (root/'vendor/stockfish/networks').glob('*.nnue'):pairs['assets/networks/'+net.name]=net
    pairs['assets/licenses/stockfish/Copying.txt']=root/'vendor/stockfish/Copying.txt'
    pairs['assets/licenses/chesslib/LICENSE']=root/'vendor/chesslib/LICENSE'
    pairs['assets/licenses/chess-sprout-sources.json']=root/'vendor/chess-sprout-sources.json'
    for name,source in pairs.items():
        with source.open('rb') as local, archive.open(name) as packed:
            expected=digest(local);actual=digest(packed)
        assert expected==actual, f'Stale package asset: {name}'
        checks[name]=actual
with apk.open('rb') as stream:sha=digest(stream)
result={'verifiedDate':date.today().isoformat(),'apk':str(apk.resolve()),'bytes':apk.stat().st_size,'sha256':sha,'matchedFiles':checks}
out=root/'android/recorder/build/reports/apk-inspection.json'
out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'bytes':result['bytes'],'MiB':round(result['bytes']/1024**2,1),'sha256':sha,'matchedFiles':len(checks)},indent=2))
