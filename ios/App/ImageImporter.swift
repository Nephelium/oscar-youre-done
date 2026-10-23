import UIKit
import ImageIO

final class ImageImporter {
    private(set) var image:CGImage?
    private var pending:String?
    private var region:BoardRegion?
    private let profiles:[URL]
    private let lock=NSRecursiveLock()
    init(webRoot:URL) {
        profiles=["duolingo-board-profile","duolingo-night-profile"].map{webRoot.appendingPathComponent("review/assets/\($0).json")}
    }
    func select(_ url:URL) throws {
        lock.lock();defer{lock.unlock()}
        guard let source=CGImageSourceCreateWithURL(url as CFURL,nil),
              let properties=CGImageSourceCopyPropertiesAtIndex(source,0,nil) as? [CFString:Any],
              let w=properties[kCGImagePropertyPixelWidth] as? Int,let h=properties[kCGImagePropertyPixelHeight] as? Int,
              w>0,h>0,w<=16000,h<=16000,w*h<=60_000_000,
              let image=CGImageSourceCreateThumbnailAtIndex(source,0,[kCGImageSourceCreateThumbnailFromImageAlways:true,kCGImageSourceCreateThumbnailWithTransform:true,kCGImageSourceThumbnailMaxPixelSize:2400] as CFDictionary) else { throw OscarError("请选择清晰的棋盘截图") }
        self.image=image;pending=nil;region=nil
    }
    func preview()->String {
        lock.lock();defer{lock.unlock()}
        guard let image else {return ""}
        let size=CGSize(width:Double(image.width)*min(1,900.0/Double(image.width)),height:Double(image.height)*min(1,900.0/Double(image.width)))
        let format=UIGraphicsImageRendererFormat();format.scale=1
        let thumb=UIGraphicsImageRenderer(size:size,format:format).image{_ in UIImage(cgImage:image).draw(in:CGRect(origin:.zero,size:size))}
        return thumb.jpegData(compressionQuality:0.8).map{"data:image/jpeg;base64,"+$0.base64EncodedString()} ?? ""
    }
    func suggested()->BoardRegion? {
        lock.lock();defer{lock.unlock()}
        guard let image,let vision=try? BoardVision(profiles:profiles),let pixels=try? BoardPixels(image:image) else {return nil}
        return vision.locate(pixels)
    }
    func recognize(_ options:[String:Any]) throws -> String {
        lock.lock();defer{lock.unlock()}
        guard let image else {throw OscarError("请重新选择截图")}
        let vision=try BoardVision(profiles:profiles);vision.blackBottom=options["side"] as? String == "b"
        if let box=options["region"] as? [String:Any] {vision.region=try BoardRegion(box)}
        let pixels=try BoardPixels(image:image)
        guard let observation=vision.recognize(pixels),!observation.placement.contains("?"),observation.placement.filter({$0=="K"}).count==1,observation.placement.filter({$0=="k"}).count==1 else {throw OscarError("棋子未能识别清楚，请贴着棋格重新框选，选择没有提示遮挡的截图")}
        region=vision.region;pending=observation.placement+" w - - 0 1";return pending!
    }
    func confirm(_ options:[String:Any],store:GameStore,rules:ChessRules,evidence:URL) throws -> [String:Any] {
        lock.lock();defer{lock.unlock()}
        guard let fen=options["fen"] as? String,fen.split(separator:" ").first==pending?.split(separator:" ").first,let image,let region else {throw OscarError("请先识别截图中的局面")}
        _ = try rules.position(fen)
        let id="g"+UUID().uuidString.replacingOccurrences(of:"-",with:""),now=Date().timeIntervalSince1970*1000
        let name=id+"-source.jpg"
        let box=CGRect(x:Double(region.left)*Double(image.width),y:Double(region.top)*Double(image.height),width:Double(region.width)*Double(image.width),height:Double(region.height)*Double(image.height)).integral
        guard let cropped=image.cropping(to:box),let data=UIImage(cgImage:cropped).jpegData(compressionQuality:0.9) else {throw OscarError("无法保存棋盘画面")}
        try FileManager.default.createDirectory(at:evidence,withIntermediateDirectories:true)
        let game:[String:Any] = ["schema":1,"id":id,"title":"截图里的练习","source":"截图","notebook":"practice","initialFen":fen,"moves":[],"side":options["side"] as? String ?? "w","createdAt":now,"updatedAt":now,"analysis":[:],"branches":[],"issues":[],"capture":["mode":"position","state":"image","image":name]]
        // Evidence first, then atomic record commit. A failed save retains the pending position for retry.
        try data.write(to:evidence.appendingPathComponent(name),options:.atomic)
        let saved=try store.save(game);pending=nil;return saved
    }
}
