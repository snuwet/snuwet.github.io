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

let latestFaceLandmarks = null; // 최신 Face Mesh 데이터를 저장할 전역 변수

startBtn.addEventListener('click', async () => {
    await startRecording();
    // ... existing code to handle UI changes ...
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

        // 캔버스 스트림 생성
        canvasStream = canvasElement.captureStream(30); // 30 FPS

        // 화면 녹화 준비
        await startScreenRecording();

        // MediaRecorder 설정
        mediaRecorder = new MediaRecorder(canvasStream, { mimeType: 'video/webm' });
        screenRecorder = new MediaRecorder(screenStream, {
            mimeType: 'video/webm',
            videoBitsPerSecond: 2500000 // 2.5Mbps
        });

        // 데이터 수집 핸들러 설정
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        screenRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                screenChunks.push(event.data);
            }
        };

        // 녹화 종료 핸들러 설정
        mediaRecorder.onstop = saveVideo;
        screenRecorder.onstop = saveScreenVideo;

        // 녹화 시작
        mediaRecorder.start();
        screenRecorder.start();

        startBtn.style.display = 'none';
        stopBtn.style.display = 'inline-block';
        stopBtn.disabled = false;

        // Start the calibration sequence
        await startCalibration();
    } catch (err) {
        console.error("녹화를 시작할 수 없습니다:", err);
    }
}

