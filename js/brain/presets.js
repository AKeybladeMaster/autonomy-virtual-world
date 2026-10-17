/* Hand-set starting weights and schema validation; not a trained model. */
function createDemoBrain() {
	// Hand-set starting weights, not a trained general-purpose driver. All control
	// runs through the tutorial's 5–6–4 network, sensor readings and vehicle physics.
	const brain = new NeuralNetwork([5, 6, 4]);
	for (const level of brain.levels) {
		level.weights.forEach((row) => row.fill(0));
		level.biases.fill(1);
		level.inputs.fill(0);
		level.outputs.fill(0);
	}
	const [sense, drive] = brain.levels;
	// Side rays detect edge proximity; counter-steer away from the nearer border.
	sense.weights[0][0] = 8;
	sense.weights[4][1] = 8;
	sense.biases[0] = 4;
	sense.biases[1] = 4;
	drive.weights[1][1] = 8;
	drive.weights[0][2] = 8;
	drive.biases[0] = -4;
	drive.biases[1] = 4;
	drive.biases[2] = 4;
	drive.biases[3] = 4;
	return brain;
}

function validateBrain(brain) {
	const dims = [
		[5, 6],
		[6, 4],
	];
	return (
		brain &&
		Array.isArray(brain.levels) &&
		brain.levels.length === 2 &&
		brain.levels.every(
			(l, itemIndex) =>
				Array.isArray(l.inputs) &&
				l.inputs.length === dims[itemIndex][0] &&
				Array.isArray(l.outputs) &&
				l.outputs.length === dims[itemIndex][1] &&
				Array.isArray(l.biases) &&
				l.biases.length === dims[itemIndex][1] &&
				l.biases.every(Number.isFinite) &&
				Array.isArray(l.weights) &&
				l.weights.length === dims[itemIndex][0] &&
				l.weights.every(
					(r) =>
						Array.isArray(r) &&
						r.length === dims[itemIndex][1] &&
						r.every(Number.isFinite),
				),
		)
	);
}

function trafficBrain() {
	const brain = createDemoBrain(),
		[sense, drive] = brain.levels;
	// A sigmoid hidden unit smoothly detects a close center-lane obstacle.
	// The throttle output falls below 0.5 as the normalized center reading nears 1.
	sense.weights[2][2] = 4;
	sense.biases[2] = 2;
	drive.weights[2][0] = -4;
	drive.biases[0] = -2;
	return brain;
}
