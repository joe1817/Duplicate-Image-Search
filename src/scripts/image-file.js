class ImageFile {
	static formats           = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];

	static iconDim           = 11;   // Images will be hashed into icons of this side length
	static ratioTolerancePct = 10;   // Image aspect ratios may differ by up to 10% before comparing
	static rejectLumaDist    = 400;  // Images will be considered distinct if there luma distance is outside this threshold

	static RESET_THRESHOLD   = 100;  // Reset the canvas after this many images

	static thumbWorker = new Worker("src/scripts/thumbnail-worker.js");

	static {
		// Images will be treated as grids of "blocks", each containing "cells". Each cell is a pixel.
		ImageFile.iconArea = ImageFile.iconDim ** 2;
		ImageFile.blockDim = 2 * ImageFile.iconDim + 1;
		ImageFile.cellDim  = ImageFile.iconDim + 1;

		if ((ImageFile.blockDim-2)%3 != 0) {
			throw new Error("Invalid iconDim");
		}

		ImageFile.canvasDim = ImageFile.blockDim * ImageFile.cellDim; // Images will be loaded as squares with this side length

		ImageFile.canvas  = new OffscreenCanvas(ImageFile.canvasDim, ImageFile.canvasDim);
		ImageFile.context = ImageFile.canvas.getContext("2d", { willReadFrequently: true });

		ImageFile.rejectLumaDist *= ImageFile.iconArea;

		ImageFile.imagesProcessed = 0;

		ImageFile.thumbWorker.onerror = () => {
			console.log("web workers unavailable");
			ImageFile.thumbWorker = null;
		}
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
		if (!exactMatch && fastRead && this.type === "jpeg") {
			const data = await this.readThumbnail();
			if (data) {
				const bitmap = await createImageBitmap(data);
				try {
					this.hash = ImageFile.getHash(bitmap);
				} finally {
					bitmap.close();
				}
				return;
			}
		}

		if (exactMatch) {
			const arrayBuffer = await this.file.arrayBuffer();
			const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
			const hashArray = Array.from(new Uint8Array(hashBuffer));
			const hash = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
			this.hash = hash;
			return;

		} else {
			const bitmap = await createImageBitmap(this.file);
			try {
				this.width  = bitmap.width;
				this.height = bitmap.height;
				this.hash = ImageFile.getHash(bitmap);
			} catch (error) {
				this.valid = false;
			} finally {
				bitmap.close();
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
		if (lo && hi && this.height && this.width) {
			console.log("thumbnail read: " + this.file.name);
			this.thumbStart = lo;
			this.thumbEnd   = hi;
			return new Blob([bytes.slice(lo, hi)], {type:"image/jpeg"}); // bytes.subarray will create a "view" into bytes that prevents GC
		} else {
			return null;
		}
	}

	static getHash(bitmap) {
		ImageFile.canvas.width = ImageFile.canvasDim;
		ImageFile.canvas.height = ImageFile.canvasDim;

		ImageFile.context.clearRect(0, 0, ImageFile.canvasDim, ImageFile.canvasDim); // prevent alpha-blending problems

		ImageFile.context.drawImage(bitmap, 0, 0, ImageFile.canvasDim, ImageFile.canvasDim);
		let data = ImageFile.context.getImageData(0, 0, ImageFile.canvasDim, ImageFile.canvasDim).data;
		data = ImageFile.rgbaToGreyscale(data);
		data = ImageFile.boxBlur(data, ImageFile.canvasDim, ImageFile.canvasDim, ImageFile.cellDim, ImageFile.cellDim);
		data = ImageFile.boxBlur(data, ImageFile.blockDim, ImageFile.blockDim, 3, 2);
		data = ImageFile.normalize(data);

		ImageFile.imagesProcessed++;
		if (ImageFile.imagesProcessed % ImageFile.RESET_THRESHOLD === 0 || bitmap.width > 6000 || bitmap.height > 6000) {
			ImageFile.refreshCanvas();
		}

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

	static refreshCanvas() {
		// clears GPU command buffer and other metadata, and helps compact memory

		// Setting width/height to their own values clears the state,
		// but setting them to 0 then back to the target size
		// forces a full memory purge in most browser engines.
		const oldWidth = ImageFile.canvas.width;
		const oldHeight = ImageFile.canvas.height;

		ImageFile.canvas.width = 0;
		ImageFile.canvas.height = 0;

		ImageFile.canvas.width = oldWidth;
		ImageFile.canvas.height = oldHeight;

		console.log("canvas context reset");
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

	async createThumbnail(canvas) {
		const dpr = window.devicePixelRatio || 1;
		const blob = this.thumbStart && this.thumbEnd ? this.file.slice(this.thumbStart, this.thumbEnd) : this.file;

		let resizeWidth, resizeHeight;
		if (this.width && this.height) { // will not be known during an exact match scan
			if (this.width >= this.height) {
				resizeWidth = Config.thumbnailMaxDim;
				resizeHeight = Math.floor(this.height * resizeWidth / this.width);
			} else {
				resizeHeight = Config.thumbnailMaxDim;
				resizeWidth = Math.floor(this.width * resizeHeight / this.height);
			}

			canvas.width = resizeWidth * dpr;
			canvas.height = resizeHeight * dpr;
			canvas.style.width = resizeWidth + "px";
			canvas.style.height = resizeHeight + "px";
		}

		// Use web worker if it's available

		if (ImageFile.thumbWorker && resizeWidth && resizeHeight) {
			return new Promise((resolve, reject) => {
				// Create a unique ID for this specific request
				const requestId = Math.random().toString(36).substring(2, 15);

				// Use a robust listener instead of overwriting onmessage
				const handler = (e) => {
					if (e.data.id === requestId) {
						ImageFile.thumbWorker.removeEventListener("message", handler);
						if (e.data.error) {
							reject(e.data.error);
						} else {
							const ctx = canvas.getContext("2d");
							ctx.drawImage(e.data.bitmap, 0, 0);
							e.data.bitmap.close();
							resolve();
						}
					}
				};

				ImageFile.thumbWorker.addEventListener("message", handler);

				// Pass the blob and dimensions.
				// Don't transfer the canvas so the main thread keeps control.
				// Otherwise, the canvas is at risk of being de-loaded when scrolled out of view.
				ImageFile.thumbWorker.postMessage({
					id: requestId,
					blob,
					width: resizeWidth * dpr,
					height: resizeHeight * dpr
				});
			});
		} else {
			if (resizeWidth && resizeHeight) {
				// width & height were determined in getHash() (happens in perceptual match searches)

				// resizing inside createImageBitmap is slightly slower than in drawImage
				// but it makes much better thumbnails, even at "low" quality
				const bitmap = await createImageBitmap(blob, {
					resizeWidth: resizeWidth * dpr,
					resizeHeight: resizeHeight * dpr,
					resizeQuality: "low"
				});

				const ctx = canvas.getContext("2d");
				//ctx.drawImage(bitmap, 0, 0,  width * dpr, height * dpr);
				ctx.drawImage(bitmap, 0, 0);
				bitmap.close();
			} else {
				// width & height are not known because getHash() was not called (happens in exact match searches)

				const bitmap = await createImageBitmap(blob);
				this.width = bitmap.width;
				this.height = bitmap.height;

				if (bitmap.width >= bitmap.height) {
					resizeWidth = Config.thumbnailMaxDim;
					resizeHeight = Math.floor(bitmap.height * resizeWidth / bitmap.width);
				} else {
					resizeHeight = Config.thumbnailMaxDim;
					resizeWidth = Math.floor(bitmap.width * resizeHeight / bitmap.height);
				}

				canvas.width = resizeWidth * dpr;
				canvas.height = resizeHeight * dpr;
				canvas.style.width = resizeWidth + "px";
				canvas.style.height = resizeHeight + "px";

				const ctx = canvas.getContext("2d");
				ctx.drawImage(bitmap, 0, 0,  resizeWidth * dpr, resizeHeight * dpr);
				bitmap.close();
			}
		}
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
