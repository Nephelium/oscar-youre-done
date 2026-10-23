import UIKit
import WebKit
import PhotosUI
import UniformTypeIdentifiers

private final class WeakBridgeHandler:NSObject,WKScriptMessageHandler {
    weak var target:WKScriptMessageHandler?
    init(_ target:WKScriptMessageHandler) {self.target=target}
    func userContentController(_ controller:WKUserContentController,didReceive message:WKScriptMessage) {target?.userContentController(controller,didReceive:message)}
}

final class OscarViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, PHPickerViewControllerDelegate {
    private var web: WKWebView!
    private var webRoot: URL!
    private var store: GameStore!
    private var engine: StockfishService!
    private var rules: ChessRules!
    private var dark = false
    private var ready = false
    private var imageImporter:ImageImporter!
    private var evidenceRoot:URL!
    private let imageQueue=DispatchQueue(label:"oscar.image",qos:.userInitiated)

    override func viewDidLoad() {
        super.viewDidLoad()
        do {
            guard let root = Bundle.main.url(forResource:"web",withExtension:nil),
                  let bridge = Bundle.main.url(forResource:"NativeBridge",withExtension:"js"),
                  let network = Bundle.main.url(forResource:"nn-1a298aa575a0",withExtension:"nnue") else {
                throw OscarError("应用资源不完整，请重新安装")
            }
            webRoot = root
            rules = try ChessRules(chessURL:root.appendingPathComponent("vendor/chess.min.js"), coreURL:root.appendingPathComponent("review/core.js"))
            let support = try FileManager.default.url(for:.applicationSupportDirectory,in:.userDomainMask,appropriateFor:nil,create:true)
            store = try GameStore(directory:support.appendingPathComponent("games"),rules:rules)
            engine = StockfishService(rules:rules,networkURL:network)
            evidenceRoot=support.appendingPathComponent("evidence")
            imageImporter=ImageImporter(webRoot:root)
            let config = WKWebViewConfiguration()
            config.websiteDataStore = .default()
            config.userContentController.add(WeakBridgeHandler(self),name:"oscar")
            config.userContentController.addUserScript(WKUserScript(source:try String(contentsOf:bridge,encoding:.utf8),injectionTime:.atDocumentStart,forMainFrameOnly:true))
            web = WKWebView(frame:.zero,configuration:config)
            web.navigationDelegate = self; web.uiDelegate = self
            web.isOpaque = false; web.scrollView.contentInsetAdjustmentBehavior = .never
            web.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(web)
            NSLayoutConstraint.activate([
                web.topAnchor.constraint(equalTo:view.safeAreaLayoutGuide.topAnchor),
                web.bottomAnchor.constraint(equalTo:view.safeAreaLayoutGuide.bottomAnchor),
                web.leadingAnchor.constraint(equalTo:view.safeAreaLayoutGuide.leadingAnchor),
                web.trailingAnchor.constraint(equalTo:view.safeAreaLayoutGuide.trailingAnchor)
            ])
            applyAppearance(traitCollection.userInterfaceStyle == .dark)
            web.loadFileURL(root.appendingPathComponent("review/index.html"),allowingReadAccessTo:root)
        } catch { showStartupError(error.localizedDescription) }
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { dark ? .lightContent : .darkContent }
    override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        if previousTraitCollection?.userInterfaceStyle != traitCollection.userInterfaceStyle {
            emit(["type":"appearance","nightMode":traitCollection.userInterfaceStyle == .dark])
        }
    }
    private func applyAppearance(_ isDark: Bool) {
        dark = isDark
        let color = isDark ? UIColor(red:0.075,green:0.12,blue:0.14,alpha:1) : UIColor(red:0.98,green:0.973,blue:0.945,alpha:1)
        view.backgroundColor = color; web?.backgroundColor = color; web?.scrollView.backgroundColor = color
        setNeedsStatusBarAppearanceUpdate()
    }
    private func showStartupError(_ message: String) {
        let label = UILabel(); label.text = "无法打开奥斯卡你完了\n\n" + message
        label.numberOfLines = 0; label.textAlignment = .center; label.translatesAutoresizingMaskIntoConstraints = false
        view.backgroundColor = .systemBackground; view.addSubview(label)
        NSLayoutConstraint.activate([label.leadingAnchor.constraint(equalTo:view.leadingAnchor,constant:24), label.trailingAnchor.constraint(equalTo:view.trailingAnchor,constant:-24), label.centerYAnchor.constraint(equalTo:view.centerYAnchor)])
    }
    func pause() { engine?.cancel(); if ready { web.evaluateJavaScript("window.App && App.pause()",completionHandler:nil) } }
    func resume() { if ready { web.evaluateJavaScript("window.App && App.resume()",completionHandler:nil) } }
    private func trusted(_ frame: WKFrameInfo) -> Bool {
        guard frame.isMainFrame, let url = frame.request.url, url.isFileURL, let webRoot else { return false }
        return url.standardizedFileURL.path.hasPrefix(webRoot.standardizedFileURL.path + "/")
    }
    private func json(_ value: Any) throws -> String {
        String(decoding:try JSONSerialization.data(withJSONObject:value,options:[.fragmentsAllowed]),as:UTF8.self)
    }
    private func object(_ value: Any?) throws -> [String:Any] {
        guard let text = value as? String, text.utf8.count <= GameStore.maxRecordBytes,
              let result = try JSONSerialization.jsonObject(with:Data(text.utf8)) as? [String:Any] else { throw OscarError("请求格式无效") }
        return result
    }
    private func status() -> [String:Any] {
        ["platform":"ios","engine":"Stockfish 19","version":"1.3.7",
         "nightMode":traitCollection.userInterfaceStyle == .dark,"themeReady":true,
         "moveFeedback":UserDefaults.standard.object(forKey:"moveFeedback") as? Bool ?? true,
         "overlay":false,"capture":["running":false],"video":["state":"idle"]]
    }
    private func synchronous(_ method: String, _ args: [Any]) throws -> Any {
        switch method {
        case "status": return try json(status())
        case "listGames": return try json(store.list())
        case "saveGame": try store.save(object(args.first)); return ""
        case "deleteGame": guard let id = args.first as? String else { throw OscarError("手记编号缺失") }; try store.delete(id); return ""
        case "readLicense":
            guard let name = args.first as? String, ["stockfish","chesslib"].contains(name),
                  let file = Bundle.main.url(forResource:name,withExtension:"txt",subdirectory:"licenses") else { return "" }
            return try String(contentsOf:file,encoding:.utf8)
        case "imagePreview": return imageImporter.preview()
        case "confirmImage":
            do {return try json(imageImporter.confirm(object(args.first),store:store,rules:rules,evidence:evidenceRoot))}
            catch {return try json(["error":error.localizedDescription])}
        case "evidence":
            guard let name=args.first as? String,name.range(of:"^[A-Za-z0-9_-]+\\.jpg$",options:.regularExpression) != nil else {return ""}
            let file=evidenceRoot.appendingPathComponent(name)
            guard let data=try? Data(contentsOf:file),data.count<8_000_000 else {return ""}
            return "data:image/jpeg;base64,"+data.base64EncodedString()
        case "capturePreview", "videoPreview": return ""
        default: throw OscarError("当前版本尚未提供此功能")
        }
    }
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        guard trusted(frame), prompt.hasPrefix("oscar-native:"), prompt.utf8.count <= GameStore.maxRecordBytes + 1024 else { completionHandler(nil); return }
        do {
            let request = try object(String(prompt.dropFirst("oscar-native:".count)))
            guard let method = request["method"] as? String, let args = request["args"] as? [Any] else { throw OscarError("请求格式无效") }
            completionHandler(try json(["value":synchronous(method,args)]))
        } catch { completionHandler(try? json(["error":error.localizedDescription])) }
    }
    func userContentController(_ userContentController: WKUserContentController,didReceive message: WKScriptMessage) {
        guard trusted(message.frameInfo), let body = message.body as? [String:Any],
              let method = body["method"] as? String, let args = body["args"] as? [Any] else { return }
        do {
            switch method {
            case "analyze", "analyzeLive", "playMove": try analyze(method,args)
            case "cancelAnalysis": engine.cancel()
            case "setAppearance": applyAppearance(args.first as? Bool ?? false)
            case "setMoveFeedback": UserDefaults.standard.set(args.first as? Bool ?? true,forKey:"moveFeedback")
            case "exportDocument": try export(args)
            case "selectImage":
                var config=PHPickerConfiguration();config.filter = .images;config.selectionLimit=1
                let picker=PHPickerViewController(configuration:config);picker.delegate=self;present(picker,animated:true)
            case "recognizeImage":
                let options=try object(args.first)
                imageQueue.async { [weak self] in
                    guard let self else {return}
                    do {let fen=try self.imageImporter.recognize(options);self.emit(["type":"imageRecognized","fen":fen])}
                    catch {self.emit(["type":"imageError","message":error.localizedDescription])}
                }
            case "suggestCrop":
                guard args.count>=2,args[0] as? String == "image" else {return}
                let request=args[1]
                imageQueue.async { [weak self] in
                    guard let self,let box=self.imageImporter.suggested() else {return}
                    self.emit(["type":"cropSuggested","requestId":request,"region":box.json])
                }
            case "openSource":
                guard let component = args.first as? String, ["stockfish19","stockfish16"].contains(component) else { return }
                UIApplication.shared.open(URL(string:"https://github.com/official-stockfish/Stockfish/tree/sf_19")!)
            case "openDuolingo":
                let url = URL(string:"duolingo://")!
                UIApplication.shared.open(url,options:[:]) { [weak self] ok in if !ok { self?.emit(["type":"nativeError","message":"请手动切回多邻国"]) } }
            default: throw OscarError("当前版本尚未提供此功能")
            }
        } catch {
            if ["analyze","analyzeLive","playMove"].contains(method), let id = args.first as? String {
                emit(["type":method == "playMove" ? "playMove" : "analysis","id":id,"error":error.localizedDescription])
            } else { emit(["type":"nativeError","message":error.localizedDescription]) }
        }
    }
    func picker(_ picker:PHPickerViewController,didFinishPicking results:[PHPickerResult]) {
        picker.dismiss(animated:true)
        guard let provider=results.first?.itemProvider else {return}
        provider.loadFileRepresentation(forTypeIdentifier:UTType.image.identifier) { [weak self] url,error in
            guard let self else {return}
            guard let url else {self.emit(["type":"nativeError","message":error?.localizedDescription ?? "无法读取图片"]);return}
            // The provider's temporary file is valid only during this callback.
            self.imageQueue.sync {
                do {try self.imageImporter.select(url);self.emit(["type":"imageReady"])}
                catch {self.emit(["type":"nativeError","message":error.localizedDescription])}
            }
        }
    }
    private func analyze(_ method: String,_ args: [Any]) throws {
        guard let request = args.first as? String, request.range(of:"^[A-Za-z0-9_-]{1,100}$",options:.regularExpression) != nil else { throw OscarError("分析请求无效") }
        let play = method == "playMove"
        guard args.count >= (play ? 2 : 4) else { throw OscarError("分析请求不完整") }
        let options = play ? try object(args[1]) : method == "analyzeLive" ? try object(args[3]) : [:]
        guard let fen = (play ? options["initialFen"] : args[2]) as? String, fen.utf8.count < 200 else { throw OscarError("局面无效") }
        let gameID = play ? "" : args[1] as? String ?? ""
        let moves = options["moves"] as? [String] ?? []
        guard moves.count <= 6000 else { throw OscarError("走法过多") }
        let budget = play ? 700 : method == "analyzeLive" ? options["budget"] as? Int ?? 700 : args[3] as? Int ?? 1500
        engine.search(fen:fen,moves:moves,budget:budget,depth:options["depth"] as? Int ?? 24,
            skill:options["skill"] as? Int ?? 20,infinite:options["infinite"] as? Bool ?? false,play:play,
            update:{ [weak self] result in
                if method == "analyzeLive" { self?.emit(["type":"analysisUpdate","id":request,"fen":fen,"result":result]) }
            },completion:{ [weak self] result in
                guard let self else { return }
                do {
                    let value = try result.get()
                    if method == "analyze", !gameID.isEmpty { try self.store.mergeAnalysis(id:gameID,fen:fen,result:value) }
                    self.emit(["type":play ? "playMove" : "analysis","id":request,"fen":fen,"result":value])
                } catch { self.emit(["type":play ? "playMove" : "analysis","id":request,"error":error.localizedDescription]) }
            })
    }
    private func export(_ args: [Any]) throws {
        guard args.count >= 2, let name = args[0] as? String, let content = args[1] as? String,
              content.utf8.count <= 64 * 1024 * 1024 else { throw OscarError("导出内容过大或格式无效") }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at:directory,withIntermediateDirectories:true)
        let file = directory.appendingPathComponent(URL(fileURLWithPath:name).lastPathComponent)
        try Data(content.utf8).write(to:file,options:.atomic)
        let sheet = UIActivityViewController(activityItems:[file],applicationActivities:nil)
        sheet.popoverPresentationController?.sourceView = view
        sheet.popoverPresentationController?.sourceRect = CGRect(x:view.bounds.midX,y:view.bounds.midY,width:1,height:1)
        sheet.completionWithItemsHandler = { _,_,_,_ in try? FileManager.default.removeItem(at:directory) }
        present(sheet,animated:true)
    }
    private func emit(_ event: [String:Any]) {
        DispatchQueue.main.async { [weak self] in
            guard let self, self.ready, let encoded = try? self.json(event) else { return }
            self.web.evaluateJavaScript("window.App && App.hostEvent(\(encoded))",completionHandler:nil)
        }
    }
    func webView(_ webView: WKWebView,decidePolicyFor navigationAction: WKNavigationAction,decisionHandler:@escaping (WKNavigationActionPolicy)->Void) {
        guard let url = navigationAction.request.url, url.isFileURL,
              url.standardizedFileURL.path.hasPrefix(webRoot.standardizedFileURL.path + "/") else { decisionHandler(.cancel); return }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView,didFinish navigation: WKNavigation!) { ready = true; resume() }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { ready = false; engine.cancel(); webView.reload() }
    func webView(_ webView: WKWebView,didFailProvisionalNavigation navigation: WKNavigation!,withError error: Error) { showStartupError(error.localizedDescription) }
}
