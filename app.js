let webcamStream, screenStream, micStream, faceMesh;
let mediaRecorder, screenRecorder;
let webcamChunks = [];
let screenChunks = [];
let recordingTimestamp;
let recordingStartMs = null;
let overlayCanvas = null;
let overlayCtx = null;
let overlayAnimationFrameId = null;
let overlayResizeHandler = null;
let guideOverlay = null;
let guideModal = null;
let guideFooter = null;

const canvasElement = document.getElementById('output');
const canvasCtx = canvasElement.getContext('2d');
const faceInfoElement = document.getElementById('faceInfo');

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const screenVideo = document.getElementById('screen');
const calibrationBtn = document.getElementById('calibrationBtn');
guideOverlay = document.getElementById('guideOverlay');
guideModal = document.getElementById('guideModal');
guideFooter = document.getElementById('guideFooter');

let latestFaceLandmarks = null;

function pickSupportedMimeType(candidates){
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
    for (const type of candidates){
        try{
            if (MediaRecorder.isTypeSupported(type)) return type;
        } catch(e){}
    }
    return '';
}

startBtn.addEventListener('click', async () => {
    await startRecording();
});

stopBtn.addEventListener('click', stopRecording);

async function startRecording() {
    try {
        recordingStartMs = Date.now();
        recordingTimestamp = new Date().toLocaleString('ko-KR', {
            year: '2-digit',
            month: '2-digit',
            day: '2-digit',
            hour: 'numeric',
            minute: '2-digit',
            hour12: false
        }).replace(/[. :]/g, '').replace(/(\d{6})(\d{4})/, '$1-$2');

        showGuideOverlay();
        setTimeout(() => { hideGuideModal(); }, 1200);

        const webcamConstraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            },
            audio: false
        };

        showGuideFooter("카메라권한 안내창에서 '항상 허용'을 클릭하세요.");
        webcamStream = await navigator.mediaDevices.getUserMedia(webcamConstraints);
        const webcamVideo = document.createElement('video');
        webcamVideo.srcObject = webcamStream;
        webcamVideo.play();

        webcamVideo.onloadedmetadata = () => {
            canvasElement.width = webcamVideo.videoWidth;
            canvasElement.height = webcamVideo.videoHeight;
        };

        await setupFaceMesh();

        const sendToFaceMesh = async () => {
            await faceMesh.send({ image: webcamVideo });
            requestAnimationFrame(sendToFaceMesh);
        };
        sendToFaceMesh();

        showGuideFooter("마이크권한 안내창에서 '항상 허용'을 클릭하세요.<br/>마이크 목록에 여러개가 뜨는 경우, 소리내어 말해서 테스트해보고 작동하는 마이크로 선택하세요.");
        await getMicrophoneStream();
        showGuideFooter("'전체 화면'을 선택하고 '공유'를 클릭하세요.");
        await startScreenRecording();
        try {
            if (micStream) {
                const micTrack = micStream.getAudioTracks()[0];
                if (micTrack) screenStream.addTrack(micTrack);
            }
        } catch (e) {}
        screenVideo.srcObject = screenStream;
        await screenVideo.play();

        // 화면 녹화
        const screenRecorderOptions = { videoBitsPerSecond: 700000 };
        const screenMimeType = pickSupportedMimeType([
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm'
        ]);
        if (screenMimeType) screenRecorderOptions.mimeType = screenMimeType;
        screenRecorder = new MediaRecorder(screenStream, screenRecorderOptions);
        screenRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                screenChunks.push(event.data);
            }
        };
        screenRecorder.start();
        screenRecorder.onstop = saveScreenVideo;

        // 화상 녹화 (마이크 오디오를 비디오 트랙에 합쳐 저장)
        const webcamMixedStream = new MediaStream(webcamStream.getVideoTracks());
        if (micStream){
            const micTrack = micStream.getAudioTracks()[0];
            if (micTrack) webcamMixedStream.addTrack(micTrack);
        }
        const webcamRecorderOptions = { videoBitsPerSecond: 1500000 };
        const webcamMimeType = pickSupportedMimeType([
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm'
        ]);
        if (webcamMimeType) webcamRecorderOptions.mimeType = webcamMimeType;
        mediaRecorder = new MediaRecorder(webcamMixedStream, webcamRecorderOptions);
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                webcamChunks.push(event.data);
            }
        };
        mediaRecorder.start();
        mediaRecorder.onstop = saveWebcamVideo;

        overlayCanvas = document.createElement('canvas');
        overlayCanvas.width = window.innerWidth;
        overlayCanvas.height = window.innerHeight;
        overlayCanvas.style.position = 'fixed';
        overlayCanvas.style.top = '0';
        overlayCanvas.style.left = '0';
        overlayCanvas.style.pointerEvents = 'none';
        document.body.appendChild(overlayCanvas);
        overlayCtx = overlayCanvas.getContext('2d');
        overlayResizeHandler = () => {
            if (!overlayCanvas) return;
            overlayCanvas.width = window.innerWidth;
            overlayCanvas.height = window.innerHeight;
        };
        window.addEventListener('resize', overlayResizeHandler);
        drawOverlay();

        // After all permissions granted: show tip without dim background
        showGuideOverlayTransparent();
        showGuideFooter("얼굴과 화면이 제대로 보인다면 위쪽의 캘리브레이션 시작 버튼을 클릭하세요.<br/>캘리브레이션이 시작되면, 빨간색 공이 나타나 움직이기 시작합니다.<br/>빨간 공의 움직임을 집중해서 눈으로 잘 따라가세요!");
        calibrationBtn.classList.add('pulse-outline');
        startBtn.style.display = 'none';
        calibrationBtn.style.display = 'inline-block';
        stopBtn.style.display = calibrationBtn.style.display === 'none' ? 'inline-block' : 'none';
        stopBtn.disabled = false;

    } catch (err) {
        console.error("녹화를 시작할 수 없습니다:", err);
        showGuideOverlay();
        showGuideFooter("시작에 실패했습니다. 창을 닫고 재접속 후 다시 시도하세요.");
    }
}

