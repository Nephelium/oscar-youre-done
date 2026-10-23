import Foundation
import CoreGraphics

/// Canonical top-left RGBA pixels. Conversion happens once per sampled frame.
public struct BoardPixels {
    public let width: Int, height: Int
    public let bytes: [UInt8]
    public init(image: CGImage, maxWidth: Int = 720) throws {
        let factor = min(1,Double(maxWidth)/Double(image.width))
        let w = max(1,Int(Double(image.width)*factor)), h = max(1,Int(Double(image.height)*factor))
        guard h <= 16000, w*h <= 12_000_000 else { throw OscarError("图片尺寸过大") }
        var pixels = [UInt8](repeating:0,count:w*h*4)
        let ok = pixels.withUnsafeMutableBytes { data -> Bool in
            guard let context = CGContext(data:data.baseAddress,width:w,height:h,bitsPerComponent:8,bytesPerRow:w*4,
                space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue) else { return false }
            context.setFillColor(CGColor(gray:1,alpha:1)); context.fill(CGRect(x:0,y:0,width:w,height:h))
            context.interpolationQuality = .high
            context.draw(image,in:CGRect(x:0,y:0,width:w,height:h)); return true
        }
        guard ok else { throw OscarError("无法读取图片") }; width=w;height=h;bytes = pixels
    }
    public init(width: Int,height: Int,bytes:[UInt8]) throws {
        guard width>0,height>0,width<=16000,height<=16000,width*height<=12_000_000,bytes.count==width*height*4 else { throw OscarError("画面格式无效") }
        self.width=width;self.height=height;self.bytes=bytes
    }
    @inline(__always) func color(_ x:Int,_ y:Int,_ channel:Int) -> Int {
        Int(bytes[(min(height-1,max(0,y))*width+min(width-1,max(0,x)))*4+channel])
    }
}

public struct BoardRegion: Equatable {
    public var left:Float,top:Float,right:Float,bottom:Float
    public var width:Float { right-left }; public var height:Float { bottom-top }
    public init(left:Float,top:Float,right:Float,bottom:Float) throws {
        guard [left,top,right,bottom].allSatisfy({$0.isFinite && (0...1).contains($0)}),right-left>=0.1,bottom-top>=0.05 else { throw OscarError("棋盘范围无效") }
        self.left=left;self.top=top;self.right=right;self.bottom=bottom
    }
    public init(_ value:[String:Any]) throws {
        guard let l=value["left"] as? NSNumber,let t=value["top"] as? NSNumber,let r=value["right"] as? NSNumber,let b=value["bottom"] as? NSNumber else { throw OscarError("棋盘范围无效") }
        try self.init(left:l.floatValue,top:t.floatValue,right:r.floatValue,bottom:b.floatValue)
    }
    public var json:[String:Any] { ["left":left,"top":top,"right":right,"bottom":bottom] }
}

