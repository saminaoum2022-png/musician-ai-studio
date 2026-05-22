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

            let present = {
                let camera = StoryCameraViewController(
                    lensPosition: position == "front" ? .front : .back,
                    jpegQuality: CGFloat(quality) / 100.0
                ) { outcome in
                    switch outcome {
                    case .capturedFile(let path):
                        call.resolve(["cancelled": false, "path": path])
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

            switch AVCaptureDevice.authorizationStatus(for: .video) {
            case .authorized:
                present()
            case .notDetermined:
                AVCaptureDevice.requestAccess(for: .video) { granted in
                    DispatchQueue.main.async {
                        if granted { present() }
                        else { call.reject("Camera permission denied") }
                    }
                }
            default:
                call.reject("Camera permission denied — enable in Settings")
            }
        }
    }
}

// MARK: - Outcomes

private enum StoryCameraOutcome {
    case capturedFile(String)
    case cancelled
    case failed(String)
}

// MARK: - Camera + native crop (single full-screen flow)

private final class StoryCameraViewController: UIViewController, UIScrollViewDelegate {
    private enum Mode { case camera, crop }

    private let lensPosition: AVCaptureDevice.Position
    private let jpegQuality: CGFloat
    private let onFinish: (StoryCameraOutcome) -> Void
    private let sessionQueue = DispatchQueue(label: "nabad.story.camera.session")

    private let session = AVCaptureSession()
    private let photoOutput = AVCapturePhotoOutput()
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var currentInput: AVCaptureDeviceInput?
    private var currentPosition: AVCaptureDevice.Position
    private var isCapturing = false
    private var isSessionBusy = false
    private var sessionConfigured = false
    private var mode: Mode = .camera
    private var capturedImage: UIImage?

    // Camera chrome
    private let closeButton = UIButton(type: .system)
    private let flipButton = UIButton(type: .system)
    private let shutterButton = UIButton(type: .custom)
    private let shutterRing = UIView()

    // Crop chrome
    private let cropOverlay = UIView()
    private let cropGuide = UIView()
    private let cropScroll = UIScrollView()
    private let cropImageView = UIImageView()
    private let cropBackButton = UIButton(type: .system)
    private let cropNextButton = UIButton(type: .system)
    private let cropHintLabel = UILabel()

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
        setupCameraChrome()
        setupCropChrome()
        setMode(.camera)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if mode == .camera, previewLayer == nil {
            startCameraSession()
        }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.bounds
        if let connection = previewLayer?.connection, connection.isVideoOrientationSupported {
            connection.videoOrientation = .portrait
        }
        layoutCropGuide()
        if mode == .crop, cropScroll.frame == .zero || cropScroll.bounds.size != cropGuide.bounds.size {
            layoutCropScroll()
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        if isBeingDismissed || isMovingFromParent {
            stopCameraSession()
        }
    }

    override var prefersStatusBarHidden: Bool { true }

    // MARK: Camera

    private func setupCameraChrome() {
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

    /// All AVCaptureSession work runs here so stopRunning never races beginConfiguration.
    private func runOnSessionQueue(_ work: @escaping () -> Void) {
        sessionQueue.async { [weak self] in
            guard let self = self else { return }
            work()
        }
    }

    private func haltSessionLocked() {
        if session.isRunning {
            session.stopRunning()
        }
    }

    private func startCameraSession() {
        runOnSessionQueue { [weak self] in
            guard let self = self else { return }
            guard !self.isSessionBusy else { return }
            self.isSessionBusy = true
            defer { self.isSessionBusy = false }

            self.haltSessionLocked()
            self.session.beginConfiguration()
            self.session.sessionPreset = .photo

            for input in self.session.inputs {
                self.session.removeInput(input)
            }
            self.currentInput = nil

            let ok = self.addCameraInputLocked(position: self.currentPosition)
            if ok, !self.session.outputs.contains(self.photoOutput), self.session.canAddOutput(self.photoOutput) {
                self.session.addOutput(self.photoOutput)
                self.photoOutput.isHighResolutionCaptureEnabled = false
                if let conn = self.photoOutput.connection(with: .video), conn.isVideoOrientationSupported {
                    conn.videoOrientation = .portrait
                }
            }
            if let previewConn = self.previewLayer?.connection, previewConn.isVideoOrientationSupported {
                previewConn.videoOrientation = .portrait
            }
            self.session.commitConfiguration()

            guard ok else {
                DispatchQueue.main.async { self.finish(.failed("Could not open camera")) }
                return
            }
            if !self.session.isRunning {
                self.session.startRunning()
            }
            self.sessionConfigured = true
            DispatchQueue.main.async { [weak self] in
                guard let self = self, self.mode == .camera else { return }
                guard self.previewLayer == nil else { return }
                let layer = AVCaptureVideoPreviewLayer(session: self.session)
                layer.videoGravity = .resizeAspectFill
                if let conn = layer.connection, conn.isVideoOrientationSupported {
                    conn.videoOrientation = .portrait
                }
                layer.frame = self.view.bounds
                self.view.layer.insertSublayer(layer, at: 0)
                self.previewLayer = layer
            }
        }
    }

    private func stopCameraSession(completion: (() -> Void)? = nil) {
        runOnSessionQueue { [weak self] in
            guard let self = self else { return }
            if self.isSessionBusy {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
                    self?.stopCameraSession(completion: completion)
                }
                return
            }
            self.isSessionBusy = true
            defer { self.isSessionBusy = false }
            self.haltSessionLocked()
            self.sessionConfigured = false
            if let completion = completion {
                DispatchQueue.main.async { completion() }
            }
        }
    }

