import AVFoundation
import Capacitor
import UIKit

// MARK: - Capacitor plugin

@objc(StoryCameraPlugin)
public class StoryCameraPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StoryCameraPlugin"
    public let jsName = "StoryCamera"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "capture", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
    ]

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["value": true])
    }

    @objc func capture(_ call: CAPPluginCall) {
        let position = call.getString("position") ?? "rear"
        let quality = min(100, max(50, call.getInt("quality") ?? 88))

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            guard let host = self.bridge?.viewController else {
                call.reject("No host view controller")
                return
            }
            if host.presentedViewController is StoryCameraViewController {
                call.reject("Story camera already open")
                return
            }

            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async {
                    if !granted {
                        call.reject("Camera permission denied")
                        return
                    }
                    let camera = StoryCameraViewController(
                        lensPosition: position == "front" ? .front : .back,
                        jpegQuality: CGFloat(quality) / 100.0
                    ) { outcome in
                        switch outcome {
                        case .captured(let dataUrl):
                            call.resolve(["cancelled": false, "dataUrl": dataUrl])
                        case .cancelled:
                            call.resolve(["cancelled": true])
                        case .failed(let message):
                            call.reject(message)
                        }
                    }
                    camera.modalPresentationStyle = .fullScreen
                    camera.modalTransitionStyle = .coverVertical
                    host.present(camera, animated: true)
                }
            }
        }
    }
}

// MARK: - Native story camera UI

private enum StoryCameraOutcome {
    case captured(String)
    case cancelled
    case failed(String)
}

private final class StoryCameraViewController: UIViewController {
    private let lensPosition: AVCaptureDevice.Position
    private let jpegQuality: CGFloat
    private let onFinish: (StoryCameraOutcome) -> Void

    private let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var currentInput: AVCaptureDeviceInput?
    private var currentPosition: AVCaptureDevice.Position
    private var isCapturing = false

    private let closeButton = UIButton(type: .system)
    private let flipButton = UIButton(type: .system)
    private let shutterButton = UIButton(type: .custom)
    private let shutterRing = UIView()

