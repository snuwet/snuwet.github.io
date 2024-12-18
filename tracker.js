function prepareData(data) {
    const inputs = [];
    const outputs = []; 

    data.forEach(entry => {
        if (entry.faceLandmarks && entry.faceLandmarks.length > 0) {
            const landmarks = entry.faceLandmarks.flatMap(landmark => [landmark.x, landmark.y, landmark.z]);
            inputs.push(landmarks);
            outputs.push([entry.circlePosition.x, entry.circlePosition.y]);
        }
    });

    return { inputs, outputs };
}

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

async function initializeModel(data) {
    const { inputs, outputs } = prepareData(data);
    const model = await trainModel(inputs, outputs);

    window.gazeModel = model;
}

initializeModel();