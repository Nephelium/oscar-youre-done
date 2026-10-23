"""Inspect a device archive locally; this is not App Store server validation."""
import argparse
import json
from pathlib import Path
import plistlib
import re
import subprocess

from prepare_engine import NETWORK_HASH, sha256


def validate_info(info):
    if info.get('CFBundleSupportedPlatforms') != ['iPhoneOS'] or info.get('DTPlatformName') != 'iphoneos':
        raise ValueError('Expected an iPhoneOS build, not a Simulator app')
    if info.get('UIDeviceFamily') != [1, 2]:
        raise ValueError('Unexpected device families')
    if info.get('ITSAppUsesNonExemptEncryption') is not False:
        raise ValueError('Missing reviewed encryption declaration')
    ipad_orientations = {'UIInterfaceOrientationPortrait', 'UIInterfaceOrientationPortraitUpsideDown',
                         'UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight'}
    if set(info.get('UISupportedInterfaceOrientations~ipad', [])) != ipad_orientations:
        raise ValueError('iPad multitasking requires all four orientations')
    if not re.fullmatch(r'[1-9][0-9]{0,8}', info.get('CFBundleVersion', '')):
        raise ValueError('Invalid build number')


def command(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.STDOUT).strip()


def verify_archive(archive, require_unsigned=True):
    app = archive/'Products/Applications/Oscar.app'
    info = plistlib.loads((app/'Info.plist').read_bytes())
    validate_info(info)
    executable = app/info['CFBundleExecutable']
    architectures = command('xcrun', 'lipo', '-archs', str(executable)).split()
    if architectures != ['arm64']:
        raise ValueError('Unexpected device architectures: ' + str(architectures))
    load_commands = command('xcrun', 'otool', '-l', str(executable))
    if not re.search(r'platform\s+(?:IOS|2)\b', load_commands) or 'IOSSIMULATOR' in load_commands:
        raise ValueError('Mach-O platform is not iOS')
    privacy = plistlib.loads((app/'PrivacyInfo.xcprivacy').read_bytes())
    expected = {'NSPrivacyAccessedAPICategoryUserDefaults': 'CA92.1',
                'NSPrivacyAccessedAPICategoryFileTimestamp': 'C617.1',
                'NSPrivacyAccessedAPICategorySystemBootTime': '35F9.1'}
    for category, reason in expected.items():
        if not any(row.get('NSPrivacyAccessedAPIType') == category and reason in row.get('NSPrivacyAccessedAPITypeReasons', [])
                   for row in privacy.get('NSPrivacyAccessedAPITypes', [])):
            raise ValueError('Missing privacy reason: ' + category)
    if privacy.get('NSPrivacyTracking') is not False or privacy.get('NSPrivacyCollectedDataTypes') != []:
        raise ValueError('Unexpected collection or tracking declaration')
    if sha256(app/'nn-1a298aa575a0.nnue') != NETWORK_HASH:
        raise ValueError('NNUE checksum differs')
    for relative in ['web/review/index.html', 'web/vendor/chess.min.js', 'web/src/controlMap.js',
                     'NativeBridge.js', 'licenses/stockfish.txt', 'Assets.car']:
        if not (app/relative).is_file():
            raise ValueError('Missing resource: ' + relative)
    private_files = [str(p.relative_to(app)) for p in app.rglob('*') if
                     p.suffix.lower() in {'.mp4', '.p12', '.p8', '.pem', '.xctest'} or
                     re.search(r'duolingo-game-\d+|visionFixtures', p.name)]
    if private_files:
        raise ValueError('Unexpected private/test/signing asset: ' + str(private_files))
    signing = subprocess.run(['codesign', '-dv', str(app)], capture_output=True, text=True)
    if require_unsigned and (signing.returncode == 0 or (app/'_CodeSignature').exists() or (app/'embedded.mobileprovision').exists()):
        raise ValueError('Expected an unsigned app for user re-signing')
    if not require_unsigned:
        subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True)
    binary_uuid = command('xcrun', 'dwarfdump', '--uuid', str(executable)).splitlines()[0].split()[1]
    symbols = archive/'dSYMs/Oscar.app.dSYM/Contents/Resources/DWARF/Oscar'
    symbol_uuid = command('xcrun', 'dwarfdump', '--uuid', str(symbols)).splitlines()[0].split()[1]
    if binary_uuid != symbol_uuid:
        raise ValueError('Debug symbols do not match the executable')
    return {'version': info['CFBundleShortVersionString'], 'build': info['CFBundleVersion'],
            'platform': 'iPhoneOS', 'architectures': architectures, 'minimumOS': info['MinimumOSVersion'],
            'binarySHA256': sha256(executable), 'debugSymbolsMatch': True, 'privacyManifestPresent': True,
            'networkSHA256': NETWORK_HASH, 'unsigned': require_unsigned, 'privateTestAssets': private_files,
            'physicalDeviceTested': False, 'appStoreValidationPerformed': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--signed', action='store_true')
    args = parser.parse_args()
    print(json.dumps(verify_archive(args.archive, require_unsigned=not args.signed), indent=2))
