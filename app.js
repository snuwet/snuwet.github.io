let webcamStream, screenStream, faceMesh, canvasStream, mediaRecorder, screenRecorder;
const canvasElement = document.getElementById('output');
const canvasCtx = canvasElement.getContext('2d');
const faceInfoElement = document.getElementById('faceInfo');

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const screenVideo = document.getElementById('screen');
const recordedChunks = [];
const screenChunks = [];
const faceMeshData = [];

let latestFaceLandmarks = null;

const calibrationBtn = document.getElementById('calibrationBtn');

const gazeData = []; // 추가된 코드

startBtn.addEventListener('click', async () => {
    await startRecording();
});


stopBtn.addEventListener('click', stopRecording);

async function startRecording() {
    try {
        const webcamConstraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            },
            audio: false
        };

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
            await faceMesh.send({image: webcamVideo});
            requestAnimationFrame(sendToFaceMesh);
        };
        sendToFaceMesh();

        canvasStream = canvasElement.captureStream(30);

        await startScreenRecording();

        // 화면 스트림의 비디오 요소를 가져옵니다
        const screenVideo = document.getElementById('screen');
        screenVideo.srcObject = screenStream;
        await screenVideo.play();

        // screenRecorder 초기화 및 시작
        screenRecorder = new MediaRecorder(screenStream, {
            mimeType: 'video/webm',
            videoBitsPerSecond: 2500000
        });

        screenRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                screenChunks.push(event.data);
            }
        };

        screenRecorder.start();

        // 오버레이 캔버스 생성 및 설정
        const overlayCanvas = document.createElement('canvas');
        overlayCanvas.width = window.innerWidth;
        overlayCanvas.height = window.innerHeight;
        overlayCanvas.style.position = 'fixed';
        overlayCanvas.style.top = '0';
        overlayCanvas.style.left = '0';
        overlayCanvas.style.pointerEvents = 'none';
        document.body.appendChild(overlayCanvas);
        const overlayCtx = overlayCanvas.getContext('2d');

        // 오버레이 그리기 시작
        drawOverlay(overlayCtx, overlayCanvas);

        mediaRecorder = new MediaRecorder(canvasStream, { mimeType: 'video/webm' });

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.start();

        mediaRecorder.onstop = saveWebcamVideo; // 웹캠 영상 저장 함수 호출
        screenRecorder.onstop = saveScreenVideo;

        startBtn.style.display = 'none';
        stopBtn.style.display = 'inline-block';
        calibrationBtn.style.display = 'inline-block';
        stopBtn.disabled = false;

    } catch (err) {
        console.error("녹화를 시작할 수 없습니다:", err);
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

        // 기존의 screenVideo 관련 코드는 삭제 또는 주석 처리
        // screenVideo.srcObject = screenStream;
    } catch (err) {
        console.error("Error: " + err);
    }
}

function stopRecording() {
    webcamStream.getTracks().forEach(track => track.stop());
    screenStream.getTracks().forEach(track => track.stop());
    mediaRecorder.stop();
    screenRecorder.stop();
    startBtn.style.display = 'inline-block';
    stopBtn.style.display = 'none';
    stopBtn.disabled = true;

    // 오버레이 캔버스 제거
    const overlayCanvas = document.querySelector('canvas[style*="position: fixed"]');
    if (overlayCanvas) {
        overlayCanvas.remove();
    }

    saveFaceMeshData();
    saveGazeData();
}

