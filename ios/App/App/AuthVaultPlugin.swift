import Foundation
import Capacitor
import Security

/// Persists Supabase session JSON in the iOS Keychain (survives force-quit; not WKWebView localStorage).
@objc(AuthVaultPlugin)
public class AuthVaultPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AuthVaultPlugin"
    public let jsName = "AuthVault"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
    ]

    private let service = "com.nabadai.music.auth.vault"
    private let account = "mas_supabase_session_v1"

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let value = call.getString("value") else {
            call.reject("Must provide value")
            return
        }
        let data = Data(value.utf8)
        var query = baseQuery()
        SecItemDelete(query as CFDictionary)
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(query as CFDictionary, nil)
        if status == errSecSuccess {
            call.resolve()
        } else {
            call.reject("Keychain write failed (\(status))")
        }
    }

    @objc func get(_ call: CAPPluginCall) {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecSuccess, let data = item as? Data, let value = String(data: data, encoding: .utf8) {
            call.resolve(["value": value])
        } else {
            call.resolve(["value": NSNull()])
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        let query = baseQuery()
        SecItemDelete(query as CFDictionary)
        call.resolve()
    }
}
