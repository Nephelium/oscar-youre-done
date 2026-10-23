import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application:UIApplication,configurationForConnecting session:UISceneSession,options:UIScene.ConnectionOptions)->UISceneConfiguration {
        let configuration=UISceneConfiguration(name:"Oscar",sessionRole:session.role)
        configuration.delegateClass=OscarSceneDelegate.self
        return configuration
    }
}

final class OscarSceneDelegate:UIResponder,UIWindowSceneDelegate {
    var window:UIWindow?
    func scene(_ scene:UIScene,willConnectTo session:UISceneSession,options:UIScene.ConnectionOptions) {
        guard let scene=scene as? UIWindowScene else {return}
        let window=UIWindow(windowScene:scene)
        window.rootViewController=OscarViewController()
        self.window=window;window.makeKeyAndVisible()
    }
    func sceneWillResignActive(_ scene:UIScene) {
        (window?.rootViewController as? OscarViewController)?.pause()
    }
    func sceneDidBecomeActive(_ scene:UIScene) {
        (window?.rootViewController as? OscarViewController)?.resume()
    }
}
