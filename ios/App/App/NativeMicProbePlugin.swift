import AVFoundation
import Capacitor

/// Dev-only: inspect AVAudioSession + record raw Float32 via AVAudioEngine for level comparison with WKWebView.
@objc(NativeMicProbePlugin)
public class NativeMicProbePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeMicProbePlugin"
    public let jsName = "NativeMicProbe"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getSessionInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepareRecordingSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "recordProbe", returnType: CAPPluginReturnPromise),
    ]

    private let probeQueue = DispatchQueue(label: "com.nabadai.music.nativeMicProbe")
    private let samplesLock = NSLock()
    private var probeEngine: AVAudioEngine?
    private var probeSamples: [Float] = []
    private var probeSampleRate: Double = 44100

    // MARK: - Session info (read-only)

    @objc func getSessionInfo(_ call: CAPPluginCall) {
        probeQueue.async {
            call.resolve(Self.sessionSnapshot())
        }
    }

    /// Configure playAndRecord like a native recorder (no app gain — session routing only).
    @objc func prepareRecordingSession(_ call: CAPPluginCall) {
        probeQueue.async {
            do {
                let after = try Self.configureRecordingSession()
                call.resolve(after)
            } catch {
                call.reject("prepareRecordingSession failed: \(error.localizedDescription)")
            }
        }
    }

    /// Minimal AVAudioEngine tap — raw Float32 PCM, no DSP, no normalization.
    @objc func recordProbe(_ call: CAPPluginCall) {
        let durationSec = min(max(call.getDouble("durationSec") ?? 5.0, 1.0), 30.0)
        let configure = call.getBool("configureSession") ?? true

        probeQueue.async { [weak self] in
            guard let self = self else { return }
            do {
                if configure {
                    _ = try Self.configureRecordingSession()
                }
                let sessionBefore = Self.sessionSnapshot()
                let result = try self.runEngineProbe(durationSec: durationSec)
                var out = result
                out["session"] = sessionBefore
                out["sessionAfterConfigure"] = Self.sessionSnapshot()
                call.resolve(out)
            } catch {
                self.stopProbeEngine()
                call.reject("recordProbe failed: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - AVAudioEngine probe

    private func runEngineProbe(durationSec: Double) throws -> [String: Any] {
        stopProbeEngine()
        probeSamples.removeAll(keepingCapacity: true)

        let engine = AVAudioEngine()
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        probeSampleRate = format.sampleRate
        let channels = Int(format.channelCount)

        input.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, _ in
            guard let self = self else { return }
            guard let chData = buffer.floatChannelData else { return }
            let frames = Int(buffer.frameLength)
            if frames <= 0 { return }
            self.samplesLock.lock()
            if channels >= 2 {
                let ch0 = chData[0]
                let ch1 = chData[1]
                for i in 0..<frames {
                    let a = ch0[i]
                    let b = ch1[i]
                    self.probeSamples.append(abs(a) >= abs(b) ? a : b)
                }
            } else {
                let ch0 = chData[0]
                for i in 0..<frames { self.probeSamples.append(ch0[i]) }
            }
            self.samplesLock.unlock()
        }

        engine.prepare()
        try engine.start()
        probeEngine = engine

        let wait = DispatchSemaphore(value: 0)
        probeQueue.asyncAfter(deadline: .now() + durationSec) { wait.signal() }
        wait.wait()

        input.removeTap(onBus: 0)
        engine.stop()
        probeEngine = nil

        let peak = Self.peakLinear(probeSamples)
        let rms = Self.rmsLinear(probeSamples)
        let peakDb = Self.linearToDb(peak)
        let rmsDb = Self.linearToDb(rms)
        let wavPath = try Self.writeWavMono(samples: probeSamples, sampleRate: probeSampleRate)

        return [
            "durationSec": durationSec,
            "sampleRate": probeSampleRate,
            "sampleCount": probeSamples.count,
            "channelCount": channels,
            "peakLinear": peak,
            "peakDbfs": peakDb,
            "rmsDb": rmsDb,
            "clippingSamples": probeSamples.filter { abs($0) >= 0.999 }.count,
            "wavPath": wavPath,
            "capturePath": "AVAudioEngine inputNode tap (native Float32, gain 1.0)",
        ]
    }

    private func stopProbeEngine() {
        if let engine = probeEngine {
            engine.inputNode.removeTap(onBus: 0)
            engine.stop()
        }
        probeEngine = nil
    }

    // MARK: - Session configuration

    private static func configureRecordingSession() throws -> [String: Any] {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(
            .playAndRecord,
            mode: .default,
            options: [.allowBluetoothHFP, .defaultToSpeaker, .allowBluetoothA2DP]
        )
        if let inputs = session.availableInputs {
            let preferred = inputs.first(where: {
                $0.portType == .headsetMic || $0.portType == .usbAudio || $0.portType == .bluetoothHFP
            }) ?? inputs.first
            if let preferred = preferred {
                try session.setPreferredInput(preferred)
            }
        }
        try session.setActive(true, options: [])
        return sessionSnapshot()
    }

    static func sessionSnapshot() -> [String: Any] {
        let session = AVAudioSession.sharedInstance()
        let route = session.currentRoute
        var inputs: [[String: Any]] = []
        for port in route.inputs {
            var item: [String: Any] = [
                "portName": port.portName,
                "portType": port.portType.rawValue,
                "uid": port.uid,
            ]
            if #available(iOS 14.0, *) {
                item["isHeadsetMic"] = port.portType == .headsetMic
            }
            if port.selectedDataSource != nil {
                item["selectedDataSource"] = port.selectedDataSource?.dataSourceName ?? ""
            }
            inputs.append(item)
        }
        var available: [[String: Any]] = []
        for port in session.availableInputs ?? [] {
            available.append([
                "portName": port.portName,
                "portType": port.portType.rawValue,
            ])
        }
        var out: [String: Any] = [
            "category": session.category.rawValue,
            "mode": session.mode.rawValue,
            "categoryOptions": session.categoryOptions.rawValue,
            "sampleRate": session.sampleRate,
            "ioBufferDuration": session.ioBufferDuration,
            "inputNumberOfChannels": session.inputNumberOfChannels,
            "inputLatency": session.inputLatency,
            "isInputAvailable": session.isInputAvailable,
            "inputs": inputs,
            "availableInputs": available,
            "outputPorts": route.outputs.map { ["portName": $0.portName, "portType": $0.portType.rawValue] },
        ]
        if session.isInputGainSettable {
            out["inputGain"] = session.inputGain
            out["inputGainSettable"] = true
        } else {
            out["inputGainSettable"] = false
        }
        return out
    }

    // MARK: - Metrics + WAV

    private static func peakLinear(_ samples: [Float]) -> Float {
        var peak: Float = 0
        for s in samples { peak = max(peak, abs(s)) }
        return peak
    }

    private static func rmsLinear(_ samples: [Float]) -> Float {
        guard !samples.isEmpty else { return 0 }
        var sum: Double = 0
        for s in samples { sum += Double(s) * Double(s) }
        return Float(sqrt(sum / Double(samples.count)))
    }

    private static func linearToDb(_ linear: Float) -> Double {
        guard linear > 0 else { return -Double.infinity }
        return 20.0 * log10(Double(linear))
    }

    private static func writeWavMono(samples: [Float], sampleRate: Double) throws -> String {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("nabad-native-probe-\(Int(Date().timeIntervalSince1970)).wav")
        let numSamples = samples.count
        var data = Data(capacity: 44 + numSamples * 2)
        let byteRate = UInt32(sampleRate) * 2
        data.append(contentsOf: "RIFF".utf8)
        data.append(uint32LE(UInt32(36 + numSamples * 2)))
        data.append(contentsOf: "WAVE".utf8)
        data.append(contentsOf: "fmt ".utf8)
        data.append(uint32LE(16))
        data.append(uint16LE(1))
        data.append(uint16LE(1))
        data.append(uint32LE(UInt32(sampleRate)))
        data.append(uint32LE(byteRate))
        data.append(uint16LE(2))
        data.append(uint16LE(16))
        data.append(contentsOf: "data".utf8)
        data.append(uint32LE(UInt32(numSamples * 2)))
        for s in samples {
            let clamped = max(-1.0, min(1.0, s))
            var int16 = clamped < 0 ? Int16(clamped * 32768) : Int16(clamped * 32767)
            withUnsafeBytes(of: &int16) { data.append(contentsOf: $0) }
        }
        try data.write(to: url)
        return url.absoluteString
    }

    private static func uint16LE(_ v: UInt16) -> Data {
        var x = v.littleEndian
        return Data(bytes: &x, count: 2)
    }

    private static func uint32LE(_ v: UInt32) -> Data {
        var x = v.littleEndian
        return Data(bytes: &x, count: 4)
    }
}