    private func addCameraInputLocked(position: AVCaptureDevice.Position) -> Bool {
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
        guard mode == .camera else { return }
        let next: AVCaptureDevice.Position = currentPosition == .front ? .back : .front
        runOnSessionQueue { [weak self] in
            guard let self = self else { return }
            guard !self.isSessionBusy, self.sessionConfigured else { return }
            self.isSessionBusy = true
            defer { self.isSessionBusy = false }

            self.haltSessionLocked()
            self.session.beginConfiguration()
            for input in self.session.inputs {
                self.session.removeInput(input)
            }
            self.currentInput = nil
            let ok = self.addCameraInputLocked(position: next)
            self.session.commitConfiguration()
            if ok, self.mode == .camera, !self.session.isRunning {
                self.session.startRunning()
            }
        }
    }

    @objc private func shutterTapped() {
        guard mode == .camera, !isCapturing else { return }
        isCapturing = true
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        let settings = AVCapturePhotoSettings()
        if photoOutput.supportedFlashModes.contains(.auto) {
            settings.flashMode = .auto
        }
        photoOutput.capturePhoto(with: settings, delegate: self)
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
            self?.isCapturing = false
        }
    }

    // MARK: Crop UI

    private func setupCropChrome() {
        cropOverlay.translatesAutoresizingMaskIntoConstraints = false
        cropOverlay.backgroundColor = .black
        cropOverlay.isHidden = true
        view.addSubview(cropOverlay)

        cropGuide.translatesAutoresizingMaskIntoConstraints = false
        cropGuide.backgroundColor = .clear
        cropGuide.layer.borderColor = UIColor.white.withAlphaComponent(0.85).cgColor
        cropGuide.layer.borderWidth = 2
        cropGuide.clipsToBounds = true
        cropOverlay.addSubview(cropGuide)

        cropScroll.delegate = self
        cropScroll.showsHorizontalScrollIndicator = false
        cropScroll.showsVerticalScrollIndicator = false
        cropScroll.bounces = true
        cropScroll.bouncesZoom = true
        cropScroll.decelerationRate = .fast
        cropScroll.backgroundColor = .clear
        cropGuide.addSubview(cropScroll)

        cropImageView.contentMode = .scaleAspectFill
        cropImageView.isUserInteractionEnabled = true
        cropScroll.addSubview(cropImageView)

        cropHintLabel.translatesAutoresizingMaskIntoConstraints = false
        cropHintLabel.text = "Pinch to zoom · drag to reposition"
        cropHintLabel.textColor = UIColor.white.withAlphaComponent(0.75)
        cropHintLabel.font = .systemFont(ofSize: 13, weight: .medium)
        cropHintLabel.textAlignment = .center
        cropOverlay.addSubview(cropHintLabel)

        cropBackButton.translatesAutoresizingMaskIntoConstraints = false
        cropBackButton.setTitle("Back", for: .normal)
        cropBackButton.setTitleColor(.white, for: .normal)
        cropBackButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        cropBackButton.addTarget(self, action: #selector(cropBackTapped), for: .touchUpInside)
        cropOverlay.addSubview(cropBackButton)

        cropNextButton.translatesAutoresizingMaskIntoConstraints = false
        cropNextButton.setTitle("Next", for: .normal)
        cropNextButton.setTitleColor(UIColor(red: 0.55, green: 0.38, blue: 1, alpha: 1), for: .normal)
        cropNextButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .bold)
        cropNextButton.addTarget(self, action: #selector(cropNextTapped), for: .touchUpInside)
        cropOverlay.addSubview(cropNextButton)

        let safe = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            cropOverlay.topAnchor.constraint(equalTo: view.topAnchor),
            cropOverlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            cropOverlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            cropOverlay.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            cropBackButton.topAnchor.constraint(equalTo: safe.topAnchor, constant: 8),
            cropBackButton.leadingAnchor.constraint(equalTo: safe.leadingAnchor, constant: 16),

            cropNextButton.centerYAnchor.constraint(equalTo: cropBackButton.centerYAnchor),
            cropNextButton.trailingAnchor.constraint(equalTo: safe.trailingAnchor, constant: -16),

            cropHintLabel.bottomAnchor.constraint(equalTo: safe.bottomAnchor, constant: -18),
            cropHintLabel.centerXAnchor.constraint(equalTo: safe.centerXAnchor),
        ])
    }

    private func layoutCropGuide() {
        guard cropGuide.superview != nil else { return }
        let safe = view.safeAreaInsets
        let w = view.bounds.width
        let maxH = view.bounds.height - safe.top - safe.bottom - 120
        var guideW = w - 32
        var guideH = guideW * 16 / 9
        if guideH > maxH {
            guideH = maxH
            guideW = guideH * 9 / 16
        }
        let x = (w - guideW) / 2
        let y = safe.top + 52 + (maxH - guideH) / 2
        cropGuide.frame = CGRect(x: x, y: y, width: guideW, height: guideH)
    }

    private func layoutCropScroll() {
        guard let image = capturedImage else { return }
        let bounds = cropGuide.bounds
        guard bounds.width > 0, bounds.height > 0 else { return }

        cropScroll.frame = bounds
        cropScroll.contentInset = .zero

        let imageSize = StoryCameraImageEncoder.pixelSize(image)
        let widthScale = bounds.width / imageSize.width
        let heightScale = bounds.height / imageSize.height
        // Start with full photo visible (aspect fit); user can pinch to zoom in.
        let minScale = min(widthScale, heightScale)
        let maxScale = max(max(widthScale, heightScale) * 4, minScale * 2.5)

        cropImageView.image = image
        cropImageView.frame = CGRect(origin: .zero, size: imageSize)
        cropScroll.contentSize = imageSize
        cropScroll.minimumZoomScale = minScale
        cropScroll.maximumZoomScale = maxScale
        cropScroll.zoomScale = minScale

        let scaledW = imageSize.width * minScale
        let scaledH = imageSize.height * minScale
        let insetX = max(0, (bounds.width - scaledW) / 2)
        let insetY = max(0, (bounds.height - scaledH) / 2)
        cropScroll.contentInset = UIEdgeInsets(top: insetY, left: insetX, bottom: insetY, right: insetX)
        cropScroll.contentOffset = CGPoint(x: -insetX, y: -insetY)
    }

    func scrollViewDidZoom(_ scrollView: UIScrollView) {
        guard scrollView === cropScroll else { return }
        centerCropImageInScroll()
    }

    private func centerCropImageInScroll() {
        let bounds = cropScroll.bounds.size
        let content = cropScroll.contentSize
        let zoom = cropScroll.zoomScale
        let insetX = max(0, (bounds.width - content.width * zoom) / 2)
        let insetY = max(0, (bounds.height - content.height * zoom) / 2)
        cropScroll.contentInset = UIEdgeInsets(top: insetY, left: insetX, bottom: insetY, right: insetX)
    }

    func viewForZooming(in scrollView: UIScrollView) -> UIView? {
        cropImageView
    }

    private func setMode(_ newMode: Mode) {
        mode = newMode
        let isCamera = newMode == .camera
        closeButton.isHidden = !isCamera
        flipButton.isHidden = !isCamera
        shutterButton.isHidden = !isCamera
        shutterRing.isHidden = !isCamera
        cropOverlay.isHidden = isCamera
    }

    private func showCrop(with image: UIImage) {
        capturedImage = StoryCameraImageEncoder.downscale(image, maxSide: 2048)
        stopCameraSession { [weak self] in
            guard let self = self else { return }
            DispatchQueue.main.async {
                self.previewLayer?.removeFromSuperlayer()
                self.previewLayer = nil
                self.setMode(.crop)
                self.view.setNeedsLayout()
                self.view.layoutIfNeeded()
                self.layoutCropScroll()
            }
        }
    }

    @objc private func cropBackTapped() {
        capturedImage = nil
        cropScroll.zoomScale = cropScroll.minimumZoomScale
        previewLayer?.removeFromSuperlayer()
        previewLayer = nil
        setMode(.camera)
        startCameraSession()
    }

    @objc private func cropNextTapped() {
        guard let image = capturedImage else {
            finish(.failed("No photo to crop"))
            return
        }
        guard let path = StoryCameraImageEncoder.exportCrop(
            image: image,
            scrollView: cropScroll,
            imageView: cropImageView,
            quality: jpegQuality
        ) else {
            finish(.failed("Could not export crop"))
            return
        }
        finish(.capturedFile(path))
    }

    private func finish(_ outcome: StoryCameraOutcome) {
        stopCameraSession { [weak self] in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.dismiss(animated: true) {
                    self.onFinish(outcome)
                }
            }
        }
    }
}

