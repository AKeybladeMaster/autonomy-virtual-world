class NeuralNetwork {
	constructor(neuronCounts) {
		this.levels = [];
		for (let itemIndex = 0; itemIndex < neuronCounts.length - 1; itemIndex++) {
			this.levels.push(new Level(neuronCounts[itemIndex], neuronCounts[itemIndex + 1]));
		}
	}

	static feedForward(givenInputs, network) {
		let outputs = Level.feedForward(givenInputs, network.levels[0]);
		for (let itemIndex = 1; itemIndex < network.levels.length; itemIndex++) {
			outputs = Level.feedForward(outputs, network.levels[itemIndex]);
		}
		return outputs;
	}

	static sigmoid(value) {
		const boundedValue = Math.max(-60, Math.min(60, value));
		return 1 / (1 + Math.exp(-boundedValue));
	}

	static mutate(network, amount = 1) {
		const mutationStrength = Number.isFinite(amount)
			? Math.max(0, Math.min(1, amount))
			: 0;
		network.levels.forEach((level) => {
			for (let itemIndex = 0; itemIndex < level.biases.length; itemIndex++) {
				level.biases[itemIndex] = lerp(
					level.biases[itemIndex],
					Math.random() * 2 - 1,
					mutationStrength,
				);
			}
			for (let itemIndex = 0; itemIndex < level.weights.length; itemIndex++) {
				for (
					let nextItemIndex = 0;
					nextItemIndex < level.weights[itemIndex].length;
					nextItemIndex++
				) {
					level.weights[itemIndex][nextItemIndex] = lerp(
						level.weights[itemIndex][nextItemIndex],
						Math.random() * 2 - 1,
						mutationStrength,
					);
				}
			}
		});
	}
}

class Level {
	constructor(inputCount, outputCount) {
		this.inputs = new Array(inputCount);
		this.outputs = new Array(outputCount);
		this.biases = new Array(outputCount);

		this.weights = [];
		for (let itemIndex = 0; itemIndex < inputCount; itemIndex++) {
			this.weights[itemIndex] = new Array(outputCount);
		}

		Level.#randomize(this);
	}

	static #randomize(level) {
		const weightLimit = Math.sqrt(6 / (level.inputs.length + level.outputs.length));
		for (let itemIndex = 0; itemIndex < level.inputs.length; itemIndex++) {
			for (
				let nextItemIndex = 0;
				nextItemIndex < level.outputs.length;
				nextItemIndex++
			) {
				level.weights[itemIndex][nextItemIndex] = (Math.random() * 2 - 1) * weightLimit;
			}
		}

		for (let itemIndex = 0; itemIndex < level.biases.length; itemIndex++) {
			level.biases[itemIndex] = 0;
		}
	}

	static feedForward(givenInputs, level) {
		for (let itemIndex = 0; itemIndex < level.inputs.length; itemIndex++) {
			level.inputs[itemIndex] = givenInputs[itemIndex];
		}

		for (let itemIndex = 0; itemIndex < level.outputs.length; itemIndex++) {
			let sum = 0;
			for (
				let nextItemIndex = 0;
				nextItemIndex < level.inputs.length;
				nextItemIndex++
			) {
				sum += level.inputs[nextItemIndex] * level.weights[nextItemIndex][itemIndex];
			}

			level.outputs[itemIndex] = NeuralNetwork.sigmoid(sum - level.biases[itemIndex]);
		}

		return level.outputs;
	}
}