async function startScreenRecording() {
    try {
        const displayMediaOptions = {
            video: {
                cursor: "always",
                displaySurface: "monitor" // This ensures the entire screen is captured
            },
            audio: false
        };
        screenStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
        screenVideo.srcObject = screenStream;
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

    // Face Mesh 데이터 저장
    saveFaceMeshData();
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

function saveVideo() {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'overlayed_video.webm';
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

// Modify onResults function to save latest face landmarks
function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height); // 원본 영상 그리기
    let faceInfo = '감지된 얼굴 없음';
    
    if (results.multiFaceLandmarks) {
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

        // 최신 Face Mesh 데이터 저장
        latestFaceLandmarks = results.multiFaceLandmarks[0].map(landmark => ({
            x: landmark.x,
            y: landmark.y,
            z: landmark.z
        }));
    } else {
        latestFaceLandmarks = null; // 얼굴이 감지되지 않은 경우
    }
    
    faceInfoElement.textContent = faceInfo;
    canvasCtx.restore();
}

// Add the calibration sequence function
async function startCalibration() {
    // Calibration 화면 요소 가져오기
    const calibrationScreen = document.getElementById('calibrationScreen');
    const calibrationCanvas = document.getElementById('calibrationCanvas');
    const calibCtx = calibrationCanvas.getContext('2d');
    calibrationScreen.style.display = 'block';

    // 화면 크기 가져오기
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;
    calibrationCanvas.width = screenWidth;
    calibrationCanvas.height = screenHeight;

    // 전체 화면 요청
    if (calibrationScreen.requestFullscreen) {
        await calibrationScreen.requestFullscreen();
    } else if (calibrationScreen.webkitRequestFullscreen) { /* Safari */
        await calibrationScreen.webkitRequestFullscreen();
    } else if (calibrationScreen.msRequestFullscreen) { /* IE11 */
        await calibrationScreen.msRequestFullscreen();
    }

    // 5초 카운트다운 표시
    await showPreCalibrationCountdown(calibCtx, screenWidth, screenHeight);

    // Calibration 애니메이션 시작
    startCalibrationAnimation(calibCtx, screenWidth, screenHeight);
}

function showPreCalibrationCountdown(calibCtx, screenWidth, screenHeight) {
    return new Promise((resolve) => {
        let countdown = 5;
        calibCtx.clearRect(0, 0, screenWidth, screenHeight);
        const countdownInterval = setInterval(() => {
            calibCtx.fillStyle = 'black';
            calibCtx.fillRect(0, 0, screenWidth, screenHeight);
            calibCtx.fillStyle = 'white';
            calibCtx.font = 'bold 36px Arial';
            calibCtx.textAlign = 'center';
            calibCtx.fillText('곧 시선 보정이 시작됩니다.', screenWidth / 2, screenHeight / 2 - 40);
            calibCtx.font = 'bold 48px Arial';
            calibCtx.fillText(`${countdown}`, screenWidth / 2, screenHeight / 2 + 20);
            countdown--;
            if (countdown < 0) {
                clearInterval(countdownInterval);
                resolve();
            }
        }, 1000);
    });
}

// 수정된 startCalibrationAnimation 함수
function startCalibrationAnimation(calibCtx, screenWidth, screenHeight) {
    const positions = [
        { x: 0.01 * screenWidth, y: 0.01 * screenHeight },
        { x: 0.99 * screenWidth, y: 0.01 * screenHeight },
        { x: 0.99 * screenWidth, y: 0.99 * screenHeight },
        { x: 0.01 * screenWidth, y: 0.99 * screenHeight },
        { x: 0.5 * screenWidth, y: 0.01 * screenHeight },
        { x: 0.5 * screenWidth, y: 0.99 * screenHeight },
        { x: 0.01 * screenWidth, y: 0.5 * screenHeight },
        { x: 0.99 * screenWidth, y: 0.5 * screenHeight },
        { x: 0.5 * screenWidth, y: 0.5 * screenHeight },
        { x: 0.3 * screenWidth, y: 0.3 * screenHeight },
        { x: 0.7 * screenWidth, y: 0.3 * screenHeight },
        { x: 0.7 * screenWidth, y: 0.7 * screenHeight },
        { x: 0.3 * screenWidth, y: 0.7 * screenHeight }
    ];

    let currentIndex = 0;
    let x0 = screenWidth / 2;
    let y0 = screenHeight / 2;
    const radius = 30;
    const startTime = performance.now();

    function animate() {
        let nowtime = (performance.now() - startTime) / 1000;

        // 배경색 변경
        const colorLevel = (Math.sin((nowtime) / 3) + 1) / 2;
        const bgColorValue = Math.floor(255 * colorLevel);
        calibCtx.fillStyle = `rgb(${bgColorValue}, ${bgColorValue}, ${bgColorValue})`;
        calibCtx.fillRect(0, 0, screenWidth, screenHeight);

        // 현재 스테이지 계산
        const stage = Math.floor(nowtime / 2);
        if (stage >= positions.length) {
            // 캘리브레이션 종료
            stopCalibration();
            return;
        }

        const pos = positions[stage];
        // 점의 부드러운 이동 계산
        const t = (nowtime % 2) / 2;
        const xMove = x0 + (pos.x - x0) * t;
        const yMove = y0 + (pos.y - y0) * t;

        // 빨간 원 그리기
        calibCtx.beginPath();
        calibCtx.arc(xMove, yMove, radius, 0, 2 * Math.PI);
        calibCtx.fillStyle = 'red';
        calibCtx.fill();

        // 단계 카운트다운 표시
        calibCtx.fillStyle = 'white';
        calibCtx.font = 'bold 24px Arial';
        calibCtx.textAlign = 'center';
        calibCtx.fillText(`${positions.length - stage}`, screenWidth / 2, 50);

        // Face Mesh 데이터 저장
        if (t >= 0.75 && t <= 1 && latestFaceLandmarks) {
            const timestamp = performance.now() / 1000;
            faceMeshData.push({
                timestamp: timestamp,
                circlePosition: { x: xMove, y: yMove },
                faceLandmarks: latestFaceLandmarks
            });
        }

        // 다음 프레임 요청
        requestAnimationFrame(animate);

        // 이전 위치 업데이트
        x0 = xMove;
        y0 = yMove;
    }

    // 애니메이션 시작
    animate();
}

function stopCalibration() {
    // 전체 화면 종료
    if (document.exitFullscreen) {
        document.exitFullscreen();
    } else if (document.webkitExitFullscreen) { /* Safari */
        document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) { /* IE11 */
        document.msExitFullscreen();
    }

    // Calibration 화면 숨기기
    const calibrationScreen = document.getElementById('calibrationScreen');
    calibrationScreen.style.display = 'none';
}

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

        // 캔버스 스트림 생성
        canvasStream = canvasElement.captureStream(30); // 30 FPS

        // 화면 녹화 준비
        await startScreenRecording();

        // MediaRecorder 설정
        mediaRecorder = new MediaRecorder(canvasStream, { mimeType: 'video/webm' });
        screenRecorder = new MediaRecorder(screenStream, {
            mimeType: 'video/webm',
            videoBitsPerSecond: 2500000 // 2.5Mbps
        });

        // 데이터 수집 핸들러 설정
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        screenRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                screenChunks.push(event.data);
            }
        };

        // 녹화 종료 핸들러 설정
        mediaRecorder.onstop = saveVideo;
        screenRecorder.onstop = saveScreenVideo;

        // 녹화 시작
        mediaRecorder.start();
        screenRecorder.start();

        startBtn.style.display = 'none';
        stopBtn.style.display = 'inline-block';
        stopBtn.disabled = false;

        // Start the calibration sequence
        await startCalibration();
    } catch (err) {
        console.error("녹화를 시작할 수 없습니다:", err);
    }
}

