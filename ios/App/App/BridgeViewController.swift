import Capacitor
import Security
import UIKit
import WebKit

/// Inject Keychain session before JS boots (Keychain survives force-quit).
final class BridgeViewController: CAPBridgeViewController {
    private static let authService = "com.nabadai.music.auth.vault"
    private static let authAccount = "mas_supabase_session_v1"
    private var didInjectAuthSession = false

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        registerAuthUserScriptIfNeeded()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        registerAuthUserScriptIfNeeded()
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
