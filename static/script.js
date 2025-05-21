class QRScanner {
    constructor() {
        // DOM Elements
        this.video = document.getElementById("qr-video");
        this.resultDiv = document.getElementById("qr-result");
        this.cameraSelect = document.getElementById("camera-select");
        this.statusDiv = document.getElementById("scanner-status");
        this.errorDiv = document.getElementById("camera-error");
        this.manualEntryDiv = document.getElementById("manual-entry");
        this.manualCodeInput = document.getElementById("manual-code");
        this.submitManualBtn = document.getElementById("submit-manual");
        this.toggleFlashBtn = document.getElementById("toggle-flash");
        this.toggleCameraBtn = document.getElementById("toggle-camera");
        this.zoomInBtn = document.getElementById("zoom-in");
        this.zoomOutBtn = document.getElementById("zoom-out");

        // Scanner State
        this.currentStream = null;
        this.scanningActive = false;
        this.scanAnimationFrame = null;
        this.currentZoom = 1;
        this.flashActive = false;
        this.currentFacingMode = 'environment';
        this.cameras = [];
        this.currentDeviceId = null;

        // Initialize2
        this.setupEventListeners();
        this.initScanner();
    }

    setupEventListeners() {
        // Camera controls
        this.cameraSelect.addEventListener("change", () => this.changeCamera());
        this.toggleCameraBtn.addEventListener("click", () => this.toggleCamera());
        this.toggleFlashBtn.addEventListener("click", () => this.toggleFlash());
        this.zoomInBtn.addEventListener("click", () => this.adjustZoom(0.1));
        this.zoomOutBtn.addEventListener("click", () => this.adjustZoom(-0.1));

        // Manual entry
        this.submitManualBtn.addEventListener("click", () => this.handleManualSubmit());
        this.manualCodeInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") this.handleManualSubmit();
        });

        // Cleanup
        window.addEventListener("beforeunload", () => this.stopScanner());
        window.addEventListener("pagehide", () => this.stopScanner());
    }

    async initScanner() {
        this.showStatus("Initializing scanner...");

        // Check browser support
        if (!this.hasScannerSupport()) {
            this.showError("Your browser doesn't support all required features.");
            this.showManualEntry();
            return;
        }

        try {
            // Load available cameras
            await this.loadCameras();

            if (this.cameras.length === 0) {
                this.showError("No cameras detected on this device.");
                this.showManualEntry();
                return;
            }

            // Try to start camera with different fallbacks
            await this.startWithFallbacks();

        } catch (error) {
            this.showError(`Scanner initialization failed: ${error.message}`);
            console.error("Scanner error:", error);
            this.showManualEntry();
        }
    }

    hasScannerSupport() {
        return navigator.mediaDevices &&
               navigator.mediaDevices.enumerateDevices &&
               typeof jsQR !== 'undefined';
    }

    async loadCameras() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.cameras = devices.filter(device => device.kind === "videoinput");

            // Update camera select dropdown
            if (this.cameras.length > 1) {
                this.cameraSelect.innerHTML = "";
                this.cameras.forEach((device, index) => {
                    const option = document.createElement("option");
                    option.value = device.deviceId;
                    option.text = device.label || `Camera ${index + 1}`;
                    this.cameraSelect.appendChild(option);
                });
                this.cameraSelect.classList.remove("d-none");
            }
        } catch (error) {
            console.error("Error enumerating devices:", error);
            this.cameras = [];
            throw new Error("Could not access camera devices");
        }
    }

    async startWithFallbacks() {
        // Try different camera modes with fallbacks
        try {
            // First try environment-facing (rear) camera
            await this.startCamera({ facingMode: 'environment' });
        } catch (envError) {
            console.log("Environment camera failed, trying user-facing:", envError);
            try {
                // Then try user-facing (front) camera
                await this.startCamera({ facingMode: 'user' });
            } catch (userError) {
                console.log("User camera failed, trying any camera:", userError);
                // Finally try any available camera
                await this.startCamera(true);
            }
        }
    }

    async startCamera(constraints) {
        this.stopScanner();
        this.showStatus("Starting camera...");

        try {
            // Build constraints object
            const streamConstraints = this.buildConstraints(constraints);

            // Get camera stream
            const stream = await navigator.mediaDevices.getUserMedia(streamConstraints);
            this.currentStream = stream;
            this.currentDeviceId = stream.getVideoTracks()[0].getSettings().deviceId;

            // Attach to video element
            this.video.srcObject = stream;
            this.video.setAttribute("playsinline", true);

            // Wait for video to be ready
            await new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.play()
                        .then(() => {
                            this.setupFlashCapability();
                            this.showStatus("Ready to scan", "success");
                            setTimeout(() => this.statusDiv.style.display = "none", 1000);
                            this.startScanning();
                            resolve();
                        })
                        .catch(err => {
                            console.error("Video play error:", err);
                            resolve(); // Continue even if play fails
                        });
                };
            });

        } catch (error) {
            let errorMessage = this.getCameraErrorMessage(error);
            throw new Error(errorMessage);
        }
    }

    buildConstraints(constraints) {
        if (constraints === true) {
            return { video: true }; // No constraints
        }

        const videoConstraints = {};

        if (constraints.facingMode) {
            videoConstraints.facingMode = constraints.facingMode;
            this.currentFacingMode = constraints.facingMode;
        } else if (constraints.deviceId) {
            videoConstraints.deviceId = constraints.deviceId;
        }

        // Add quality and zoom parameters
        videoConstraints.width = { ideal: 1280 };
        videoConstraints.height = { ideal: 720 };

        return { video: videoConstraints };
    }

    getCameraErrorMessage(error) {
        switch (error.name) {
            case 'NotAllowedError':
                return "Camera permission denied. Please allow camera access in your browser settings.";
            case 'NotFoundError':
                return "No camera found matching the requested constraints.";
            case 'NotReadableError':
                return "Camera is already in use by another application.";
            case 'OverconstrainedError':
                return "No camera available with the requested constraints.";
            default:
                return `Camera access error: ${error.message}`;
        }
    }

    setupFlashCapability() {
        const track = this.currentStream?.getVideoTracks()[0];
        if (!track || !track.getCapabilities) return;

        const capabilities = track.getCapabilities();
        this.toggleFlashBtn.disabled = !capabilities.torch;
    }

    async toggleFlash() {
        const track = this.currentStream?.getVideoTracks()[0];
        if (!track || !track.getCapabilities().torch) return;

        try {
            await track.applyConstraints({
                advanced: [{ torch: !this.flashActive }]
            });
            this.flashActive = !this.flashActive;
            this.toggleFlashBtn.classList.toggle("btn-warning", this.flashActive);
        } catch (err) {
            console.error("Error toggling flash:", err);
        }
    }

    async toggleCamera() {
        if (this.cameras.length < 2) return;

        const currentIndex = this.cameras.findIndex(cam => cam.deviceId === this.currentDeviceId);
        const nextIndex = (currentIndex + 1) % this.cameras.length;
        const nextCamera = this.cameras[nextIndex];

        this.currentFacingMode = nextCamera.label?.toLowerCase().includes('front') ? 'user' : 'environment';
        await this.startCamera({ deviceId: { exact: nextCamera.deviceId } });
    }

    async changeCamera() {
        const deviceId = this.cameraSelect.value;
        await this.startCamera({ deviceId: { exact: deviceId } });
    }

    adjustZoom(change) {
        const track = this.currentStream?.getVideoTracks()[0];
        if (!track || !track.getCapabilities().zoom) return;

        const newZoom = Math.max(1, Math.min(5, this.currentZoom + change));
        this.currentZoom = newZoom;

        track.applyConstraints({
            advanced: [{ zoom: newZoom }]
        }).catch(err => {
            console.error("Error adjusting zoom:", err);
        });
    }

    startScanning() {
        this.scanningActive = true;
        this.scan();
    }

    scan() {
        if (!this.scanningActive || !this.video.videoWidth || !this.video.videoHeight) {
            this.scanAnimationFrame = requestAnimationFrame(() => this.scan());
            return;
        }

        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        // Focus on the center scan region
        const scanSize = Math.min(this.video.videoWidth, this.video.videoHeight) * 0.7;
        canvas.width = scanSize;
        canvas.height = scanSize;

        try {
            const offsetX = (this.video.videoWidth - scanSize) / 2;
            const offsetY = (this.video.videoHeight - scanSize) / 2;

            context.drawImage(
                this.video,
                offsetX, offsetY, scanSize, scanSize,
                0, 0, canvas.width, canvas.height
            );

            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, canvas.width, canvas.height, {
                inversionAttempts: "dontInvert",
            });

            if (code) {
                this.handleScanResult(code.data);
            } else {
                this.scanAnimationFrame = requestAnimationFrame(() => this.scan());
            }
        } catch (error) {
            console.error("Scan error:", error);
            this.scanAnimationFrame = requestAnimationFrame(() => this.scan());
        }
    }

    handleScanResult(data) {
        this.stopScanning();

        this.resultDiv.innerHTML = `
            <div class="spinner-border spinner-border-sm" role="status"></div>
            Processing QR code...
        `;
        this.resultDiv.style.display = "block";

        this.sendToServer(data);
    }

    async sendToServer(data) {
        // Validate data
        if (!data || typeof data !== 'string' || data.trim() === '') {
            this.showResult("Invalid QR code data", "error");
            this.resumeScanning();
            return;
        }

        try {
            const response = await fetch('/scan_qr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ qr_data: data })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Server error");
            }

            const result = await response.json();
            if (result.success) {
                this.showResult(result.message, "success", result.user);
            } else {
                this.showResult(result.message, "error");
            }
        } catch (error) {
            this.showResult(error.message, "error");
        } finally {
            this.resumeScanning();
        }
    }

    showResult(message, type = "info", user = null) {
        const iconClass = type === "success" ? "bi-check-circle-fill" :
                         type === "error" ? "bi-exclamation-triangle-fill" : "bi-info-circle-fill";

        let userInfo = "";
        if (user) {
            userInfo = `
                <div class="mt-2">
                    <strong>User:</strong> ${user.username}<br>
                    <strong>ID:</strong> ${user.id}
                </div>
            `;
        }

        this.resultDiv.innerHTML = `
            <div>
                <i class="bi ${iconClass}"></i> ${message}
                ${userInfo}
            </div>
        `;
        this.resultDiv.className = `alert alert-${type}`;
        this.resultDiv.style.display = "block";
    }

    resumeScanning() {
        setTimeout(() => {
            this.resultDiv.style.display = "none";
            this.scanningActive = true;
            this.scan();
        }, 3000);
    }

    showStatus(message, type = "info") {
        const iconClass = type === "success" ? "bi-check-circle-fill" :
                         type === "error" ? "bi-exclamation-triangle-fill" : "bi-info-circle-fill";

        this.statusDiv.innerHTML = `
            <div>
                <i class="bi ${iconClass}"></i> ${message}
            </div>
        `;
        this.statusDiv.className = `alert alert-${type}`;
        this.statusDiv.style.display = "block";
    }

    showError(message) {
        this.errorDiv.innerHTML = `
            <div>
                <i class="bi bi-exclamation-triangle-fill"></i> ${message}
                <div class="mt-2">
                    <button onclick="window.location.reload()" class="btn btn-sm btn-warning me-2">
                        <i class="bi bi-arrow-clockwise"></i> Reload
                    </button>
                    <button onclick="qrScanner.initScanner()" class="btn btn-sm btn-primary">
                        <i class="bi bi-camera"></i> Retry
                    </button>
                </div>
            </div>
        `;
        this.errorDiv.className = "alert alert-danger";
        this.errorDiv.style.display = "block";
        this.showManualEntry();
    }

    showManualEntry() {
        this.manualEntryDiv.classList.remove("d-none");
    }

    handleManualSubmit() {
        const code = this.manualCodeInput.value.trim();
        if (code) {
            this.manualCodeInput.value = "";
            this.handleScanResult(code);
        }
    }

    stopScanning() {
        this.scanningActive = false;
        if (this.scanAnimationFrame) {
            cancelAnimationFrame(this.scanAnimationFrame);
            this.scanAnimationFrame = null;
        }
    }

    stopScanner() {
        this.stopScanning();

        if (this.currentStream) {
            this.currentStream.getTracks().forEach(track => track.stop());
            this.currentStream = null;
        }

        this.video.srcObject = null;
    }
}

// Initialize scanner when page loads
document.addEventListener("DOMContentLoaded", () => {
    window.qrScanner = new QRScanner();
});