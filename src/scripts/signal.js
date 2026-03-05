class Signal {
	constructor() {
		this.isPaused = false;
		this._promise = null;
		this._resolve = null;
	}

	async waitIfPaused() {
		if (this.isPaused) {
			await this._promise;
		}
	}

	pause() {
		if (!this.isPaused) {
			this.isPaused = true;
			this._promise = new Promise(res => this._resolve = res);
		}
	}

	unpause() {
		if (this.isPaused) {
			this.isPaused = false;
			this._resolve();
		}
	}
}
