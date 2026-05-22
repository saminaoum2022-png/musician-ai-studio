import Capacitor
import UIKit

/// Transparent WKWebView so @capacitor-community/camera-preview can render behind the HTML layer.
final class BridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        applyTransparentWebView()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        applyTransparentWebView()
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
}
