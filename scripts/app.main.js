const State = {
	mustMatch          : null,
	pause              : false,
	isMouseDown        : false,
	highlighted        : [],
	highlightDirection : "",
}

const Config = {
	fastRead            : false,
	thumbnailQuality    : 0.6,
	thumbnailMaxDim     : 160,
	thumbnailOversample : 2,
};

const Results = {
	filecount           : 0,
	clusters            : [],
	timeStart           : null,
	timeEnd             : null,
	durationLoading     : 0,
	durationHashing     : 0,
	durationSearch      : 0,
};

const DOM = {}

class ImageFile {
	static formats           = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];

	static maxFileSize       = 40*1024*1024;

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

		ImageFile.rejectLumaDist   *= ImageFile.iconArea;
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
			this.valid = ImageFile.formats.includes(this.type) && this.file.size <= ImageFile.maxFileSize;
		}
		return this.valid;
	}

	load() {
		return new Promise((resolve, reject) => {
			if (Config.fastRead && this.type == "jpeg") {
				this.readThumbnail((data) => {
					if (data == null) {
						this.load_file(resolve, reject);
					} else {
						ImageFile.img.onload = () => {
							URL.revokeObjectURL(ImageFile.img.src);
							this.hash = ImageFile.getHash();
							resolve();
						}

						ImageFile.img.onerror = () => {
							this.load_file(resolve, reject);
						}

						ImageFile.img.src = URL.createObjectURL(data);
					}
				});
			} else {
				this.load_file(resolve, reject);
			}
		});
	}

	load_file(resolve, reject) {
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
	}

	readThumbnail(callback) {

		const reader = new FileReader();

		reader.onload = (evt) => {
			const bytes = new Uint8Array(evt.target.result);
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
				callback(new Blob([bytes.subarray(lo, hi)], {type:"image/jpeg"}));
			} else {
				callback(null);
			}
		}

		reader.onerror = () => {
			callback(null);
		}

		reader.readAsArrayBuffer(this.file.slice(0, 80*1024));
	}

	static getHash() {
		const timeStartLoading = performance.now();
		ImageFile.context.drawImage(ImageFile.img, 0, 0, ImageFile.canvasDim, ImageFile.canvasDim); // very slow
		let data = ImageFile.context.getImageData(0, 0, ImageFile.canvasDim, ImageFile.canvasDim).data; // slow
		const timeStartHashing = performance.now();
		Results.durationLoading += (timeStartHashing - timeStartLoading);
		data = ImageFile.rgbaToGreyscale(data);
		data = ImageFile.boxBlur(data, ImageFile.canvasDim, ImageFile.canvasDim, ImageFile.cellDim, ImageFile.cellDim);
		data = ImageFile.boxBlur(data, ImageFile.blockDim, ImageFile.blockDim, 3, 2);
		data = ImageFile.normalize(data);
		Results.durationHashing += (performance.now() - timeStartHashing);
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

	similar(other) {
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

	async createThumbnail() {
		return new Promise( (resolve, reject) => {

			let img = new Image();

			img.onload =  () => {
				if (img.width >= img.height) {
					ImageFile.canvas.height = Config.thumbnailMaxDim * Config.thumbnailOversample;
					ImageFile.canvas.width = Math.floor(img.width * ImageFile.canvas.height / img.height);
				} else {
					ImageFile.canvas.width = Config.thumbnailMaxDim * Config.thumbnailOversample;
					ImageFile.canvas.height = Math.floor(img.height * ImageFile.canvas.width / img.width);
				}
				ImageFile.context.drawImage(img, 0, 0, ImageFile.canvas.width, ImageFile.canvas.height);
				this.thumbdata = ImageFile.canvas.toDataURL("image/jpeg", Config.thumbnailQuality); // somewhat slow

				URL.revokeObjectURL(img.src);
				img = null;

				resolve();
			}

			if (this.thumbStart && this.thumbEnd)
				img.src = URL.createObjectURL(this.file.slice(this.thumbStart, this.thumbEnd));
			else
				img.src = URL.createObjectURL(this.file); // slow
		});
	}
}











// typeof files = FileList or Array[File]
async function startSearch(allFiles) {
	Results.timeStart = performance.now();
	Config.fastRead = document.getElementById("fast-option").checked;

	allImageFiles = [];
	Array.from(allFiles).forEach(file => {
		let ifile = new ImageFile(file);
		if (ifile.isValid()) {
			allImageFiles.push(ifile);
		}
	});
	allImageFiles.sort((a,b) => {
		return -PathSort.compare(a.relpath, b.relpath); // negative b/c items will be popped from the back
	});

	Results.filecount = allImageFiles.length;
	if (State.mustMatch) {
		State.mustMatch = new ImageFile(State.mustMatch);
		await State.mustMatch.load();
	}
	updateUISearchStarted();
	processNext(allImageFiles);
}

function processNext(files, scannedFiles=[], n=0) {
	if (!files.length) {
		updateUISearchDone();
		return;
	}
	if (State.pause) {
		setTimeout(processNext, 1000, files, scannedFiles, n);
		return;
	}
	if (State.mustMatch)
		scannedFiles.push(State.mustMatch);

	updateUIProgress(n);
	let ifile = files.pop();

	ifile.load()
		.then(() => {
			const timeSearchStart = performance.now();
			searchForMatch(ifile, scannedFiles);
			if (!State.mustMatch)
				scannedFiles.push(ifile);
			Results.durationSearch += (performance.now() - timeSearchStart);
		})
		.catch((err) => {
			console.log("*** error loading " + ifile.path);
			console.log(err);
		})
		.finally(() => {
			processNext(files, scannedFiles, n+1);
		});
}

function searchForMatch(ifile, scannedFiles) {
	for (const ifile2 of scannedFiles) {
		if (ifile.similar(ifile2)) {
			groupTogether(ifile, ifile2);
			break;
		}
	}
}

function groupTogether(ifile1, ifile2) {
	const i = ifile1.clusterID;
	const j = ifile2.clusterID;

	let send1 = false, send2 = false;

	if (i == null && j == null) {
		ifile1.clusterID = Results.clusters.length;
		ifile2.clusterID = Results.clusters.length;
		Results.clusters.push([ifile1, ifile2]);
		send1 = true;
		send2 = true;
	}

	if (typeof i === "number") {
		Results.clusters[i].push(ifile2);
		ifile2.clusterID = i;
		send2 = true;
	}

	if (typeof j === "number") {
		Results.clusters[j].push(ifile1);
		ifile1.clusterID = j;
		send1 = true;
	}

	if (send2 && !State.mustMatch) {
		updateUIDuplicateFound(ifile2);
	}
	if (send1) {
		updateUIDuplicateFound(ifile1);
	}
}










function filePicker() {
	document.getElementById("input-file").click();
}

function dirPicker() {
	updateUISearchPending();
	document.getElementById("input-dir").click();
}

function copyToClipboard(text) {
	navigator.clipboard.writeText(text);
	document.getElementById("message").textContent = "Copied to clipboard!";
	document.getElementById("message").classList.remove("hidden");
	setTimeout(function() {
		document.getElementById("message").classList.add("hidden");
	}, 1000);
}

function updateText(element, text) {
	document.querySelector(element).textContent = text;
}

function createChildDiv(className, parent) {
	const element = document.createElement("div");
	element.className = className;
	parent.appendChild(element);
	return element;
}

function createChildSpan(className, parent) {
	const element = document.createElement("span");
	element.className = className;
	parent.appendChild(element);
	return element;
}

function formatDate(d){
	return d.getFullYear() + "." + (d.getMonth()+1).toString().padStart(2, "0") + "." + d.getDate().toString().padStart(2, "0");
}

function updateLocalStorage() {
	localStorage.setItem("fast-option", document.getElementById("fast-option").checked);
}

function updateUIOptions() {
	if (localStorage.getItem("fast-option") == null) {
		document.getElementById("fast-option").checked = true;
	}
	else if (localStorage.getItem("fast-option") == "false") {
		document.getElementById("fast-option").checked = false;
	} else {
		document.getElementById("fast-option").checked = true;
	}
}

function clickCheckbox(event) {
	if (event.target.tagName != "INPUT") {
		document.getElementById("fast-option").click();
	}
}

function updateUISearchPending() {
	setTimeout(() => {
		document.getElementById("options-cancel").classList.remove("hidden");
		document.getElementById("options-start").classList.add("hidden");
	}, 500); // start after the file picker is displayed
}

function updateUISearchStarted() {
	document.querySelector(".options-page").classList.add("hidden");
	document.querySelector(".header").classList.remove("hidden");
	DOM.allClusters.classList.remove("hidden");
}

function updateUIProgress(n) {
	const s = Results.clusters.length == 1 ? "" : "s";
	updateText(".progress-text", "Please wait... Reading file ".concat(n, " of ", Results.filecount, ". Found ", Results.clusters.length, " cluster", s, " so far."));
	let pct = Math.floor(100 * n / Results.filecount);
	if (pct < 5) {
		pct = 5;
	}
	DOM.progressBar.style.width = "".concat(pct, "%");
}

function updateUIDuplicateFound(ifile) {
	let divClusterImgs = document.querySelectorAll(".cluster-imgs")[ifile.clusterID];
	let divClusterInfo = document.querySelectorAll(".cluster-info")[ifile.clusterID];

	if (divClusterImgs === undefined) {
		const a = createChildDiv("cluster", DOM.allClusters);
		const b = createChildDiv("cluster-num", a);
		b.textContent = ifile.clusterID + 1;
		const c = createChildDiv("cluster-content", a);
		divClusterImgs = createChildDiv("cluster-imgs", c);
		divClusterInfo = createChildDiv("cluster-info", c);
		b.addEventListener("click", () => {
			c.classList.toggle("hidden");
		});
		State.highlighted.push(0);
	}

	const divImg = createChildDiv("div-img", divClusterImgs);
	const thumb = new Image();
	thumb.classList.add("cluster-img");
	thumb.title = ifile.relpath;
	divImg.appendChild(thumb);
	const divImgDims = createChildDiv("image-dims", divImg);
	divImg.ondragstart = function() { return false; };

	ifile.createThumbnail().then(() => {
		divImgDims.textContent = "".concat(ifile.width, "×", ifile.height);
		thumb.classList.add("hidden");
		thumb.src = ifile.thumbdata;
		thumb.onload = () => {
			thumb.width = thumb.width / Config.thumbnailOversample;
			thumb.height = thumb.height / Config.thumbnailOversample;
			thumb.classList.remove("hidden");
			ifile.thumbdata = null;
		}
	});

	const divImgInfo = createChildDiv("img-info", divClusterInfo);
	const divImgSize = createChildSpan("img-info-part size", divImgInfo);
	const divImgDate = createChildSpan("img-info-part date", divImgInfo);
	const divImgPath = createChildSpan("img-info-part path", divImgInfo);
	divImgSize.textContent = parseInt(ifile.file.size/1024);
	divImgDate.textContent = formatDate(new Date(ifile.file.lastModified));
	divImgPath.textContent = ifile.relpath;

	mouseOverFunc = (event) => {
		const clusterNum = document.querySelectorAll(".cluster-num")[ifile.clusterID];
		divImgInfo.classList.add("hovered");
		divImg.classList.add("hovered");
		if (State.isMouseDown) {
			if (divImgInfo.classList.contains("highlighted")) {
				if (State.highlightDirection !== "adding") {
					divImgInfo.classList.remove("highlighted");
					divImg.classList.remove("highlighted");
					State.highlightDirection = "removing";
					State.highlighted[ifile.clusterID]--;
					clusterNum.classList.remove("all-selected");
					if (State.highlighted[ifile.clusterID] == 0) {
						clusterNum.classList.remove("some-selected");
					}
				}
			} else {
				if (State.highlightDirection !== "removing") {
					divImgInfo.classList.add("highlighted");
					divImg.classList.add("highlighted");
					State.highlightDirection = "adding";
					State.highlighted[ifile.clusterID]++;
					clusterNum.classList.add("some-selected");
					if (State.highlighted[ifile.clusterID] == divClusterImgs.children.length) {
						clusterNum.classList.add("all-selected");
					}
				}
			}
		}
	}
	mouseOutFunc = (event) => {
		divImgInfo.classList.remove("hovered");
		divImg.classList.remove("hovered");
	}
	mouseDownFunc = (event) => {
		const clusterNum = document.querySelectorAll(".cluster-num")[ifile.clusterID];
		if (event.ctrlKey) {
			event.stopPropagation();
			copyToClipboard(ifile.file.name);
		} else {
			divImgInfo.classList.toggle("highlighted");
			divImg.classList.toggle("highlighted");
			if (divImgInfo.classList.contains("highlighted")) {
				State.highlightDirection = "adding";
				State.highlighted[ifile.clusterID]++;
				clusterNum.classList.add("some-selected");
				if (State.highlighted[ifile.clusterID] == divClusterImgs.children.length) {
					clusterNum.classList.add("all-selected");
				}
			} else {
				State.highlightDirection = "removing";
				State.highlighted[ifile.clusterID]--;
				clusterNum.classList.remove("all-selected");
				if (State.highlighted[ifile.clusterID] == 0) {
					clusterNum.classList.remove("some-selected");
				}
			}
		}
	}
	divImgInfo.addEventListener("mouseover", mouseOverFunc);
	divImg.addEventListener("mouseover", mouseOverFunc);
	divImgInfo.addEventListener("mouseout", mouseOutFunc);
	divImg.addEventListener("mouseout", mouseOutFunc);
	divImgInfo.addEventListener("mousedown", mouseDownFunc);
	divImg.addEventListener("mousedown", mouseDownFunc);

	let parts = divClusterInfo.querySelectorAll(".img-info-part.size");
	let bestPart = null, bestVal = 0, val = null;
	parts.forEach((part) => {
		val = parseInt(part.textContent);
		if (val > bestVal) {
			bestVal = val;
			bestPart = part;
		}
		part.classList.remove("best-part");
	});
	parts.forEach((part) => {
		val = parseInt(part.textContent)
		if (val == bestVal) {
			part.classList.add("best-part");
		}
	});

	parts = divClusterInfo.querySelectorAll(".img-info-part.date");
	bestPart = null, bestVal = new Date(0), val = null;
	parts.forEach((part) => {
		val = new Date(part.textContent);
		if (val > bestVal) {
			bestVal = val;
			bestPart = part;
		}
		part.classList.remove("best-part");
	});
	parts.forEach((part) => {
		val = new Date(part.textContent)
		if (val.getTime() === bestVal.getTime()) {
			part.classList.add("best-part");
		}
	});

	parts = divClusterInfo.querySelectorAll(".img-info-part.path");
	parts.forEach((part) => {
		if (part.textContent.endsWith(".png")) {
			part.classList.add("best-part");
		}
	});
}

function updateUISearchDone() {
	Results.timeEnd = performance.now();
	console.log("Total duration:     " + (Results.timeEnd - Results.timeStart) + "ms");
	console.log("Loading duration:   " + Results.durationLoading + "ms");
	console.log("Hashing duration:   " + Results.durationHashing + "ms");
	console.log("Searching duration: " + Results.durationSearch + "ms");
	document.getElementById("button-pause-search").classList.add("hidden");
	const progress = document.querySelector(".progress");
	progress.removeChild(progress.querySelector(".progress-bar"));
	const s  = Results.filecount       == 1 ? "" : "s";
	const s2 = Results.clusters.length == 1 ? "" : "s";
	updateText(".progress-text", "Successfully scanned ".concat(Results.filecount, " image", s, ". Found ", Results.clusters.length, " cluster", s2, "."));
	if (Results.clusters.length == 0) {
		if (State.mustMatch && Results.filecount == 0) {
			document.getElementById("message").textContent = "The selected folder does not contain any images of supported types. Images must be JPG, PNG, GIF, WEBP, or BMP files less than 40 MB in size.";
		}
		else if (!State.mustMatch && Results.filecount <= 1) {
			document.getElementById("message").textContent = "The selected folder does not contain at least 2 images of supported types. Images must be JPG, PNG, GIF, WEBP, or BMP files less than 40 MB in size.";
		} else {
			document.getElementById("message").textContent = "No duplicates found.";
		}
		document.getElementById("message").classList.remove("hidden");
	}
}

function togglePause() {
	State.pause = !State.pause;
	if (document.getElementById("button-pause-search").textContent == "Pause") {
		document.getElementById("button-pause-search").textContent = "Resume";
	} else {
		document.getElementById("button-pause-search").textContent = "Pause";
	}
}

function reloadPage() {
	location.reload();
}

function showAllList() {
	let text = "";
	for (let cluster of Results.clusters) {
		for (let ifile of cluster) {
			text = text.concat(ifile.file.webkitRelativePath || ifile.file.name, "\n");
		}
		text = text.concat("\n");
	}
	text = text.trimEnd();
	document.querySelector(".textarea").value = text;
	toggleList();
}

function showHighlightedList() {
	let text = "";
	for (let cluster of DOM.allClusters.querySelectorAll(".cluster")) {
		let paths = cluster.querySelectorAll(".highlighted.img-info > .path");
		if (paths.length) {
			for (let path of paths) {
				text = text.concat(path.textContent, "\n");
			}
			text = text.concat("\n");
		}
	}
	text = text.trimEnd();

	document.querySelector(".textarea").value = text;
	toggleList();
}

function toggleList() {
	document.querySelector(".textarea").classList.toggle("textareaon");
	document.getElementById("show-all-button").classList.toggle("hidden");
	document.getElementById("show-high-button").classList.toggle("hidden");
	document.getElementById("close-button").classList.toggle("hidden");
	document.getElementById("copy-button").classList.toggle("hidden");
	document.getElementById("save-button").classList.toggle("hidden");
}

function copyListToClipboard() {
	copyToClipboard(document.querySelector(".textarea").value);
}

function downloadList() {
	const data = document.querySelector(".textarea").value;
	const filename = `selected-duplicates-${formatDate(new Date())}.txt`;
	const type = "text/plain";
	const file = new Blob([data], {type: type});
		if (window.navigator.msSaveOrOpenBlob) // IE10+
			window.navigator.msSaveOrOpenBlob(file, filename);
	else { // Others
		const a = document.createElement("a"),
		url = URL.createObjectURL(file);
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		setTimeout(() => {
			document.body.removeChild(a);
			window.URL.revokeObjectURL(url);
		}, 0);
	}
}

document.getElementById("input-file").onchange = (event) => {
	State.mustMatch = event.target.files[0];
	document.getElementById("selected-file").classList.remove("hidden");
	let name = State.mustMatch.name;
	if (name.length > 53)
		name = name.substring(0, 25) + "..." + name.substring(name.length-25, name.length);
	document.getElementById("file-path").textContent = name;

}

document.getElementById("input-dir").onchange = (event) => {
	try {
		startSearch(event.target.files);
	} finally {
		event.target.value = "";
	}
}

document.addEventListener("dragover", (event) => {
    event.preventDefault();
});

document.addEventListener("drop", (event) => {
	event.preventDefault();

	updateUISearchPending();

	const items = event.dataTransfer.items;
	const files = [];

	let count = items.length;

	const onFile = (file) => {
		files.push(file);
		if (!--count) startSearch(files);
	}
	const onEntries = (entries) => {
		count += entries.length;
		for (const entry of entries) {
			scanFiles(entry);
		}
		if (!--count) startSearch(files);
	};
	const onErr = (err) => {
		console.log(err);
		if (!--count) startSearch(files);
	}

	// can scan subdriectories with FileSystemDirectoryEntry, but not with File
	const scanFiles = (entry) => {
		if (entry.isFile) {
			entry.file(onFile, onErr); // TODO for some reason, this will sometimes throw an EncodingError on Edge when run locally
		} else {
			entry.createReader().readEntries(onEntries, onErr);
		}
	}

	for (const item of items) {
		const entry = item.webkitGetAsEntry();
		if (entry) {
			scanFiles(entry);
		} else {
			if (!--count) startSearch(files);
		}
	}
}, false);

document.addEventListener("keydown", (event) => {
	if (event.key === "Escape" && document.querySelector(".textarea").classList.contains("textareaon")) {
		toggleList();
	}
});

document.addEventListener("mousedown", () => {
	State.isMouseDown = true;
});

document.addEventListener("mouseup", () => {
	State.isMouseDown = false;
	State.highlightDirection = "";
});

window.addEventListener("DOMContentLoaded", () => {
	updateUIOptions();
	window.scrollTo({top: 0});

	DOM.allClusters = document.getElementById("clusters");
	DOM.progressBar = document.getElementById("progress-bar-inner");

	document.getElementById("input-file").addEventListener("cancel", () => {
		reloadPage();
	});
	document.getElementById("input-dir").addEventListener("cancel", () => {
		reloadPage();
	});

	document.getElementById("js-disabled").classList.add("hidden");
	document.getElementById("js-enabled").classList.remove("hidden");
});
