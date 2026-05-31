import Capacitor
import Security
import UIKit

/// Transparent WKWebView so @capacitor-community/camera-preview can render behind the HTML layer.
final class BridgeViewController: CAPBridgeViewController {
    private static let authService = "com.nabadai.music.auth.vault"
    private static let authAccount = "mas_supabase_session_v1"
    private var didInjectAuthSession = false

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        applyTransparentWebView()
        injectAuthSessionIntoWebViewIfNeeded()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        applyTransparentWebView()
        injectAuthSessionIntoWebViewIfNeeded()
    }

    private func applyTransparentWebView() {
        guard let webView = webView else { return }
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        if #available(iOS 15.0, *) {
            webView.underPageBackgroundColor = .clear
        }
    }

    /// Restore Supabase session into WKWebView localStorage before JS boots (Keychain survives force-quit).
    private func injectAuthSessionIntoWebViewIfNeeded() {
        guard !didInjectAuthSession else { return }
        guard let json = Self.loadAuthSessionJson(), !json.isEmpty else { return }
        guard let webView = webView else { return }
        let b64 = Data(json.utf8).base64EncodedString()
        let script = """
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
        webView.evaluateJavaScript(script) { [weak self] _, error in
            if error == nil {
                self?.didInjectAuthSession = true
            }
        }
    }

    private static func loadAuthSessionJson() -> String? {
        var query: [String: Any] = [
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
