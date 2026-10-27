"""Generate an Xcode project using Python's standard library, without XcodeGen."""
import hashlib
import json
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import sys
import gzip
import os
from prepare_engine import prepare, ROOT, BUILD


def quoted(value):
    if isinstance(value, dict):
        return '{\n' + '\n'.join(f'{quoted(str(k))} = {quoted(v)};' for k, v in value.items()) + '\n}'
    if isinstance(value, list):
        return '(' + ', '.join(quoted(x) for x in value) + ')'
    return json.dumps(str(value), ensure_ascii=False)


def generate():
    build_number = os.environ.get('OSCAR_BUILD_NUMBER', '1')
    if not re.fullmatch(r'[1-9][0-9]{0,8}', build_number):
        raise ValueError('OSCAR_BUILD_NUMBER must be a positive integer of at most 9 digits')
    source, network = prepare()
    resources = BUILD / 'resources'
    web = resources / 'web'
    shutil.copytree(ROOT / 'review', web / 'review', dirs_exist_ok=True)
    for name in ['duolingo-board-profile','duolingo-night-profile']:
        source_profile=ROOT/'review/assets'/f'{name}.json.gz'
        (web/'review/assets'/f'{name}.json').write_bytes(gzip.decompress(source_profile.read_bytes()))
    for relative in ['vendor/chess.min.js', 'src/controlMap.js']:
        target = web / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / relative, target)
    licenses = resources / 'licenses'
    licenses.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / 'vendor/stockfish/Copying.txt', licenses / 'stockfish.txt')
    shutil.copy2(ROOT / 'vendor/chesslib/LICENSE', licenses / 'chesslib.txt')
    icons = resources / 'Assets.xcassets/AppIcon.appiconset'
    icons.mkdir(parents=True, exist_ok=True)
    # Build-time icon sizing preserves the selected artwork.
    subprocess.run(['sips', '-z', '1024', '1024', str(ROOT / 'review/assets/oscar-panic.png'), '--out', str(icons / 'AppIcon.png')],check=True,stdout=subprocess.DEVNULL)
    (icons / 'Contents.json').write_text(json.dumps({'images':[{'filename':'AppIcon.png','idiom':'universal','platform':'ios','size':'1024x1024'}],'info':{'author':'xcode','version':1}}))
    (resources / 'Assets.xcassets/Contents.json').write_text(json.dumps({'info':{'author':'xcode','version':1}}))
    info = dict(CFBundleDisplayName='奥斯卡你完了', CFBundleName='Oscar', CFBundleIdentifier='$(PRODUCT_BUNDLE_IDENTIFIER)',
                CFBundleExecutable='$(EXECUTABLE_NAME)', CFBundlePackageType='APPL',
                CFBundleShortVersionString='1.3.8', CFBundleVersion=build_number,
                LSRequiresIPhoneOS=True, UILaunchScreen={},
                UIApplicationSceneManifest={'UIApplicationSupportsMultipleScenes':False,'UISceneConfigurations':{'UIWindowSceneSessionRoleApplication':[{'UISceneConfigurationName':'Oscar','UISceneDelegateClassName':'$(PRODUCT_MODULE_NAME).OscarSceneDelegate'}]}},
                UISupportedInterfaceOrientations=['UIInterfaceOrientationPortrait','UIInterfaceOrientationLandscapeLeft','UIInterfaceOrientationLandscapeRight'],
                UIRequiresFullScreen=False, LSApplicationQueriesSchemes=['duolingo'],
                ITSAppUsesNonExemptEncryption=False,
                NSPhotoLibraryUsageDescription='选择棋盘截图用于本地识别与复盘。')
    info['UISupportedInterfaceOrientations~ipad'] = [
        'UIInterfaceOrientationPortrait', 'UIInterfaceOrientationPortraitUpsideDown',
        'UIInterfaceOrientationLandscapeLeft', 'UIInterfaceOrientationLandscapeRight']
    (resources / 'Info.plist').write_bytes(plistlib.dumps(info))

    objects = {}
    def uid(key): return hashlib.sha1(key.encode()).hexdigest()[:24].upper()
    def add(key, isa, **fields):
        identifier = uid(key); objects[identifier] = dict(isa=isa, **fields); return identifier
    def file(path, kind):
        return add('file:' + str(path), 'PBXFileReference', lastKnownFileType=kind, path=str(path), sourceTree='<absolute>')
    def build(key, reference): return add('build:' + key,'PBXBuildFile',fileRef=reference)

    swift = sorted((ROOT / 'ios/Core').glob('*.swift')) + sorted((ROOT / 'ios/App').glob('*.swift'))
    makefile = (source / 'Makefile').read_text()
    names = re.search(r'^SRCS = (.*?)\n\n',makefile,re.M | re.S).group(1).replace('\\\n',' ').split()
    cpp = [source / name for name in names if name != 'main.cpp'] + [ROOT / 'ios/Engine/OscarEngine.cpp']
    source_refs = [file(path,'sourcecode.swift' if path.suffix == '.swift' else 'sourcecode.cpp.cpp') for path in swift + cpp]
    resource_refs = [file(web,'folder'),file(licenses,'folder'),file(resources/'Assets.xcassets','folder.assetcatalog'),
                     file(network,'file'),file(ROOT/'ios/App/NativeBridge.js','sourcecode.javascript'),
                     file(ROOT/'ios/App/PrivacyInfo.xcprivacy','text.xml')]
    product = add('product','PBXFileReference',explicitFileType='wrapper.application',path='Oscar.app',sourceTree='BUILT_PRODUCTS_DIR')
    products = add('products','PBXGroup',children=[product],name='Products',sourceTree='<group>')
    group = add('group','PBXGroup',children=source_refs+resource_refs+[products],sourceTree='<group>')
    sources_phase = add('sources','PBXSourcesBuildPhase',buildActionMask=2147483647,files=[build(x,x) for x in source_refs],runOnlyForDeploymentPostprocessing=0)
    resources_phase = add('resources','PBXResourcesBuildPhase',buildActionMask=2147483647,files=[build(x,x) for x in resource_refs],runOnlyForDeploymentPostprocessing=0)
    frameworks_phase = add('frameworks','PBXFrameworksBuildPhase',buildActionMask=2147483647,files=[],runOnlyForDeploymentPostprocessing=0)
    common = dict(IPHONEOS_DEPLOYMENT_TARGET='17.0', SDKROOT='iphoneos', SWIFT_VERSION='5.0', CLANG_CXX_LANGUAGE_STANDARD='c++20',
                  CLANG_ENABLE_MODULES='YES', CLANG_ENABLE_OBJC_ARC='YES', GCC_OPTIMIZATION_LEVEL='3',
                  GCC_PREPROCESSOR_DEFINITIONS=['$(inherited)','IS_64BIT','NNUE_EMBEDDING_OFF','NDEBUG'],
                  HEADER_SEARCH_PATHS=[str(source),str(ROOT/'ios/Engine')],
                  OTHER_LDFLAGS=['$(inherited)','-lc++','-framework','JavaScriptCore'],
                  ENABLE_USER_SCRIPT_SANDBOXING='YES')
    common['GCC_PREPROCESSOR_DEFINITIONS[arch=arm64]']=['$(inherited)','USE_NEON']
    common['GCC_PREPROCESSOR_DEFINITIONS[arch=x86_64]']=['$(inherited)','USE_SSE2']
    def config_list(prefix,settings):
        configs=[]
        for name in ['Debug','Release']:
            values=dict(settings)
            values.update(SWIFT_OPTIMIZATION_LEVEL='-Onone' if name=='Debug' else '-O',
                          ONLY_ACTIVE_ARCH='YES' if name=='Debug' else 'NO',
                          ENABLE_TESTABILITY='YES' if name=='Debug' else 'NO',
                          DEBUG_INFORMATION_FORMAT='dwarf' if name=='Debug' else 'dwarf-with-dsym')
            configs.append(add(prefix+name,'XCBuildConfiguration',buildSettings=values,name=name))
        return add(prefix+'list','XCConfigurationList',buildConfigurations=configs,defaultConfigurationIsVisible=0,defaultConfigurationName='Release')
    target_settings = dict(PRODUCT_NAME='Oscar',PRODUCT_BUNDLE_IDENTIFIER='com.jingjing.chesssprout.ios',
                           INFOPLIST_FILE=str(resources/'Info.plist'),SWIFT_OBJC_BRIDGING_HEADER=str(ROOT/'ios/App/Oscar-Bridging-Header.h'),
                           TARGETED_DEVICE_FAMILY='1,2',ASSETCATALOG_COMPILER_APPICON_NAME='AppIcon',
                           CODE_SIGN_STYLE='Automatic',GENERATE_INFOPLIST_FILE='NO',ENABLE_BITCODE='NO')
    target = add('target','PBXNativeTarget',buildConfigurationList=config_list('targetcfg',target_settings),buildPhases=[sources_phase,frameworks_phase,resources_phase],
                 buildRules=[],dependencies=[],name='Oscar',productName='Oscar',productReference=product,productType='com.apple.product-type.application')
    test_refs = [file(path,'sourcecode.swift') for path in sorted((ROOT/'ios/IntegrationTests').glob('*.swift'))]
    test_product = add('testproduct','PBXFileReference',explicitFileType='wrapper.cfbundle',path='OscarTests.xctest',sourceTree='BUILT_PRODUCTS_DIR')
    objects[group]['children'] += test_refs
    objects[products]['children'].append(test_product)
    test_sources = add('testsources','PBXSourcesBuildPhase',buildActionMask=2147483647,files=[build(x,x) for x in test_refs],runOnlyForDeploymentPostprocessing=0)
    test_phases=[test_sources]
    # Private fixtures enter only the test bundle, never the app's resources.
    fixture_dir=os.environ.get('OSCAR_IOS_TEST_FIXTURES')
    if fixture_dir:
        fixture=Path(fixture_dir)/'duolingo-game-01.png'
        if not fixture.is_file(): raise RuntimeError('Missing private test fixture')
        fixture_ref=file(fixture,'image.png')
        objects[group]['children'].append(fixture_ref)
        test_phases.append(add('testresources','PBXResourcesBuildPhase',buildActionMask=2147483647,files=[build('testfixture',fixture_ref)],runOnlyForDeploymentPostprocessing=0))
    proxy = add('testproxy','PBXContainerItemProxy',containerPortal=uid('project'),proxyType=1,remoteGlobalIDString=target,remoteInfo='Oscar')
    dependency = add('testdependency','PBXTargetDependency',target=target,targetProxy=proxy)
    test_settings = dict(PRODUCT_NAME='OscarTests',PRODUCT_BUNDLE_IDENTIFIER='com.jingjing.chesssprout.ios.tests',GENERATE_INFOPLIST_FILE='YES',
                         TEST_HOST='$(BUILT_PRODUCTS_DIR)/Oscar.app/$(BUNDLE_EXECUTABLE_FOLDER_PATH)/Oscar',BUNDLE_LOADER='$(TEST_HOST)',
                         CODE_SIGN_STYLE='Automatic',TARGETED_DEVICE_FAMILY='1,2')
    test_target = add('testtarget','PBXNativeTarget',buildConfigurationList=config_list('testcfg',test_settings),buildPhases=test_phases,
                      buildRules=[],dependencies=[dependency],name='OscarTests',productName='OscarTests',productReference=test_product,productType='com.apple.product-type.bundle.unit-test')
    ui_refs=[file(path,'sourcecode.swift') for path in sorted((ROOT/'ios/UITests').glob('*.swift'))]
    objects[group]['children'] += ui_refs
    ui_product=add('uiproduct','PBXFileReference',explicitFileType='wrapper.cfbundle',path='OscarUITests.xctest',sourceTree='BUILT_PRODUCTS_DIR')
    objects[products]['children'].append(ui_product)
    ui_sources=add('uisources','PBXSourcesBuildPhase',buildActionMask=2147483647,files=[build(x,x) for x in ui_refs],runOnlyForDeploymentPostprocessing=0)
    ui_settings=dict(PRODUCT_NAME='OscarUITests',PRODUCT_BUNDLE_IDENTIFIER='com.jingjing.chesssprout.ios.uitests',GENERATE_INFOPLIST_FILE='YES',TEST_TARGET_NAME='Oscar',CODE_SIGN_STYLE='Automatic',TARGETED_DEVICE_FAMILY='1,2')
    ui_info=resources/'UITestInfo.plist'
    ui_info.write_bytes(plistlib.dumps({'OscarPhotoFixture':'prepared' if fixture_dir else 'absent'}))
    ui_settings['INFOPLIST_FILE']=str(ui_info)
    ui_target=add('uitarget','PBXNativeTarget',buildConfigurationList=config_list('uicfg',ui_settings),buildPhases=[ui_sources],buildRules=[],dependencies=[dependency],name='OscarUITests',productName='OscarUITests',productReference=ui_product,productType='com.apple.product-type.bundle.ui-testing')
    project = add('project','PBXProject',attributes={'LastUpgradeCheck':'2600'},buildConfigurationList=config_list('projectcfg',common),
                  compatibilityVersion='Xcode 14.0',developmentRegion='zh-Hans',hasScannedForEncodings=0,knownRegions=['zh-Hans','en','Base'],
                  mainGroup=group,productRefGroup=products,projectDirPath='',projectRoot='',targets=[target,test_target,ui_target])
    output = BUILD / 'Oscar.xcodeproj'
    output.mkdir(parents=True,exist_ok=True)
    (output/'project.pbxproj').write_text('// !$*UTF8*$!\n'+quoted(dict(archiveVersion=1,classes={},objectVersion=56,objects=objects,rootObject=project))+'\n',encoding='utf-8')
    scheme = output/'xcshareddata/xcschemes/Oscar.xcscheme'
    scheme.parent.mkdir(parents=True,exist_ok=True)
    reference = f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{target}" BuildableName="Oscar.app" BlueprintName="Oscar" ReferencedContainer="container:Oscar.xcodeproj"/>'
    scheme.write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="2600" version="1.3">
<BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">{reference}</BuildActionEntry></BuildActionEntries></BuildAction>
<TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES"><Testables><TestableReference skipped="NO"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{test_target}" BuildableName="OscarTests.xctest" BlueprintName="OscarTests" ReferencedContainer="container:Oscar.xcodeproj"/></TestableReference><TestableReference skipped="NO"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{ui_target}" BuildableName="OscarUITests.xctest" BlueprintName="OscarUITests" ReferencedContainer="container:Oscar.xcodeproj"/></TestableReference></Testables></TestAction>
<LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0">{reference}</BuildableProductRunnable></LaunchAction>
<ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"><BuildableProductRunnable runnableDebuggingMode="0">{reference}</BuildableProductRunnable></ProfileAction>
<AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/>
</Scheme>''',encoding='utf-8')
    print(output)


if __name__ == '__main__':
    if sys.platform != 'darwin': raise SystemExit('Run this script on the authorized Mac build host.')
    generate()