function saveFaceMeshData() {
    const blob = new Blob([JSON.stringify(faceMeshData)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'face_mesh_data.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 100);
}

function saveScreenVideo() {
    const blob = new Blob(screenChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'screen_recording.webm';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 100);
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

    if (window.gazeModel && latestFaceLandmarks) {
        const gazePoint = predictGaze(window.gazeModel, latestFaceLandmarks);
        if (gazePoint) {
            console.log('예측된 시선 위치:', gazePoint);
        }
    }
}

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
        {x: 0.01 * screenWidth, y: 0.01 * screenHeight},
        {x: 0.99 * screenWidth, y: 0.01 * screenHeight},
        {x: 0.99 * screenWidth, y: 0.99 * screenHeight},
        {x: 0.01 * screenWidth, y: 0.99 * screenHeight},
        {x: 0.5 * screenWidth, y: 0.01 * screenHeight},
        {x: 0.5 * screenWidth, y: 0.99 * screenHeight},
        {x: 0.01 * screenWidth, y: 0.5 * screenHeight},
        {x: 0.99 * screenWidth, y: 0.5 * screenHeight},
        {x: 0.5 * screenWidth, y: 0.5 * screenHeight},
        {x: 0.3 * screenWidth, y: 0.3 * screenHeight},
        {x: 0.7 * screenWidth, y: 0.3 * screenHeight},
        {x: 0.7 * screenWidth, y: 0.7 * screenHeight},
        {x: 0.3 * screenWidth, y: 0.7 * screenHeight}
    ];

    let currentIndex = 0;
    let x0 = screenWidth / 2;
    let y0 = screenHeight / 2;
    let radius = 30;
    let startTime = performance.now();

    calibCtx.clearRect(0, 0, screenWidth, screenHeight);
    calibCtx.fillStyle = 'black';
    calibCtx.fillRect(0, 0, screenWidth, screenHeight);
    calibCtx.fillStyle = 'white';
    calibCtx.font = 'bold 48px Arial';
    calibCtx.textAlign = 'center';
    calibCtx.fillText('빨간 공을 눈으로 따라가세요', screenWidth / 2, screenHeight / 2);

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

        if (t >= 0.75 && t <= 1) {
            const timestamp = performance.now() / 1000;
            const normalizedX = xMove / screenWidth;  // 추가된 코드
            const normalizedY = yMove / screenHeight; // 추가된 코드
            faceMeshData.push({
                timestamp: timestamp,
                circlePosition: { x: normalizedX, y: normalizedY }, // 수정된 코드
                faceLandmarks: latestFaceLandmarks
            });
        }


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

    // 모델 초기화 호출 시 `faceMeshData` 전달
    if (typeof initializeModel === 'function') {
        initializeModel(faceMeshData).then(() => {
            console.log('회귀 모델 훈련 완료');
        }).catch(err => {
            console.error('모델 초기화 중 오류 발생:', err);
        });
    } else {
        console.error('initializeModel 함수가 정의되지 않았습니다.');
    }
}

calibrationBtn.addEventListener('click', () => {
    // Removed redundant recorder starts to ensure continuous recording
    // mediaRecorder.start();
    // screenRecorder.start();
    startCalibration();
    calibrationBtn.style.display = 'none';
});

// 오버레이를 그리는 함수 수정
function drawOverlay(overlayCtx, overlayCanvas) {
    function drawFrame() {
        // 오버레이 캔버스 초기화
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

        if (window.gazeModel && latestFaceLandmarks) {
            const gazePoint = predictGaze(window.gazeModel, latestFaceLandmarks);
            if (gazePoint) {
                // 예측된 시선 위치에 반투명한 큰 원 그리기
                overlayCtx.beginPath();
                overlayCtx.arc(
                    gazePoint.x * overlayCanvas.width,
                    gazePoint.y * overlayCanvas.height,
                    50, // 원의 반지름
                    0, 2 * Math.PI
                );
                overlayCtx.fillStyle = 'rgba(0, 0, 255, 0.3)'; // 파란색 반투명
                overlayCtx.fill();

                // gazeData에 시선 좌표 저장
                const timestamp = performance.now() / 1000;
                gazeData.push({
                    timestamp: parseFloat(timestamp.toFixed(2)),
                    x: parseFloat(gazePoint.x.toFixed(2)),
                    y: parseFloat(gazePoint.y.toFixed(2))
                });
            }
        }

        requestAnimationFrame(drawFrame);
    }
    drawFrame();
}

// gaze 데이터 저장 함수 추가 (추가된 코드)
function saveGazeData() {
    const blob = new Blob([JSON.stringify(gazeData)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'gaze_data.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 100);
}

// 웹캠 영상 저장 함수 추가
function saveWebcamVideo() {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'webcam_recording.webm';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 100);
}