async function startScreenRecording() {
    try {
        const displayMediaOptions = {
            video: {
                cursor: "always",
                displaySurface: "monitor"
            },
            audio: false
        };
        screenStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
    } catch (err) {
        console.error("Error: " + err);
        throw err;
    }
}

async function getMicrophoneStream() {
    try {
        micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
    } catch (err) {
        console.warn("마이크를 사용할 수 없습니다:", err);
        micStream = null;
    }
}

function stopRecording() {
    // 모든 트랙 정지
    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
    }
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
    }
    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
    }

    // 녹화 중지 -> onstop 이벤트에서 파일 다운로드 실행
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
    if (screenRecorder && screenRecorder.state !== "inactive") {
        screenRecorder.stop();
    }

    startBtn.style.display = 'inline-block';
    stopBtn.style.display = 'none';
    stopBtn.disabled = true;

    if (overlayAnimationFrameId) cancelAnimationFrame(overlayAnimationFrameId);
    if (overlayResizeHandler) window.removeEventListener('resize', overlayResizeHandler);
    overlayAnimationFrameId = null;
    overlayResizeHandler = null;
    recordingStartMs = null;
    if (overlayCanvas) { overlayCanvas.remove(); overlayCanvas = null; overlayCtx = null; }
    hideGuideOverlay();
}

function saveScreenVideo() {
    const timestamp = recordingTimestamp;

    const blob = new Blob(screenChunks, { type: 'video/webm' });
    screenChunks = [];

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `screen_record_${timestamp}.dat`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
}

function saveWebcamVideo() {
    const timestamp = recordingTimestamp;

    const blob = new Blob(webcamChunks, { type: 'video/webm' });
    webcamChunks = [];

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `webcam_record_${timestamp}.dat`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
}

async function setupFaceMesh() {
    faceMesh = new FaceMesh({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });

    faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    faceMesh.onResults(onResults);
}

function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    // 캔버스에만 face landmark를 표시하고, 실제 녹화된 영상에는 표시되지 않도록 함
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    let faceInfo = '감지된 얼굴 없음';

    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        faceInfo = '얼굴 감지됨';
        for (const landmarks of results.multiFaceLandmarks) {
            drawConnectors(canvasCtx, landmarks, FACEMESH_RIGHT_EYE, { color: '#FF3030' });
            drawConnectors(canvasCtx, landmarks, FACEMESH_RIGHT_EYEBROW, { color: '#FF3030' });
            drawConnectors(canvasCtx, landmarks, FACEMESH_LEFT_EYE, { color: '#30FF30' });
            drawConnectors(canvasCtx, landmarks, FACEMESH_LEFT_EYEBROW, { color: '#30FF30' });
            drawConnectors(canvasCtx, landmarks, FACEMESH_FACE_OVAL, { color: '#E0E0E0' });
            drawConnectors(canvasCtx, landmarks, FACEMESH_LIPS, { color: '#E0E0E0' });
            drawConnectors(canvasCtx, landmarks, FACEMESH_RIGHT_IRIS, { color: '#FF0000' });
            drawConnectors(canvasCtx, landmarks, FACEMESH_LEFT_IRIS, { color: '#00FF00' });
        }

        latestFaceLandmarks = results.multiFaceLandmarks[0].map(landmark => ({
            x: landmark.x,
            y: landmark.y,
            z: landmark.z
        }));
    } else {
        latestFaceLandmarks = [];
    }

    faceInfoElement.textContent = faceInfo;
    canvasCtx.restore();
}

