import contextlib
import io
from pathlib import Path
import tempfile
import unittest
import zipfile

from archive_device import options, package_for_resigning
from verify_device_archive import validate_info


class DevicePackagingTests(unittest.TestCase):
    def test_simulator_cannot_pass_as_device(self):
        with self.assertRaisesRegex(ValueError, 'iPhoneOS'):
            validate_info({'CFBundleSupportedPlatforms': ['iPhoneSimulator'], 'DTPlatformName': 'iphonesimulator'})

    def test_signing_requires_explicit_valid_arguments(self):
        with contextlib.redirect_stderr(io.StringIO()):
            for arguments in [[], ['--unsigned', '--build-number', '0'],
                              ['--unsigned', '--build-number', '../2'], ['--team-id', 'invalid'],
                              ['--team-id', 'ABCDEFGHIJ', '--package-for-resigning']]:
                with self.subTest(arguments=arguments), self.assertRaises(SystemExit):
                    options(arguments)

    def test_ipa_structure_permissions_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder); app = root/'Oscar.app'; app.mkdir()
            (app/'Oscar').write_bytes(b'test executable'); (app/'Oscar').chmod(0o755)
            (app/'Info.plist').write_bytes(b'test metadata')
            target = root/'unsigned.ipa'
            report = package_for_resigning(app, target)
            self.assertTrue(report['requiresUserSigning'])
            self.assertFalse(report['directlyInstallable'])
            with zipfile.ZipFile(target) as archive:
                self.assertIn('Payload/Oscar.app/Oscar', archive.namelist())
                self.assertIsNone(archive.testzip())
            with self.assertRaises(FileExistsError):
                package_for_resigning(app, target)


if __name__ == '__main__':
    unittest.main()
