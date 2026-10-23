"""Prepare only this project's Stockfish sources and a hash-verified NNUE."""
import hashlib
import json
from pathlib import Path
import re
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / 'ios' / 'build'
SOURCE_HASH = '024a509d7af387218bd59c559473a71a1d6b411885010543891495119a671119'
NETWORK_HASH = '1a298aa575a085434d29027978dc36867fe9c5bcea9376654b7a8eba1e52dfc2'


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def prepare():
    archive = ROOT / 'vendor/stockfish/stockfish-sf_19-source.zip'
    if sha256(archive) != SOURCE_HASH:
        raise RuntimeError('Stockfish source checksum differs from the reviewed archive')
    source = BUILD / 'stockfish/Stockfish-sf_19/src'
    if not (source / 'engine.cpp').is_file():
        base = (BUILD / 'stockfish').resolve()
        with zipfile.ZipFile(archive) as zip_file:
            for member in zip_file.infolist():
                if not (base / member.filename).resolve().is_relative_to(base):
                    raise RuntimeError('Unsafe source archive path')
            zip_file.extractall(base)
    name = re.search(r'#define EvalFileDefaultName "([^"]+)"', (source / 'evaluate.h').read_text()).group(1)
    if name != 'nn-1a298aa575a0.nnue':
        raise RuntimeError('Review the network checksum when updating Stockfish')
    network = BUILD / 'networks' / name
    network.parent.mkdir(parents=True, exist_ok=True)
    if not network.is_file():
        # Git LFS: raw.githubusercontent.com returns a tiny pointer, not the NNUE.
        source_url = 'https://media.githubusercontent.com/media/official-stockfish/networks/master/' + name
        pending = network.with_suffix('.download')
        with urllib.request.urlopen(source_url, timeout=60) as response, pending.open('wb') as output:
            while block := response.read(1024 * 1024):
                output.write(block)
        if sha256(pending) != NETWORK_HASH:
            raise RuntimeError('NNUE checksum failed; downloaded file retained for diagnosis')
        pending.replace(network)
    digest = sha256(network)
    if digest != NETWORK_HASH:
        raise RuntimeError('NNUE checksum failed')
    manifest = dict(sourceArchiveSHA256=SOURCE_HASH, network=name, networkSHA256=digest,
                    networkBytes=network.stat().st_size)
    (BUILD / 'engine-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(manifest), flush=True)
    return source, network


if __name__ == '__main__':
    prepare()