// 캘리브레이션 화면은 유지하되, 회귀 분석(모델 훈련) 등은 제거
async function startCalibration() {
    const calibrationScreen = document.getElementById('calibrationScreen');
    const calibrationCanvas = document.getElementById('calibrationCanvas');
    const calibCtx = calibrationCanvas.getContext('2d');
    calibrationScreen.style.display = 'block';

    if (calibrationScreen.requestFullscreen) {
        await calibrationScreen.requestFullscreen();
    } else if (calibrationScreen.webkitRequestFullscreen) {
        await calibrationScreen.webkitRequestFullscreen();
    } else if (calibrationScreen.msRequestFullscreen) {
        await calibrationScreen.msRequestFullscreen();
    }

    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;
    calibrationCanvas.width = screenWidth;
    calibrationCanvas.height = screenHeight;

    startCalibrationAnimation(calibCtx, screenWidth, screenHeight);
}

function startCalibrationAnimation(calibCtx, screenWidth, screenHeight) {
    const positions = [
        {x: 0.01 * screenWidth, y: 0.01 * screenHeight},  // 좌상단
        {x: 0.5 * screenWidth, y: 0.01 * screenHeight},   // 상단 중앙
        {x: 0.99 * screenWidth, y: 0.01 * screenHeight},  // 우상단
        {x: 0.99 * screenWidth, y: 0.5 * screenHeight},   // 우측 중앙
        {x: 0.99 * screenWidth, y: 0.99 * screenHeight},  // 우하단
        {x: 0.5 * screenWidth, y: 0.99 * screenHeight},   // 하단 중앙
        {x: 0.01 * screenWidth, y: 0.99 * screenHeight},  // 좌하단
        {x: 0.01 * screenWidth, y: 0.5 * screenHeight},   // 좌측 중앙
        {x: 0.01 * screenWidth, y: 0.01 * screenHeight},  // 좌상단
        {x: 0.5 * screenWidth, y: 0.01 * screenHeight},   // 상단 중앙
        {x: 0.99 * screenWidth, y: 0.01 * screenHeight},  // 우상단
        {x: 0.5 * screenWidth, y: 0.01 * screenHeight},   // 상단 중앙
        {x: 0.01 * screenWidth, y: 0.01 * screenHeight},  // 좌상단
        {x: 0.01 * screenWidth, y: 0.5 * screenHeight},   // 좌측 중앙
        {x: 0.01 * screenWidth, y: 0.99 * screenHeight},  // 좌하단
        {x: 0.5 * screenWidth, y: 0.99 * screenHeight},   // 하단 중앙
        {x: 0.99 * screenWidth, y: 0.99 * screenHeight},  // 우하단
        {x: 0.99 * screenWidth, y: 0.5 * screenHeight},   // 우측 중앙
        {x: 0.99 * screenWidth, y: 0.01 * screenHeight},  // 우상단
        {x: 0.5 * screenWidth, y: 0.01 * screenHeight},   // 상단 중앙
    ];

    let x0 = screenWidth / 2;
    let y0 = screenHeight / 2;
    let radius = 30;
    let startTime = performance.now();

    calibCtx.clearRect(0, 0, screenWidth, screenHeight);
    calibCtx.fillStyle = 'black';
    calibCtx.fillRect(0, 0, screenWidth, screenHeight);
    
    // 시작 화면에 빨간 공 추가
    calibCtx.beginPath();
    calibCtx.arc(x0, y0, radius, 0, 2 * Math.PI);
    calibCtx.fillStyle = 'red';
    calibCtx.fill();
    
    calibCtx.fillStyle = 'white';
    calibCtx.font = 'bold 48px Arial';
    calibCtx.textAlign = 'center';
    calibCtx.fillText('빨간 공을 눈으로 따라가세요', screenWidth / 2, screenHeight / 2 - 60);

    setTimeout(() => {
        animate();
    }, 3000);

    function animate() {
        let nowtime = (performance.now() - startTime) / 1000;

        if (nowtime < 3) {
            requestAnimationFrame(animate);
            return;
        }

        let colorLevel = (Math.sin((nowtime - 3) / 3) + 1) / 2;
        let bgColorValue = Math.floor(255 * colorLevel);
        calibCtx.fillStyle = `rgb(${bgColorValue}, ${bgColorValue}, ${bgColorValue})`;
        calibCtx.fillRect(0, 0, screenWidth, screenHeight);

        let stage = Math.floor((nowtime - 3) / 2);
        if (stage >= positions.length) {
            stopCalibration();
            return;
        }

        let pos = positions[stage % positions.length];
        let t = ((nowtime - 3) % 2) / 2;
        let xMove = x0 + (pos.x - x0) * t;
        let yMove = y0 + (pos.y - y0) * t;

        calibCtx.beginPath();
        calibCtx.arc(xMove, yMove, radius, 0, 2 * Math.PI);
        calibCtx.fillStyle = 'red';
        calibCtx.fill();

        calibCtx.fillStyle = 'white';
        calibCtx.font = 'bold 24px Arial';
        calibCtx.textAlign = 'center';
        calibCtx.fillText(`${positions.length - stage}`, screenWidth / 2, 50);

        requestAnimationFrame(animate);
        x0 = xMove;
        y0 = yMove;
    }
}

