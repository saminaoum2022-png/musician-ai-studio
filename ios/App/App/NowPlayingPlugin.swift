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
    private static var remoteCommandsReady = false

    public override func load() {
        NowPlayingPlugin.ensureRemoteCommands(plugin: self)
    }

    @objc public func update(_ call: CAPPluginCall) {
        let title = call.getString("title") ?? ""
        let artist = call.getString("artist") ?? ""
        let artworkUrl = call.getString("artworkUrl") ?? ""
        let duration = call.getDouble("duration") ?? 0
        let position = call.getDouble("position") ?? 0
        let rate = call.getDouble("playbackRate") ?? 1.0
        let isPlaying = call.getBool("isPlaying") ?? false

        DispatchQueue.main.async {
            NowPlayingPlugin.configureAudioSession()
            var info: [String: Any] = [
                MPMediaItemPropertyTitle: title,
                MPMediaItemPropertyArtist: artist,
                MPNowPlayingInfoPropertyElapsedPlaybackTime: max(0, position),
                MPMediaItemPropertyPlaybackDuration: max(0, duration),
                MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? max(0, rate) : 0,
            ]
            if let existing = MPNowPlayingInfoCenter.default().nowPlayingInfo,
               let art = existing[MPMediaItemPropertyArtwork] as? MPMediaItemArtwork,
               artworkUrl == self.lastArtworkUrl || artworkUrl.isEmpty {
                info[MPMediaItemPropertyArtwork] = art
            }
            MPNowPlayingInfoCenter.default().nowPlayingInfo = info
            self.loadArtworkIfNeeded(urlString: artworkUrl)
            call.resolve()
        }
    }

    @objc public func clear(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.artworkTask?.cancel()
            self.artworkTask = nil
            self.lastArtworkUrl = ""
            MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            call.resolve()
        }
    }

    private func loadArtworkIfNeeded(urlString: String) {
        let trimmed = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let url = URL(string: trimmed) else { return }
        if trimmed == lastArtworkUrl { return }
        lastArtworkUrl = trimmed
        artworkTask?.cancel()
        artworkTask = URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let self = self, let data = data, let image = UIImage(data: data) else { return }
            let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
            DispatchQueue.main.async {
                guard self.lastArtworkUrl == trimmed else { return }
                var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
                info[MPMediaItemPropertyArtwork] = artwork
                MPNowPlayingInfoCenter.default().nowPlayingInfo = info
            }
        }
        artworkTask?.resume()
    }

    private static func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: [])
            try session.setActive(true)
        } catch {
            CAPLog.print("NowPlaying: AVAudioSession error \(error)")
        }
    }

    private static func ensureRemoteCommands(plugin: NowPlayingPlugin) {
        guard !remoteCommandsReady else { return }
        remoteCommandsReady = true
        configureAudioSession()
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
