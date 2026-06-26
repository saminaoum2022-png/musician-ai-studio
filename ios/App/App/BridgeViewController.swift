import Capacitor
import ObjectiveC
import Security
import UIKit
import WebKit

/// Inject Keychain session before JS boots (Keychain survives force-quit).
final class BridgeViewController: CAPBridgeViewController {
    private static let authService = "com.nabadai.music.auth.vault"
    private static let authAccount = "mas_supabase_session_v1"
    private var didInjectAuthSession = false
    private var didStripInputAccessory = false

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        registerAuthUserScriptIfNeeded()
        removeInputAccessoryView()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        registerAuthUserScriptIfNeeded()
        removeInputAccessoryView()
    }

    /// Strip the WKWebView input accessory view (the `^ v ✓` bar iOS shows above
    /// the keyboard for web inputs). Native chat apps don't show it, and it also
    /// inflates the keyboard region, leaving a dead gap above the message
    /// composer. We do this by reclassing the internal content view to a subclass
    /// whose `inputAccessoryView` returns nil — the standard WKWebView technique.
    private func removeInputAccessoryView() {
        guard !didStripInputAccessory, let webView = webView else { return }
        guard let contentView = webView.scrollView.subviews.first(where: {
            String(describing: type(of: $0)).hasPrefix("WKContent")
        }) else { return }

        let newClassName = "NabadAi_NoInputAccessoryWKContentView"
        if let existingClass = NSClassFromString(newClassName) {
            object_setClass(contentView, existingClass)
            didStripInputAccessory = true
            return
        }

        let baseClass: AnyClass = type(of: contentView)
        guard let newClass = objc_allocateClassPair(baseClass, newClassName, 0) else { return }
        let selector = #selector(getter: UIResponder.inputAccessoryView)
        guard let method = class_getInstanceMethod(UIResponder.self, selector) else { return }
        let block: @convention(block) (AnyObject) -> UIView? = { _ in nil }
        let imp = imp_implementationWithBlock(block)
        class_addMethod(newClass, selector, imp, method_getTypeEncoding(method))
        objc_registerClassPair(newClass)
        object_setClass(contentView, newClass)
        didStripInputAccessory = true
    }

    private func registerAuthUserScriptIfNeeded() {
        guard !didInjectAuthSession, let webView = webView else { return }
        if let json = Self.loadAuthSessionJson(), !json.isEmpty {
            let b64 = Data(json.utf8).base64EncodedString()
            let source = """
            (function(){
              try {
                var raw = atob('\(b64)');
                if (!raw) return;
                localStorage.setItem('mas:supabase:session:v1', raw);
                localStorage.setItem('mas:supabase:session:backup:v1', raw);
                window.dispatchEvent(new Event('nabad-auth-injected'));
              } catch(e) {}
            })();
            """
            webView.configuration.userContentController.addUserScript(
                WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
            )
        }
        didInjectAuthSession = true
    }

    private static func loadAuthSessionJson() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: authService,
            kSecAttrAccount as String: authAccount,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