// MARK: - Photo capture

extension StoryCameraViewController: AVCapturePhotoCaptureDelegate {
    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            self.isCapturing = false
            if let error = error {
                self.finish(.failed(error.localizedDescription))
                return
            }
            guard let data = photo.fileDataRepresentation(),
                  let image = UIImage(data: data) else {
                self.finish(.failed("Could not read photo"))
                return
            }
            self.showCrop(with: StoryCameraImageEncoder.normalizeOrientation(image))
        }
    }
}

// MARK: - Image helpers

private enum StoryCameraImageEncoder {
    static func pixelSize(_ image: UIImage) -> CGSize {
        if let cg = image.cgImage {
            return CGSize(width: CGFloat(cg.width), height: CGFloat(cg.height))
        }
        return image.size
    }

    static func downscale(_ image: UIImage, maxSide: CGFloat) -> UIImage {
        let size = pixelSize(image)
        let longEdge = max(size.width, size.height)
        guard longEdge > maxSide, longEdge > 0 else { return image }
        let scale = maxSide / longEdge
        let target = CGSize(width: floor(size.width * scale), height: floor(size.height * scale))
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        return UIGraphicsImageRenderer(size: target, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
    }

    static func normalizeOrientation(_ image: UIImage) -> UIImage {
        guard image.imageOrientation != .up else { return image }
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        var output = CGSize(width: image.size.width, height: image.size.height)
        switch image.imageOrientation {
        case .left, .right, .leftMirrored, .rightMirrored:
            output = CGSize(width: image.size.height, height: image.size.width)
        default:
            break
        }
        return UIGraphicsImageRenderer(size: output, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: output))
        }
    }

    static func exportCrop(image: UIImage, scrollView: UIScrollView, imageView: UIImageView, quality: CGFloat) -> String? {
        _ = imageView
        let zoom = max(scrollView.zoomScale, 0.0001)
        let imageSize = pixelSize(image)
        guard imageSize.width > 1, imageSize.height > 1 else { return nil }

        var cropRect = CGRect(
            x: scrollView.contentOffset.x / zoom,
            y: scrollView.contentOffset.y / zoom,
            width: scrollView.bounds.width / zoom,
            height: scrollView.bounds.height / zoom
        ).integral
        cropRect = cropRect.intersection(CGRect(origin: .zero, size: imageSize))
        guard cropRect.width > 1, cropRect.height > 1,
              let cg = image.cgImage?.cropping(to: cropRect) else { return nil }

        let cropped = UIImage(cgImage: cg, scale: 1, orientation: .up)
        let target = CGSize(width: 1080, height: 1920)
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let renderer = UIGraphicsImageRenderer(size: target, format: format)
        let final = renderer.image { _ in
            let ar = cropped.size.width / cropped.size.height
            let tar = target.width / target.height
            var draw = CGRect(origin: .zero, size: target)
            if abs(ar - tar) > 0.01 {
                if ar > tar {
                    let h = target.height
                    let w = h * ar
                    draw = CGRect(x: (target.width - w) / 2, y: 0, width: w, height: h)
                } else {
                    let w = target.width
                    let h = w / ar
                    draw = CGRect(x: 0, y: (target.height - h) / 2, width: w, height: h)
                }
            }
            cropped.draw(in: draw)
        }
        guard let jpeg = final.jpegData(compressionQuality: quality) else { return nil }

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("nabad_story_crop_\(UUID().uuidString).jpg")
        do {
            try jpeg.write(to: url, options: .atomic)
            return url.path
        } catch {
            return nil
        }
    }
}
