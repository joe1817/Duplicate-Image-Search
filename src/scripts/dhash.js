class DHash {

	static async fromBlob(blob) {
		const img = await this._loadImage(blob);
		const canvas = document.createElement("canvas");
		const ctx = canvas.getContext("2d");

		// need 9 columns to get 8 differences per row
		const width = 9;
		const height = 8;
		canvas.width = width;
		canvas.height = height;

		ctx.drawImage(img, 0, 0, width, height);
		const imageData = ctx.getImageData(0, 0, width, height).data;
		const grayscale = this._toGrayscale(imageData);

		// generate bitstring by comparing neighbors
		let bitstring = "";
		for (let row = 0; row < height; row++) {
			for (let col = 0; col < width - 1; col++) {
				const left = grayscale[row * width + col];
				const right = grayscale[row * width + (col + 1)];
				bitstring += (left > right ? "1" : "0");
			}
		}

		return new DHash(bitstring, img.width, img.height);
	}

	static _loadImage(blob) {
		return new Promise((resolve, reject) => {
			const url = URL.createObjectURL(blob);
			const img = new Image();
			img.onload = () => {
				URL.revokeObjectURL(url);
				resolve(img);
			};
			img.onerror = reject;
			img.src = url;
		});
	}

	static _toGrayscale(data) {
		let grey = new Array(data.length/4);
		let r = 0, g = 0, b = 0;
		for (let i = 0, j = 0; i < data.length; i += 4, j++) {
			grey[j] = 0.2990000000 *  data[i] + 0.5870000000 *  data[i+1] + 0.1140000000 *  data[i+2];
		}
		return grey;
	}

	constructor(bitstring, imgWidth, imgHeight) {
		this.bitstring = bitstring;
		this.imgWidth = imgWidth;
		this.imgHeight = imgHeight;
	}

	compare(other) {
		let distance = 0;
		for (let i = 0; i < this.bitstring.length; i++) {
			if (this.bitstring[i] !== other.bitstring[i]) {
				distance++;
			}
		}
		return distance;
	}

	isSimilar(other, threshold = 5) {
		return this.compare(other) <= threshold;
	}
}