/// Same 24×24 RGB features, per-class L1 distances and confidence thresholds as
/// Android BoardRecognizer. Profiles contain features only, never screenshots.
public final class BoardVision {
    private var banks = [String:[Character:[[Float]]]]()
    public var region:BoardRegion? { didSet { gridReady=false;previous=nil;lastResult=nil } }
    public var blackBottom=false
    private var gridReady=false
    private var previous:[UInt8]?
    private var lastResult:Observation?
    private var lastSide=false
    public struct Observation { public let placement:String,confidence:Double }
    public init(profiles:[URL]) throws {
        for file in profiles {
            guard let data = try JSONSerialization.jsonObject(with:Data(contentsOf:file)) as? [String:Any] else { throw OscarError("棋子识别资源无效") }
            try load(data)
        }
        guard !banks.isEmpty else { throw OscarError("缺少棋子识别资源") }
    }
    private func load(_ data:[String:Any]) throws {
        let mode=data["appearance"] as? String ?? "light"
        guard data["schema"] as? Int == 2,["light","dark"].contains(mode),let templates=data["templates"] as? [String:Any] else { throw OscarError("棋子识别资源无效") }
        var parsed=[Character:[[Float]]]()
        for piece in ".prnbqkPRNBQK" {
            guard let rows=templates[String(piece)] as? [[NSNumber]],(1...32).contains(rows.count) else { throw OscarError("棋子模板缺失") }
            let values=rows.map{$0.map(\.floatValue)}
            guard values.allSatisfy({$0.count==1728 && $0.allSatisfy({$0.isFinite && abs($0)<=1})}) else { throw OscarError("棋子模板无效") }
            parsed[piece]=values
        }
        banks[mode]=parsed
        if let other=data["alternate"] as? [String:Any] { try load(other) }
    }
    public func locate(_ image:BoardPixels) -> BoardRegion? {
        let factor=min(1,440.0/Double(image.width)),w=Int(Double(image.width)*factor),h=Int(Double(image.height)*factor)
        let minimum=min(w,h),step=max(3,minimum/75)
        func score(_ x:Int,_ y:Int,_ size:Int)->Double {
            var sums=[Double](repeating:0,count:6),squares=sums
            for row in 0..<8 { for col in 0..<8 { for sample in 0..<4 {
                let dx=sample%2==0 ? 0.08:0.92,dy=sample<2 ? 0.08:0.92
                let px=Int((Double(x)+(Double(col)+dx)*Double(size)/8)/factor),py=Int((Double(y)+(Double(row)+dy)*Double(size)/8)/factor)
                for c in 0..<3 { let v=Double(image.color(px,py,c)),i=(row+col)%2*3+c;sums[i]+=v;squares[i]+=v*v }
            } } }
            var contrast=0.0,variance=0.0
            for c in 0..<3 { contrast+=abs(sums[c]/128-sums[c+3]/128)
                for p in 0..<2 {let i=p*3+c;variance+=max(0,squares[i]/128-pow(sums[i]/128,2))} }
            return contrast/3>8 ? contrast/3-sqrt(variance/6)*2.8 : -1
        }
        var best=0.0,bx=0,by=0,bs=0
        for size in stride(from:minimum,through:Int(Double(minimum)*0.58),by:-step) {
            for y in stride(from:0,through:h-size,by:step) { for x in stride(from:0,through:w-size,by:step) {
                let value=score(x,y,size);if value>best {best=value;bx=x;by=y;bs=size}
            } }
        }
        guard bs>0 else {return nil}
        let sx=bx,sy=by,ss=bs
        for size in max(16,ss-step)...min(minimum,ss+step) {
            for y in max(0,sy-step)...min(h-size,sy+step) {for x in max(0,sx-step)...min(w-size,sx+step) {
                let value=score(x,y,size);if value>best {best=value;bx=x;by=y;bs=size}
            }}
        }
        guard best>2 else {return nil}
        return try? BoardRegion(left:Float(bx)/Float(w),top:Float(by)/Float(h),right:Float(bx+bs)/Float(w),bottom:Float(by+bs)/Float(h))
    }
    private func refine(_ image:BoardPixels,_ rough:BoardRegion)->BoardRegion {
        let left=Double(rough.left)*Double(image.width),top=Double(rough.top)*Double(image.height),cell=Double(rough.width)*Double(image.width)/8
        let radius=max(4,Int(cell*0.18))
        func gradient(_ x:Double,_ y:Double,_ vertical:Bool)->Double {
            (0..<3).reduce(0.0){$0+Double(abs(image.color(Int(x)-(vertical ? 1:0),Int(y)-(vertical ? 0:1),$1)-image.color(Int(x)+(vertical ? 1:0),Int(y)+(vertical ? 0:1),$1)))/3}
        }
        func peak(_ center:Int,_ values:(Int)->[Double])->Double? {
            let scores=(center-radius...center+radius).map { i -> (Int,Double) in let v=values(i).sorted();return (i,v[v.count/2]) }
            let high=scores.map{$0.1}.max() ?? 0;guard high>=10 else {return nil}
            let best=scores.filter{$0.1>=high*0.98};return best.reduce(0.0){$0+Double($1.0)}/Double(best.count)
        }
        var boundaries=[Double]()
        for j in 1...7 {
            guard let x=peak(Int(left+Double(j)*cell),{x in
                (0..<8).flatMap{row in [0.1,0.9].map{gradient(Double(x),top+(Double(row)+$0)*cell,true)}}
            }) else {return rough}
            boundaries.append(x)
        }
        let mean=boundaries.reduce(0,+)/7,fittedCell=boundaries.enumerated().reduce(0.0){$0+Double($1.offset-3)*($1.element-mean)}/28,fittedLeft=mean-4*fittedCell
        guard fittedCell>=10,boundaries.enumerated().allSatisfy({abs($0.element-(fittedLeft+Double($0.offset+1)*fittedCell))<=fittedCell*0.05}) else {return rough}
        var tops=[Double]()
        for j in 3...5 {
            guard let y=peak(Int(top+Double(j)*cell),{y in
                (0..<8).flatMap{col in [0.1,0.9].map{gradient(fittedLeft+(Double(col)+$0)*fittedCell,Double(y),false)}}
            }) else {return rough}
            tops.append(y-Double(j)*fittedCell)
        }
        let fittedTop=tops.sorted()[1],size=fittedCell*8
        guard fittedLeft>=(-1),fittedTop>=(-1),fittedLeft+size<=Double(image.width)+1,fittedTop+size<=Double(image.height)+1 else {return rough}
        return (try? BoardRegion(left:Float(max(0,fittedLeft)/Double(image.width)),top:Float(max(0,fittedTop)/Double(image.height)),right:Float(min(Double(image.width),fittedLeft+size)/Double(image.width)),bottom:Float(min(Double(image.height),fittedTop+size)/Double(image.height)))) ?? rough
    }
    public func recognize(_ image:BoardPixels)->Observation? {
        guard var box=region ?? locate(image) else {return nil}
        if !gridReady {box=refine(image,box);region=box;gridReady=true}
        func point(_ index:Int,_ dx:Float,_ dy:Float)->(Int,Int) {
            (Int((box.left+(Float(index%8)+dx)*box.width/8)*Float(image.width)),Int((box.top+(Float(index/8)+dy)*box.height/8)*Float(image.height)))
        }
        let lights=(0..<64).map { i->Double in let(x,y)=point(i,0.08,0.08);return Double(image.color(x,y,0))*0.2126+Double(image.color(x,y,1))*0.7152+Double(image.color(x,y,2))*0.0722 }.sorted()
        guard let templates=banks[lights[32]<100 ? "dark":"light"] else {return nil}
        var fingerprint=[UInt8]();fingerprint.reserveCapacity(64*576*3)
        for i in 0..<64 {for y in 0..<24 {for x in 0..<24 {let(px,py)=point(i,0.04+(Float(x)+0.5)/24*0.92,0.04+(Float(y)+0.5)/24*0.92);for c in 0..<3 {fingerprint.append(UInt8(image.color(px,py,c)))}}}}
        if blackBottom==lastSide,let previous,let lastResult {
            var same=true
            for cell in 0..<64 {var total=0;for p in cell*1728..<(cell+1)*1728 {let delta=abs(Int(fingerprint[p])-Int(previous[p]));if delta>12 {same=false;break};total+=delta};if total>1728 {same=false};if !same {break}}
            if same {return lastResult}
        }
        var labels=[Character](),confidence=0.0,uncertain=0
        for index in 0..<64 {
            var colors=[(Int,Int,Int)](),counts=[Int:Int](),keys=[Int]()
            for s in 0..<16 {for edge in 0..<4 {
                let step=(Float(s)+0.5)/16,dx=edge<2 ? step:(edge==2 ? 0.14:0.86),dy=edge==0 ? 0.14:edge==1 ? 0.86:step
                let(x,y)=point(index,dx,dy),r=image.color(x,y,0),g=image.color(x,y,1),b=image.color(x,y,2),key=(r>>3)<<10 | (g>>3)<<5 | (b>>3)
                colors.append((r,g,b));if counts[key]==nil {keys.append(key)};counts[key,default:0]+=1
            }}
            var best=keys[0];for key in keys where counts[key]!>counts[best]! {best=key}
            var bg=[Double](repeating:0,count:3)
            for (r,g,b) in colors where ((r>>3)<<10 | (g>>3)<<5 | (b>>3))==best {let color=[r,g,b];for c in 0..<3 {bg[c]+=Double(color[c])/Double(counts[best]!)}}
            var feature=[Float]();feature.reserveCapacity(1728)
            for y in 0..<24 {for x in 0..<24 {let(px,py)=point(index,0.08+(Float(x)+0.5)/24*0.84,0.08+(Float(y)+0.5)/24*0.84);for c in 0..<3 {feature.append(Float((Double(image.color(px,py,c))-bg[c])/255))}}}
            var distances=[(Character,Double)]()
            for (piece,variants) in templates {
                var best=Double.infinity
                for variant in variants {var total=0.0;for i in feature.indices {total+=Double(abs(feature[i]-variant[i]));if total>=best*1728 {break}};best=min(best,total/1728)}
                distances.append((piece,best))
            }
            distances.sort{$0.1<$1.1}
            if distances[0].1>0.145 || distances[1].1-distances[0].1<0.0025 {uncertain+=1;if uncertain>1 {return nil};labels.append("?")}
            else {labels.append(distances[0].0);confidence+=max(0,min(1,1-distances[0].1))}
        }
        if blackBottom {labels.reverse()}
        let placement=(0..<8).map { row->String in var text="",empty=0;for col in 0..<8 {let p=labels[row*8+col];if p=="." {empty+=1}else{if empty>0 {text+=String(empty);empty=0};text.append(p)}};if empty>0{text+=String(empty)};return text }.joined(separator:"/")
        let result=Observation(placement:placement,confidence:confidence/64);previous=fingerprint;lastResult=result;lastSide=blackBottom;return result
    }
}
