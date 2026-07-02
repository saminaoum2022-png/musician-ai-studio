import AVFoundation
import Capacitor
import MediaPlayer

@objc(NowPlayingPlugin)
public class NowPlayingPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NowPlayingPlugin"
    public let jsName = "NowPlaying"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
    ]

    private var artworkTask: URLSessionDataTask?
    private var lastArtworkUrl = ""
    private var lastArtworkDataUrl = ""
    private static var remoteCommandsReady = false
    private static var audioSessionConfigured = false

    public override func load() {
        NowPlayingPlugin.ensureRemoteCommands(plugin: self)
    }

    @objc public func update(_ call: CAPPluginCall) {
        let positionOnly = call.getBool("positionOnly") ?? false
        let duration = call.getDouble("duration") ?? 0
        let position = call.getDouble("position") ?? 0
        let rate = call.getDouble("playbackRate") ?? 1.0
        let isPlaying = call.getBool("isPlaying") ?? false

        if positionOnly {
            DispatchQueue.main.async {
                guard var info = MPNowPlayingInfoCenter.default().nowPlayingInfo else {
                    call.resolve()
                    return
                }
                info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = max(0, position)
                info[MPMediaItemPropertyPlaybackDuration] = max(0, duration)
                info[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? max(0, rate) : 0
                MPNowPlayingInfoCenter.default().nowPlayingInfo = info
                call.resolve()
            }
            return
        }

        let title = call.getString("title") ?? ""
        let artist = call.getString("artist") ?? ""
        let artworkUrl = call.getString("artworkUrl") ?? ""
        let artworkDataUrl = call.getString("artworkDataUrl") ?? ""

        DispatchQueue.main.async {
            var info: [String: Any] = [
                MPMediaItemPropertyTitle: title,
                MPMediaItemPropertyArtist: artist,
                MPNowPlayingInfoPropertyElapsedPlaybackTime: max(0, position),
                MPMediaItemPropertyPlaybackDuration: max(0, duration),
                MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? max(0, rate) : 0,
            ]
            // Keep the current frame visible until a new image is decoded — never flash the app icon.
            if let existing = MPNowPlayingInfoCenter.default().nowPlayingInfo,
               let art = existing[MPMediaItemPropertyArtwork] as? MPMediaItemArtwork {
                info[MPMediaItemPropertyArtwork] = art
            }
            MPNowPlayingInfoCenter.default().nowPlayingInfo = info

            if !artworkDataUrl.isEmpty {
                self.loadArtworkFromDataUrl(artworkDataUrl)
            } else if !artworkUrl.isEmpty {
                self.loadArtworkIfNeeded(urlString: artworkUrl)
            }
            call.resolve()
        }
    }

    @objc public func clear(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.artworkTask?.cancel()
            self.artworkTask = nil
            self.lastArtworkUrl = ""
            self.lastArtworkDataUrl = ""
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            call.resolve()
        }
    }

    private func applyArtwork(_ image: UIImage, urlKey: String, dataKey: String) {
        let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
        DispatchQueue.main.async {
            guard self.lastArtworkUrl == urlKey, self.lastArtworkDataUrl == dataKey else { return }
            var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
            info[MPMediaItemPropertyArtwork] = artwork
            MPNowPlayingInfoCenter.default().nowPlayingInfo = info
        }
    }

    private func loadArtworkFromDataUrl(_ dataUrl: String) {
        let trimmed = dataUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if trimmed == lastArtworkDataUrl { return }
        lastArtworkDataUrl = trimmed
        lastArtworkUrl = ""
        artworkTask?.cancel()
        artworkTask = nil

        guard let comma = trimmed.firstIndex(of: ",") else { return }
        let encoded = String(trimmed[trimmed.index(after: comma)...])
        guard let data = Data(base64Encoded: encoded, options: .ignoreUnknownCharacters),
              let image = UIImage(data: data) else { return }
        applyArtwork(image, urlKey: "", dataKey: trimmed)
    }

    private func loadArtworkIfNeeded(urlString: String) {
        let trimmed = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let url = URL(string: trimmed) else { return }
        if trimmed == lastArtworkUrl { return }
        lastArtworkUrl = trimmed
        lastArtworkDataUrl = ""
        artworkTask?.cancel()
        artworkTask = URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let self = self, let data = data, let image = UIImage(data: data) else { return }
            self.applyArtwork(image, urlKey: trimmed, dataKey: "")
        }
        artworkTask?.resume()
    }

    /// Configure once — repeated `setActive(true)` on every metadata tick was
    /// stealing the session from WKWebView `<audio>` and cutting songs off ~1s in.
    private static func configureAudioSessionIfNeeded() {
        guard !audioSessionConfigured else { return }
        audioSessionConfigured = true
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
        } catch {
            CAPLog.print("NowPlaying: AVAudioSession error \(error)")
        }
    }

    private static func ensureRemoteCommands(plugin: NowPlayingPlugin) {
        guard !remoteCommandsReady else { return }
        remoteCommandsReady = true
        configureAudioSessionIfNeeded()
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.isEnabled = true
        center.pauseCommand.isEnabled = true
        center.togglePlayPauseCommand.isEnabled = true
        center.nextTrackCommand.isEnabled = true

        center.playCommand.addTarget { _ in
            plugin.notifyRemote(action: "play")
            return .success
        }
        center.pauseCommand.addTarget { _ in
            plugin.notifyRemote(action: "pause")
            return .success
        }
        center.togglePlayPauseCommand.addTarget { _ in
            plugin.notifyRemote(action: "toggle")
            return .success
        }
        center.nextTrackCommand.addTarget { _ in
            plugin.notifyRemote(action: "next")
            return .success
        }
    }

    private func notifyRemote(action: String) {
        notifyListeners("remoteAction", data: ["action": action])
    }
}