    init(lensPosition: AVCaptureDevice.Position, jpegQuality: CGFloat, onFinish: @escaping (StoryCameraOutcome) -> Void) {
        self.lensPosition = lensPosition
        self.currentPosition = lensPosition
        self.jpegQuality = jpegQuality
        self.onFinish = onFinish
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        setupChrome()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if previewLayer == nil {
            setupSession()
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
        if let connection = previewLayer?.connection, connection.isVideoOrientationSupported {
            connection.videoOrientation = .portrait
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        if isBeingDismissed || isMovingFromParent {
            stopSession()
        }
    }

    private func stopSession() {
        if session.isRunning {
            session.stopRunning()
        }
    }

    override var prefersStatusBarHidden: Bool { true }

    private func setupChrome() {
        let safe = view.safeAreaLayoutGuide

        closeButton.translatesAutoresizingMaskIntoConstraints = false
        closeButton.setImage(UIImage(systemName: "xmark", withConfiguration: UIImage.SymbolConfiguration(pointSize: 18, weight: .bold)), for: .normal)
        closeButton.tintColor = .white
        closeButton.backgroundColor = UIColor(white: 0, alpha: 0.35)
        closeButton.layer.cornerRadius = 20
        closeButton.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
        view.addSubview(closeButton)

        flipButton.translatesAutoresizingMaskIntoConstraints = false
        flipButton.setImage(UIImage(systemName: "arrow.triangle.2.circlepath.camera", withConfiguration: UIImage.SymbolConfiguration(pointSize: 22, weight: .medium)), for: .normal)
        flipButton.tintColor = .white
        flipButton.backgroundColor = UIColor(white: 0, alpha: 0.35)
        flipButton.layer.cornerRadius = 28
        flipButton.addTarget(self, action: #selector(flipTapped), for: .touchUpInside)
        view.addSubview(flipButton)

        shutterRing.translatesAutoresizingMaskIntoConstraints = false
        shutterRing.layer.cornerRadius = 40
        shutterRing.layer.borderWidth = 4
        shutterRing.layer.borderColor = UIColor.white.cgColor
        shutterRing.backgroundColor = .clear
        shutterRing.isUserInteractionEnabled = false
        view.addSubview(shutterRing)

        shutterButton.translatesAutoresizingMaskIntoConstraints = false
        shutterButton.backgroundColor = .white
        shutterButton.layer.cornerRadius = 34
        shutterButton.addTarget(self, action: #selector(shutterTapped), for: .touchUpInside)
        view.addSubview(shutterButton)

        NSLayoutConstraint.activate([
            closeButton.topAnchor.constraint(equalTo: safe.topAnchor, constant: 8),
            closeButton.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: 16),
            closeButton.widthAnchor.constraint(equalToConstant: 40),
            closeButton.heightAnchor.constraint(equalToConstant: 40),

            shutterButton.centerXAnchor.constraint(equalTo: safe.centerXAnchor),
            shutterButton.bottomAnchor.constraint(equalTo: safe.bottomAnchor, constant: -22),
            shutterButton.widthAnchor.constraint(equalToConstant: 68),
            shutterButton.heightAnchor.constraint(equalToConstant: 68),

            shutterRing.centerXAnchor.constraint(equalTo: shutterButton.centerXAnchor),
            shutterRing.centerYAnchor.constraint(equalTo: shutterButton.centerYAnchor),
            shutterRing.widthAnchor.constraint(equalToConstant: 80),
            shutterRing.heightAnchor.constraint(equalToConstant: 80),

            flipButton.centerYAnchor.constraint(equalTo: shutterButton.centerYAnchor),
            flipButton.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -28),
            flipButton.widthAnchor.constraint(equalToConstant: 56),
            flipButton.heightAnchor.constraint(equalToConstant: 56),
        ])
    }

    private func setupSession() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            break
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    if granted { self?.setupSession() }
                    else { self?.finish(.failed("Camera permission denied")) }
                }
            }
            return
        default:
            finish(.failed("Camera permission denied — enable in Settings"))
            return
        }

        session.beginConfiguration()
        session.sessionPreset = .photo

        guard configureInput(position: currentPosition) else {
            session.commitConfiguration()
            finish(.failed("Could not open camera"))
            return
        }

        if session.canAddOutput(photoOutput) {
            session.addOutput(photoOutput)
            photoOutput.isHighResolutionCaptureEnabled = false
        }
        session.commitConfiguration()

        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        layer.frame = view.bounds
        view.layer.insertSublayer(layer, at: 0)
        previewLayer = layer

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            self.session.startRunning()
            DispatchQueue.main.async {
                self.previewLayer?.frame = self.view.bounds
            }
        }
    }

    private func configureInput(position: AVCaptureDevice.Position) -> Bool {
        if let existing = currentInput {
            session.removeInput(existing)
            currentInput = nil
        }
        guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: position),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input) else {
            return false
        }
        session.addInput(input)
        currentInput = input
        currentPosition = position
        return true
    }

    @objc private func closeTapped() {
        finish(.cancelled)
    }

    @objc private func flipTapped() {
        let next: AVCaptureDevice.Position = currentPosition == .front ? .back : .front
        session.beginConfiguration()
        let ok = configureInput(position: next)
        session.commitConfiguration()
        if !ok {
            return
        }
    }

    @objc private func shutterTapped() {
        guard !isCapturing else { return }
        isCapturing = true
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()

        let settings = AVCapturePhotoSettings()
        if photoOutput.supportedFlashModes.contains(.auto) {
            settings.flashMode = .auto
        }
        photoOutput.capturePhoto(with: settings, delegate: self)
    }

    private func finish(_ outcome: StoryCameraOutcome) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.dismiss(animated: true) {
                self.onFinish(outcome)
            }
        }
    }
}

extension StoryCameraViewController: AVCapturePhotoCaptureDelegate {
    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        isCapturing = false
        if let error = error {
            finish(.failed(error.localizedDescription))
            return
        }
        guard let data = photo.fileDataRepresentation() else {
            finish(.failed("Could not read photo"))
            return
        }
        guard let dataUrl = StoryCameraImageEncoder.dataUrl(from: data, maxSide: 1280, quality: jpegQuality) else {
            finish(.failed("Could not prepare photo"))
            return
        }
        finish(.captured(dataUrl))
    }
}

// MARK: - Resize before crossing the WebView bridge (full-res JPEG crashes WKWebView decode)

private enum StoryCameraImageEncoder {
    static func dataUrl(from data: Data, maxSide: CGFloat, quality: CGFloat) -> String? {
        guard let image = UIImage(data: data) else { return nil }
        let resized = resize(image, maxSide: maxSide)
        guard let jpeg = resized.jpegData(compressionQuality: quality) else { return nil }
        return "data:image/jpeg;base64,\(jpeg.base64EncodedString())"
    }

    private static func resize(_ image: UIImage, maxSide: CGFloat) -> UIImage {
        let pxSize: CGSize
        if let cg = image.cgImage {
            pxSize = CGSize(width: CGFloat(cg.width), height: CGFloat(cg.height))
        } else {
            pxSize = image.size
        }
        let longEdge = max(pxSize.width, pxSize.height)
        guard longEdge > maxSide, longEdge > 0 else { return image }
        let scale = maxSide / longEdge
        let target = CGSize(width: floor(pxSize.width * scale), height: floor(pxSize.height * scale))
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: target, format: format)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
    }
}
