// tracker.js

// TensorFlow.js 라이브러리 로드 필요
// <script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest"></script>

// 데이터 전처리
function prepareData(data) {
    const inputs = [];  // Face mesh 랜드마크 좌표
    const outputs = []; // 화면상의 빨간 점 좌표

    data.forEach(entry => {
        if (entry.faceLandmarks && entry.faceLandmarks.length > 0) {
            // 랜드마크 좌표를 일차원 배열로 변환
            const landmarks = entry.faceLandmarks.flatMap(landmark => [landmark.x, landmark.y, landmark.z]);
            inputs.push(landmarks);
            outputs.push([entry.circlePosition.x, entry.circlePosition.y]);
        }
    });

    return { inputs, outputs };
}

// 모델 훈련
async function trainModel(inputs, outputs) {
    const tfInputs = tf.tensor2d(inputs);
    const tfOutputs = tf.tensor2d(outputs);

    const model = tf.sequential();
    model.add(tf.layers.dense({
        units: 2,
        inputShape: [inputs[0].length]
    }));

    model.compile({
        optimizer: tf.train.adam(),
        loss: 'meanSquaredError'
    });

    await model.fit(tfInputs, tfOutputs, {
        epochs: 100,
        batchSize: 32,
        shuffle: true
    });

    return model;
}

// 시선 예측
function predictGaze(model, faceLandmarks) {
    if (faceLandmarks && faceLandmarks.length > 0) {
        const landmarks = faceLandmarks.flatMap(landmark => [landmark.x, landmark.y, landmark.z]);
        const input = tf.tensor2d([landmarks]);
        const prediction = model.predict(input);
        const [x, y] = prediction.arraySync()[0];
        input.dispose();
        prediction.dispose();
        return { x, y };
    } else {
        return null;
    }
}

// 모델 초기화 함수 수정
async function initializeModel(data) {
    const { inputs, outputs } = prepareData(data);
    const model = await trainModel(inputs, outputs);

    // 모델을 전역 변수로 설정
    window.gazeModel = model;
}

// 기존 파일 전체 실행 부분 주석 처리
/*
(async () => {
    const data = await loadData();
    const { inputs, outputs } = prepareData(data);
    const model = await trainModel(inputs, outputs);

    window.gazeModel = model;
})();
*/

// 새로운 초기화 함수 호출은 필요에 따라 외부에서 수행

// 모델 초기화
initializeModel();