function stopCalibration() {
    if (document.exitFullscreen) {
        document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
    }

    const calibrationScreen = document.getElementById('calibrationScreen');
    calibrationScreen.style.display = 'none';

    alert('캘리브레이션이 끝났습니다. 이제 다른 창으로 이동하여 원하는 활동을 진행하세요.');

    // Show follow-up guidance in footer
    showGuideOverlayTransparent();
    showGuideFooter('모든 활동이 끝난 뒤, 녹화를 종료하려면 위의 완료 버튼을 누르세요.');
}

calibrationBtn.addEventListener('click', () => {
    startCalibration();
    calibrationBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';
    calibrationBtn.classList.remove('pulse-outline');
    hideGuideFooter();
});

function drawOverlay() {
    if (!overlayCtx || !overlayCanvas) return;
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    const padding = 12;
    const now = Date.now();
    const elapsedMs = recordingStartMs ? now - recordingStartMs : 0;
    const mm = String(Math.floor(elapsedMs / 60000)).padStart(2, '0');
    const ss = String(Math.floor((elapsedMs % 60000) / 1000)).padStart(2, '0');

    overlayCtx.font = '14px Arial';
    overlayCtx.fillStyle = 'rgba(0,0,0,0.35)';
    overlayCtx.fillRect(0, 0, 210, 40);

    overlayCtx.beginPath();
    overlayCtx.arc(padding + 8, padding + 8, 6, 0, Math.PI * 2);
    overlayCtx.fillStyle = 'red';
    overlayCtx.fill();

    overlayCtx.fillStyle = 'white';
    overlayCtx.fillText('REC', padding + 20, padding + 12);
    overlayCtx.fillText(`${mm}:${ss}`, padding + 60, padding + 12);

    const faceDetected = Array.isArray(latestFaceLandmarks) && latestFaceLandmarks.length > 0;
    overlayCtx.fillText(`Face: ${faceDetected ? 'detected' : 'none'}`, padding + 120, padding + 12);

    if (window.gazeModel && faceDetected) {
        try {
            const pred = predictGaze(window.gazeModel, latestFaceLandmarks);
            if (pred && Number.isFinite(pred.x) && Number.isFinite(pred.y)) {
                const sx = window.screen.width || overlayCanvas.width;
                const sy = window.screen.height || overlayCanvas.height;
                const x = (pred.x / sx) * overlayCanvas.width;
                const y = (pred.y / sy) * overlayCanvas.height;
                overlayCtx.beginPath();
                overlayCtx.arc(x, y, 6, 0, Math.PI * 2);
                overlayCtx.fillStyle = 'rgba(0, 200, 255, 0.8)';
                overlayCtx.fill();
            }
        } catch (e) {}
    }

    overlayAnimationFrameId = requestAnimationFrame(drawOverlay);
}

function showGuideOverlay(){
    if (guideOverlay){
        guideOverlay.style.background = 'rgba(0,0,0,0.5)';
        guideOverlay.style.display = 'flex';
    }
}
function showGuideOverlayTransparent(){
    if (guideOverlay){
        guideOverlay.style.background = 'transparent';
        guideOverlay.style.display = 'flex';
    }
}
function hideGuideOverlay(){
    if (guideOverlay) guideOverlay.style.display = 'none';
    hideGuideModal();
    // Do not force-hide footer here; footer may be used without dim background
}
function showGuideModal(text){
    if (guideOverlay) guideOverlay.style.display = 'flex';
    if (guideModal){
        guideModal.textContent = text || '';
        guideModal.style.display = 'block';
    }
}
function hideGuideModal(){
    if (guideModal) guideModal.style.display = 'none';
}
function showGuideFooter(text){
    if (guideOverlay) guideOverlay.style.display = 'flex';
    if (guideFooter){
        guideFooter.innerHTML = text || '';
        guideFooter.style.display = 'block';
    }
}
function hideGuideFooter(){
    if (guideFooter) guideFooter.style.display = 'none';
}