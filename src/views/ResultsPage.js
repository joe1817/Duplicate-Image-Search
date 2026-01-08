const ResultsPageNonReactiveSettings = {
	autoHideState : false,
}

const ResultsPage = {

	template: `
<div id="results-page" @keydown="keyDownHandler" tabindex="-1"> <!-- tabindex needed to receive keydown events -->
	<div class="header">

		<div class="header-title">
			<h1>Duplicate Image Search</h1>
			<div class="search-buttons">
				<div id="button-pause-search" :class="['button', 'noselect', {hidden: endedState}]" @click="togglePause">
					{{ ($store.state.searchStatus == 'search_paused') ? 'Resume' : 'Pause' }}
				</div>
				<div class="button noselect" @click="reloadPage">New Search</div>
			</div>
		</div>

		<div class="progress">
			<div :class="['progress-bar', {hidden: endedState}]">
				<div ref="progressBar" id="progress-bar-inner"></div>
			</div>
			<div class="progress-text">{{ progressText }}</div>
		</div>

		<div class="file-lists">
			<div>
				<span v-show="!textareaOn"><span class="text-button noselect" @click="openList">list files</span></span>
				<span v-show="!textareaOn"><span class="noselect">&nbsp;&nbsp;—&nbsp;&nbsp;</span><input type="checkbox" id="hide-option" v-model="autoHideState"><label class="noselect" for="hide-option">Auto Hide Selected Clusters</label></span>
				<span v-show="textareaOn"><span class="text-button noselect" @click="closeList">[×]</span></span>
				<span v-show="textareaOn"><span class="noselect">&nbsp;&nbsp;—&nbsp;&nbsp;</span><span class="text-button noselect" @click="copyListToClipboard">copy list</span></span>
				<span v-show="textareaOn"><span class="noselect">&nbsp;&nbsp;—&nbsp;&nbsp;</span><span class="text-button noselect" @click="downloadList">download list</span></span>
				<span v-show="textareaOn"><span class="noselect">&nbsp;&nbsp;—&nbsp;&nbsp;</span><input type="checkbox" id="show-high-option" v-model="showHighState"><label class="noselect" for="show-high-option">Show Highlighted Only</label></span>
				<span v-show="textareaOn"><span class="noselect">&nbsp;&nbsp;—&nbsp;&nbsp;</span><input type="checkbox" id="script-option" v-model="scriptState"><label class="noselect" for="script-option">Deletion Script</label></span>
			</div>
			<textarea class="textarea" ref="textarea" v-model="textareaText" v-show="textareaOn" spellcheck="false" readonly></textarea>
		</div>
	</div>

	<div ref="allClusters" id="clusters" class="clusters noselect">
		<Cluster
			v-for="(cluster, index) in $store.state.clusters"
			:key="cluster[0].relpath"
			ref="cluster"
			:cluster="cluster"
			:clusterIndex="index"
			@select="selectHandler"
			@highlight="highlightHandler"
		></Cluster>
	</div>

	<div ref="message" id="message" v-show="messageText">{{ messageText }}</div>

	<ScrollToTop class="button noselect"></ScrollToTop>
</div>
`,

	data() {
		return {
			textareaOn    : false,
			showHighState : false,
			scriptState   : false,
			highSize      : 0,
			messageText   : "",
			highlightedCoords : new Set(),
		}
	},

	methods: {
		reloadPage() {
			location.reload()
		},

		copyToClipboard(text) {
			navigator.clipboard.writeText(text);
			this.messageText = "Copied to clipboard!";
			setTimeout(() => {
				this.messageText = "";
			}, 1000);
		},

		formatDate(d) {
			return d.getFullYear() + "." + (d.getMonth()+1).toString().padStart(2, "0") + "." + d.getDate().toString().padStart(2, "0");
		},

		formatBytes(bytes, decimals = 2) {
			if (bytes === 0) return "0 Bytes";

			const k = 1024;
			const dm = decimals < 0 ? 0 : decimals;
			const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB"];

			const i = Math.floor(Math.log(bytes) / Math.log(k));
			return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
		},

		togglePause() {
			this.pausedState = !this.pausedState;
		},

		selectHandler(ifile) {
			this.copyToClipboard(ifile.relpath);
		},

		highlightHandler(highlightOn, coords) {
			if (highlightOn) {
				this.highlightedCoords.add(coords);
				const [clusterIndex, fileIndex] = coords.split(",").map(Number);
				this.highSize += this.$store.state.clusters[clusterIndex][fileIndex].file.size;
				if (!this.textareaOn && this.highlightedCoords.size == 1) {
					this.showHighState = true;
				}
			} else {
				this.highlightedCoords.delete(coords);
				const [clusterIndex, fileIndex] = coords.split(",").map(Number);
				this.highSize -= this.$store.state.clusters[clusterIndex][fileIndex].file.size;
				if (!this.textareaOn && !this.highlightedCoords.size) {
					this.showHighState = false;
				}
			}
		},

		keyDownHandler(event) {
			if (event.key === "Escape") {
				this.textareaOn = false;
			}
		},

		openList() {
			this.textareaOn = true;
		},

		closeList() {
			this.textareaOn = false;
		},

		copyListToClipboard() {
			const data = this.$refs.textarea.value;
			this.copyToClipboard(data);
		},

		downloadList() {
			const onWindows = navigator.userAgent.toLowerCase().includes("win");
			const data = this.$refs.textarea.value;
			const ext = this.scriptState ? (onWindows ? "bat" : "sh") : "txt";
			const filename = `selected-duplicates-${this.formatDate(new Date())}.${ext}`;
			const type = "text/plain";
			const file = new Blob([data], {type: type});
			if (window.navigator.msSaveOrOpenBlob) { // IE10+
				window.navigator.msSaveOrOpenBlob(file, filename);
			} else { // Others
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
	},

	computed: {
		pausedState: {
			get() {
				return this.$store.getters.isPaused;
			},
			set(val) {
				if (!this.endedState) {
					this.$store.commit("SET_SEARCH_STATE", val ? "search_paused" : "search_running");
				}
			}
		},

		autoHideState: {
			get() {
				return ResultsPageNonReactiveSettings.autoHideState;
			},
			set(val) {
				ResultsPageNonReactiveSettings.autoHideState = val;
			}
		},

		endedState() {
			return this.$store.getters.isEnded;
		},

		percentDone() {
			const n = this.$store.state.progress;
			const t = this.$store.state.total;
			let pct = Math.floor(100 * n / t);
			if (pct < 5) {
				pct = 5;
			}
			return pct;
		},

		progressText() {
			const m = this.$store.state.exactMatch ? "Exact Search" : "Perceptual Search";
			const c = this.$store.state.clusters.length;
			const n = this.$store.state.progress;
			const t = this.$store.state.total;
			const h = this.highlightedCoords.size;
			const s = this.formatBytes(this.highSize);
			if (this.endedState) {
				const clusterInfo = `${m}: Found ${c} cluster${c == 1 ? "" : "s"}  in ${t} file${t == 1 ? "" : "s"}.`;
				const selectedInfo = ` Highlighted ${h} file${h == 1? "" : "s"} (${s}).`;
				return h ? clusterInfo + selectedInfo : clusterInfo;
			} else {
				return `${m}: Reading file ${n} of ${t}. Found ${c} cluster${c == 1 ? "" : "s"} so far.`;
			}
		},

		resultsText() {
			if (this.$store.state.searchStatus != "search_ended") {
				return null;
			}
			if (this.$store.state.clusters.length == 0) {
				if (this.$store.state.mustMatch && this.$store.state.total == 0) {
					return "The selected folder does not contain any images of supported types. Images must be JPG, PNG, GIF, WEBP, or BMP files less than 40 MB in size.";
				} else if (!this.$store.state.mustMatch && this.$store.state.total <= 1) {
					return "The selected folder does not contain at least 2 images of supported types. Images must be JPG, PNG, GIF, WEBP, or BMP files less than 40 MB in size.";
				} else {
					return "No duplicates found.";
				}
			} else {
				return "";
			}
		},

		textareaText: {
			get() {
				const onWindows = navigator.userAgent.toLowerCase().includes("win");
				let text = "";
				if (this.scriptState) {
					text = text.concat(onWindows ? "" : "#!/bin/bash\n\n");
				}
				this.$store.state.clusters.forEach((cluster, clusterIndex) => {
					let addedSome = false;
					cluster.forEach((ifile, fileIndex) => {
						if (!this.showHighState || this.highlightedCoords.has(`${clusterIndex},${fileIndex}`)) {
							addedSome = true;
							let path = ifile.file.webkitRelativePath || ifile.file.name;
							if (onWindows) {
								path = path.replaceAll("/", "\\");
							}
							if (this.scriptState) {
								if (onWindows) {
									path = "del \"" + path.replaceAll("\"", "\\\"") + "\"";
								} else {
									path = "rm \"" + path.replaceAll("\"", "\\\"") + "\"";
								}
							}
							text = text.concat(path, "\n");
						}
					});
					if (addedSome) {
						text = text.concat("\n");
					}
				});
				if (this.scriptState) {
					if (onWindows) {
						text = text.concat("pause");
					}
				}
				return text.trimEnd();
			},
			set(val) {
				// readonly
				return;
			}
		},
	},

	watch: {
		percentDone(pct) {
			this.$refs.progressBar.style.width = "".concat(pct, "%");
		},

		resultsText(msg) {
			this.messageText = msg;
		},
	}
}
