"""Build an iPhoneOS archive, optionally package an unsigned IPA for re-signing.

Never uploads, logs in, creates certificates, or changes the developer account.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import zipfile

from prepare_engine import ROOT, BUILD, sha256
from verify_device_archive import verify_archive


def options(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--unsigned', action='store_true', help='Prepare without a developer account')
    mode.add_argument('--team-id', help='Use an existing signing team; no automatic provisioning')
    parser.add_argument('--build-number', default='2')
    parser.add_argument('--package-for-resigning', action='store_true', help='Unsigned IPA; requires user signing')
    args = parser.parse_args(argv)
    if not re.fullmatch(r'[1-9][0-9]{0,8}', args.build_number):
        parser.error('--build-number must contain 1 to 9 digits and be positive')
    if args.team_id and not re.fullmatch(r'[A-Z0-9]{10}', args.team_id):
        parser.error('--team-id must be a 10-character Apple team identifier')
    if args.package_for_resigning and not args.unsigned:
        parser.error('--package-for-resigning is only for unsigned builds')
    return args


def package_for_resigning(app, output):
    # Exclusive creation prevents overwriting an earlier published candidate.
    with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for item in sorted(app.rglob('*')):
            if item.is_symlink():
                raise RuntimeError('Review symlink packaging before adding framework bundles')
            if item.is_file():
                archive.write(item, 'Payload/Oscar.app/' + item.relative_to(app).as_posix())
    with zipfile.ZipFile(output) as archive:
        bad = archive.testzip()
        if bad:
            raise RuntimeError('IPA CRC validation failed: ' + bad)
        if 'Payload/Oscar.app/Oscar' not in archive.namelist():
            raise RuntimeError('IPA executable is missing')
    return {'name': output.name, 'bytes': output.stat().st_size, 'sha256': sha256(output),
            'requiresUserSigning': True, 'directlyInstallable': False}


def main():
    args = options()
    if sys.platform != 'darwin':
        raise SystemExit('Run this script on the Mac build host with Xcode installed.')
    env = dict(os.environ, OSCAR_BUILD_NUMBER=args.build_number)
    # A release archive must never inherit a private screenshot fixture setting.
    env.pop('OSCAR_IOS_TEST_FIXTURES', None)
    subprocess.run([sys.executable, str(ROOT/'ios/scripts/generate_project.py')], env=env, check=True)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    output = BUILD / 'device' / f'build-{args.build_number}-{stamp}'
    output.mkdir(parents=True, exist_ok=False)
    archive = output / 'Oscar.xcarchive'
    command = ['xcodebuild', '-project', str(BUILD/'Oscar.xcodeproj'), '-scheme', 'Oscar',
               '-configuration', 'Release', '-destination', 'generic/platform=iOS',
               '-archivePath', str(archive), '-derivedDataPath', str(BUILD/'DeviceDerivedData'),
               'ONLY_ACTIVE_ARCH=NO', 'SKIP_INSTALL=NO']
    if args.unsigned:
        command += ['CODE_SIGNING_ALLOWED=NO', 'CODE_SIGNING_REQUIRED=NO']
    else:
        command += ['CODE_SIGNING_ALLOWED=YES', 'DEVELOPMENT_TEAM=' + args.team_id]
    command += ['archive']
    started = time.monotonic()
    log = output / 'archive.log'
    print('Building iPhoneOS archive. Log: ' + str(log), flush=True)
    with log.open('w') as stream:
        result = subprocess.run(command, env=env, stdout=stream, stderr=subprocess.STDOUT)
    if result.returncode:
        print('\n'.join(log.read_text(errors='replace').splitlines()[-55:]), file=sys.stderr)
        raise SystemExit(result.returncode)
    report = verify_archive(archive, require_unsigned=args.unsigned)
    report['archiveSeconds'] = round(time.monotonic() - started, 2)
    if args.package_for_resigning:
        ipa = output / f"Oscar-iOS-{report['version']}-build{args.build_number}-unsigned.ipa"
        report['ipa'] = package_for_resigning(archive/'Products/Applications/Oscar.app', ipa)
        ipa.with_suffix('.ipa.sha256').write_text(report['ipa']['sha256']+'  '+ipa.name+'\n')
    (output/'verification.json').write_text(json.dumps(report, indent=2, ensure_ascii=False)+'\n')
    print(json.dumps(report, indent=2, ensure_ascii=False), flush=True)
    print('Output: ' + str(output), flush=True)


if __name__ == '__main__':
    main()
