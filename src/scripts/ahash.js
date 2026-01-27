class AHash {

    static async fromBlob(blob, iconDim = 11) {
		// Images will be treated as grids of "blocks", each containing "cells" (pixels).
		// Images will be compressed into icons with side length "iconDim"
		const blockDim  = 2 * iconDim + 1;
		const cellDim   =     iconDim + 1;
		const canvasDim = blockDim * cellDim; // Images will be loaded as squares with this side length

		if ((blockDim-2)%3 != 0) {
			throw new Error("Invalid iconDim");
		}

        const img = await this._loadImage(blob);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        canvas.width = canvasDim;
        canvas.height = canvasDim;

        ctx.drawImage(img, 0, 0, canvasDim, canvasDim);
        let data = ctx.getImageData(0, 0, canvasDim, canvasDim).data;
		data = this._toGrayscale(data);
		data = this._boxBlur(data, canvasDim, canvasDim, cellDim, cellDim);
		data = this._boxBlur(data, blockDim, blockDim, 3, 2);
		data = this._normalize(data);

		return new AHash(data, img.width, img.height);
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

	static _boxBlur(data, width, height, windowDim, shift) {
		const destDim = parseInt((width-windowDim)/shift) + 1;
		const blurredData = new Array(destDim ** 2);
		const n = windowDim ** 2;
		let sum;
		let i = 0, j = 0;

		for (let shiftRow = 0; shiftRow <= width-windowDim; shiftRow += shift) {
			for (let shiftCol = 0; shiftCol <= height-windowDim; shiftCol += shift) {
				sum = 0;
				for (let row = 0; row < windowDim; row++) {
					for (let col = 0; col < windowDim; col++) {
						i = ((row + shiftRow) * width + (col + shiftCol));
						sum += data[i];
					}
				}
				blurredData[j] = sum / n;
				j++;
			}
		}

		return blurredData;
	}

	static _normalize(vals) {
		let max  = 0;
		let min  = Number.POSITIVE_INFINITY;
		for (let i = 0; i < vals.length; i++) {
			if (vals[i] > max) {
				max = vals[i];
			} else if (vals[i] < min) {
				min = vals[i];
			}
		}

		let norm = null;
		let range = max - min;
		if (range < 0.00001) {
			norm = new Array(vals.length).fill(vals[0]);
		} else {
			norm = vals.map(val => (val - min) * 255 / range);
		}
		return norm;
	}

    constructor(data, imgWidth, imgHeight) {
        this.data = data;
		this.imgWidth = imgWidth;
		this.imgHeight = imgHeight;
    }

    compare(other) {
		let dist  = 0;
		for (let i = 0; i < this.data.length; i++) {
			dist += (this.data[i] - other.data[i]) ** 2;
		}
		return dist
    }

    isSimilar(other, dist = 400) {
        return this.compare(other) <= dist * this.data.length;
    }
}