async function startScreenRecording() {
    try {
        const displayMediaOptions = {
            video: {
                cursor: "always",
                displaySurface: "monitor" // This ensures the entire screen is captured
            },
            audio: false
        };
        screenStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
        screenVideo.srcObject = screenStream;
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

    // Face Mesh 데이터 저장
    saveFaceMeshData();
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

function saveVideo() {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'overlayed_video.webm';
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

// Modify onResults function to save latest face landmarks
function onResults(results) {
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height); // 원본 영상 그리기
    let faceInfo = '감지된 얼굴 없음';
    
    if (results.multiFaceLandmarks) {
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

        // 최신 Face Mesh 데이터 저장
        latestFaceLandmarks = results.multiFaceLandmarks[0].map(landmark => ({
            x: landmark.x,
            y: landmark.y,
            z: landmark.z
        }));
    } else {
        latestFaceLandmarks = null; // 얼굴이 감지되지 않은 경우
    }
    
    faceInfoElement.textContent = faceInfo;
    canvasCtx.restore();
}

// Add the calibration sequence function
async function startCalibration() {
    // Show the calibration screen
    const calibrationScreen = document.getElementById('calibrationScreen');
    const calibrationCanvas = document.getElementById('calibrationCanvas');
    const calibCtx = calibrationCanvas.getContext('2d');
    calibrationScreen.style.display = 'block';

    // Request fullscreen for the calibration screen
    if (calibrationScreen.requestFullscreen) {
        await calibrationScreen.requestFullscreen();
    } else if (calibrationScreen.webkitRequestFullscreen) { /* Safari */
        await calibrationScreen.webkitRequestFullscreen();
    } else if (calibrationScreen.msRequestFullscreen) { /* IE11 */
        await calibrationScreen.msRequestFullscreen();
    }

    // Get screen dimensions
    const screenWidth = window.screen.width;
    const screenHeight = window.screen.height;
    calibrationCanvas.width = screenWidth;
    calibrationCanvas.height = screenHeight;

    // Start the calibration animation
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

    // '빨간 공을 따라주세요' 메시지 표시
    calibCtx.clearRect(0, 0, screenWidth, screenHeight);
    calibCtx.fillStyle = 'black';
    calibCtx.fillRect(0, 0, screenWidth, screenHeight);
    calibCtx.fillStyle = 'white';
    calibCtx.font = 'bold 48px Arial';
    calibCtx.textAlign = 'center';
    calibCtx.fillText('빨간 공을 따라주세요', screenWidth / 2, screenHeight / 2);

    setTimeout(() => {
        // 애니메이션 시작
        animate();
    }, 3000); // 3초 후에 시작

    function animate() {
        let nowtime = (performance.now() - startTime) / 1000;

        if (nowtime < 3) {
            // 초기 3초 대기
            requestAnimationFrame(animate);
            return;
        }

        // 배경색 변경
        let colorLevel = (Math.sin((nowtime - 3) / 3) + 1) / 2;
        let bgColorValue = Math.floor(255 * colorLevel);
        calibCtx.fillStyle = `rgb(${bgColorValue}, ${bgColorValue}, ${bgColorValue})`;
        calibCtx.fillRect(0, 0, screenWidth, screenHeight);

        // 현재 스테이지 계산
        let stage = Math.floor((nowtime - 3) / 2);
        if (stage >= positions.length) {
            // 캘리브레이션 종료
            stopCalibration();
            return;
        }

        let pos = positions[stage % positions.length];

        // 점의 부드러운 이동 계산
        let t = ((nowtime - 3) % 2) / 2;
        let xMove = x0 + (pos.x - x0) * t;
        let yMove = y0 + (pos.y - y0) * t;

        // 빨간 원 그리기
        calibCtx.beginPath();
        calibCtx.arc(xMove, yMove, radius, 0, 2 * Math.PI);
        calibCtx.fillStyle = 'red';
        calibCtx.fill();

        // 단계 카운트다운 표시
        calibCtx.fillStyle = 'white';
        calibCtx.font = 'bold 24px Arial';
        calibCtx.textAlign = 'center';
        calibCtx.fillText(`${positions.length - stage}`, screenWidth / 2, 50);

        // Face Mesh 데이터 저장
        if (t >= 0.75 && t <= 1) { // 점이 거의 정지 상태일 때 데이터 수집
            const timestamp = performance.now() / 1000;
            faceMeshData.push({
                timestamp: timestamp,
                circlePosition: { x: xMove, y: yMove },
                faceLandmarks: latestFaceLandmarks // 최신 Face Mesh 데이터 사용
            });
        }

        // 다음 프레임 요청
        requestAnimationFrame(animate);

        // 이전 위치 업데이트
        x0 = xMove;
        y0 = yMove;
    }
}

function stopCalibration() {
    // Exit full-screen mode
    if (document.exitFullscreen) {
        document.exitFullscreen();
    } else if (document.webkitExitFullscreen) { /* Safari */
        document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) { /* IE11 */
        document.msExitFullscreen();
    }

    // Hide the calibration screen
    const calibrationScreen = document.getElementById('calibrationScreen');
    calibrationScreen.style.display = 'none';
}