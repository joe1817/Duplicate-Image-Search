class ImageFile {
	static formats           = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];

	static iconDim           = 11;   // Images will be hashed into icons of this side length
	static ratioTolerancePct = 10;   // Image aspect ratios may differ by up to 10% before comparing
	static rejectLumaDist    = 400;  // Images will be considered distinct if there luma distance is outside this threshold

	static {
		// Images will be treated as grids of "blocks", each containing "cells". Each cell is a pixel.
		ImageFile.iconArea = ImageFile.iconDim ** 2;
		ImageFile.blockDim = 2 * ImageFile.iconDim + 1;
		ImageFile.cellDim  = ImageFile.iconDim + 1;

		if ((ImageFile.blockDim-2)%3 != 0) {
			throw new Error("Invalid iconDim");
		}

		ImageFile.canvasDim = ImageFile.blockDim * ImageFile.cellDim; // Images will be loaded as squares with this side length

		ImageFile.img     = new Image();
		ImageFile.canvas  = document.createElement("canvas");
		ImageFile.context = ImageFile.canvas.getContext("2d", { willReadFrequently: true });

		ImageFile.canvas.width  = ImageFile.canvasDim;
		ImageFile.canvas.height = ImageFile.canvasDim;

		ImageFile.rejectLumaDist *= ImageFile.iconArea;
	}

	constructor(file) {
		this.file       = file;
		this.relpath    = file.webkitRelativePath || file.name; // webkitRelativePath is "" for top-level dropped files
		this.depth      = this.relpath.split("/").length-1; // Forward-slash is used on Windows, too
		this.type       = null;
		this.valid      = null;
		this.width      = null;
		this.height     = null;
		this.hash       = null;
		this.clusterID  = null;
		this.thumbStart = null;
		this.thumbEnd   = null;

		// type is "" for dropped files inside folders
		const i = file.name.lastIndexOf(".");
		this.type = i == -1 ? "" : file.name.substring(i+1);
		if (this.type === "jpg") {
			this.type = "jpeg";
		}
	}

	isValid() {
		if (this.valid === null) {
			this.valid = ImageFile.formats.includes(this.type) && this.file.size <= Config.maxFileSize;
		}
		return this.valid;
	}

	async load(fastRead, exactMatch) {
		try {
			if (exactMatch || !fastRead || this.type != "jpeg") {
				throw Error();
			}

			const data = await this.readThumbnail();
			if (data == null) {
				//this.load_file(resolve, reject);
				throw Error();
			} else {
				await new Promise((resolve, reject) => {
					ImageFile.img.onload = () => {
						URL.revokeObjectURL(ImageFile.img.src);
						resolve()
					};
					ImageFile.img.onerror = () => {
						URL.revokeObjectURL(ImageFile.img.src);
						reject();
					};
					ImageFile.img.src = URL.createObjectURL(data);
				});
				this.hash = ImageFile.getHash();
			}

		} catch (error) {

			if (exactMatch) {
				const arrayBuffer = await this.file.arrayBuffer();
				const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
				const hashArray = Array.from(new Uint8Array(hashBuffer));
				const hash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
				this.hash = hash;

			} else {

				await new Promise((resolve, reject) => {
					ImageFile.img.onload = () => {
						URL.revokeObjectURL(ImageFile.img.src);
						this.hash   = ImageFile.getHash();
						this.width  = ImageFile.img.width;
						this.height = ImageFile.img.height;
						resolve();
					}

					ImageFile.img.onerror = () => {
						URL.revokeObjectURL(ImageFile.img.src);
						this.valid = false;
						reject();
					}

					ImageFile.img.src = URL.createObjectURL(this.file); // slow
				});
			}
		}
	}

	async readThumbnail() {
		const reader = new FileReader();

		let bytes = null;
		try {
			bytes = await new Promise((resolve, reject) => {
				reader.readAsArrayBuffer(this.file.slice(0, 80*1024));
				reader.onerror = reject;
				reader.onload = (evt) => {
					resolve(new Uint8Array(evt.target.result));
				}
			});
		} catch(error) {
			return null;
		} finally {
			reader.onload = null;
			reader.onerror = null;
			reader = null;
		}

		let lo, hi;
		for (let i = 0; i < bytes.length; ) {
			while(bytes[i] == 0xFF) i++;
			let marker = bytes[i];  i++;
			if (0xD0 <= marker && marker <= 0xD7) continue; // RST
			if (marker == 0xD8) continue; // SOI
			if (marker == 0xD9) break;    // EOI
			if (marker == 0x01) continue; // TEM
			if (marker == 0x00) continue; // escaped 0xFF byte
			const len = (bytes[i]<<8) | bytes[i+1];  i+=2;
			if (marker == 0xE1) { // APP1
				if (bytes[i] == 0x45 && bytes[i+1] == 0x78 && bytes[i+2] == 0x69 && bytes[i+3] == 0x66 && bytes[i+4] == 0x00 && bytes[i+5] == 0x00) { // EXIF header
					// search for embedded image
					for (let j = i+6; j < i+len-2; j++) {
						if (bytes[j] == 0xFF) {
							if (!lo) {
								if (bytes[j + 1] == 0xD8) {
									lo = j;
								}
							} else {
								if (bytes[j + 1] == 0xD9) {
									hi = j + 2;
									break;
								}
							}
						}
					}
				}
			}
			if (marker == 0xC0) {
				this.height = (bytes[i+1]<<8) | bytes[i+2];
				this.width  = (bytes[i+3]<<8) | bytes[i+4];
				break;
			}
			i+=len-2;
		}
		if (lo && hi) {
			console.log("thumbnail read: " + this.file.name);
			this.thumbStart = lo;
			this.thumbEnd   = hi;
			return new Blob([bytes.slice(lo, hi)], {type:"image/jpeg"}); // bytes.subarray will create a "view" into bytes that prevents GC
		} else {
			return null;
		}
	}

	static getHash() {
		ImageFile.context.drawImage(ImageFile.img, 0, 0, ImageFile.canvasDim, ImageFile.canvasDim); // very slow
		let data = ImageFile.context.getImageData(0, 0, ImageFile.canvasDim, ImageFile.canvasDim).data; // slow
		data = ImageFile.rgbaToGreyscale(data);
		data = ImageFile.boxBlur(data, ImageFile.canvasDim, ImageFile.canvasDim, ImageFile.cellDim, ImageFile.cellDim);
		data = ImageFile.boxBlur(data, ImageFile.blockDim, ImageFile.blockDim, 3, 2);
		data = ImageFile.normalize(data);
		return data;
	}

	static rgbaToGreyscale(data) {
		let grey = new Array(data.length/4);
		let r = 0, g = 0, b = 0;
		for (let i = 0, j = 0; i < data.length; i += 4, j++) {
			let r = data[i  ];
			let g = data[i+1];
			let b = data[i+2];
			grey[j] = 0.2990000000 * r + 0.5870000000 * g + 0.1140000000 * b;
		}
		return grey;
	}

	static boxBlur(data, width, height, windowDim, shift) {
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

	static normalize(vals) {
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

	static distance(a, b) {
		const icon1 = a.hash, icon2 = b.hash;
		let dist  = 0;
		for (let i = 0; i < ImageFile.iconArea; i++) {
			dist += (icon1[i] - icon2[i]) ** 2;
		}
		return dist
	}

	similar(other, exactMatch) {
		if (exactMatch) {
			return this.hash == other.hash;
		} else {
			const w1 = this.width,  w2 = other.width;
			const h1 = this.height, h2 = other.height;
			// abs(ratio1 - ratio2) > tol% * max(ratio1, ratio2)  -->  reject
			if (Math.abs(100*h1*w2 - 100*h2*w1) > Math.max(h1*w2, h2*w1) * ImageFile.ratioTolerancePct) {
				return false;
			}
			if (ImageFile.distance(this, other) > ImageFile.rejectLumaDist) {
				return false;
			}
			return true;
		}
	}

	async createThumbnail() {
		let img = new Image();

		return new Promise( (resolve, reject) => {
			img.onload = () => {
				if (this.width == null) {
					this.width  = img.width;
					this.height = img.height;
				}
				if (img.width >= img.height) {
					ImageFile.canvas.height = Config.thumbnailMaxDim * Config.thumbnailOversample;
					ImageFile.canvas.width = Math.floor(img.width * ImageFile.canvas.height / img.height);
				} else {
					ImageFile.canvas.width = Config.thumbnailMaxDim * Config.thumbnailOversample;
					ImageFile.canvas.height = Math.floor(img.height * ImageFile.canvas.width / img.width);
				}
				ImageFile.context.drawImage(img, 0, 0, ImageFile.canvas.width, ImageFile.canvas.height);
				this.thumbdata = ImageFile.canvas.toDataURL("image/jpeg", Config.thumbnailQuality); // somewhat slow

				resolve();
			}

			img.onerror = reject;

			if (this.thumbStart && this.thumbEnd)
				img.src = URL.createObjectURL(this.file.slice(this.thumbStart, this.thumbEnd));
			else
				img.src = URL.createObjectURL(this.file); // slow
		}).finally(() => {
			URL.revokeObjectURL(img.src);
			img.src = ""; // stop the browser from loading/keeping pixels
			img.onload = null; // kill closures
			img.onerror = null;
			img = null; // GC hint
		});
	}
}

async function supportsJXL() {
	// A 1x1 JPEG XL image in Base64
	const jxlData = "data:image/jxl;base64,/wrkBggBCAgMAA==";

	return new Promise((resolve) => {
		const img = new Image();
		img.onload = () => resolve(img.width > 0);
		img.onerror = () => resolve(false);
		img.src = jxlData;
	});
}

supportsJXL().then(supported => {
	if (supported) {
		ImageFile.formats.push("jxl");
	}
	console.log("jxl support: " + supported);
});
