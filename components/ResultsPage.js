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
				<span id="show-all-button"  v-show="!textareaOn"><span class="text-button noselect" @click="showAllList">list all</span></span>
				<span id="show-high-button" v-show="!textareaOn">&nbsp;—&nbsp;&nbsp;<span class="text-button noselect" @click="showHighlightedList">list highlighted</span></span>
				<span id="hide-checkbox"    v-show="!textareaOn">&nbsp;—&nbsp;&nbsp;<input type="checkbox" id="hide-option" v-model="autoHideState"><label for="hide-option">Auto Hide Selected Clusters</label></span>
				<span id="close-button"     v-show="textareaOn"><span class="text-button noselect" @click="closeList">[×]</span></span>
				<span id="copy-button"      v-show="textareaOn">&nbsp;—&nbsp;&nbsp;<span class="text-button noselect" @click="copyListToClipboard">copy list</span></span>
				<span id="save-button"      v-show="textareaOn">&nbsp;—&nbsp;&nbsp;<span class="text-button noselect" @click="downloadList">download list</span></span>
			</div>
			<textarea ref="textarea" v-show="textareaOn" class="textarea" spellcheck="false"></textarea>
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
		></Cluster>
	</div>

	<div ref="message" id="message" v-show="messageText">{{ messageText }}</div>

	<ScrollToTop class="button noselect"></ScrollToTop>
</div>
`,

	data() {
		return {
			textareaOn  : false,
			messageText : "",
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

		togglePause() {
			this.pausedState = !this.pausedState;
		},

		selectHandler(ifile) {
			this.copyToClipboard(ifile.relpath);
		},

		keyDownHandler(event) {
			if (event.key === "Escape") {
				this.textareaOn = false;
			}
		},

		showAllList() {
			const onWindows = navigator.userAgent.toLowerCase().includes("win");
			let text = "";
			for (let cluster of this.$store.state.clusters) {
				for (let ifile of cluster) {
					let path = ifile.file.webkitRelativePath || ifile.file.name;
					if (onWindows) {
						path = path.replaceAll("/", "\\");
					}
					text = text.concat(path, "\n");
				}
				text = text.concat("\n");
			}
			text = text.trimEnd();
			this.$refs.textarea.value = text;
			this.textareaOn = true;
		},

		showHighlightedList() {
			const onWindows = navigator.userAgent.toLowerCase().includes("win");
			let text = "";
			for (let cluster of this.$refs.cluster) {
				let paths = cluster.$el.querySelectorAll(".highlighted.img-info > .path");
				if (paths.length) {
					for (let path of paths) {
						path = path.textContent;
						if (onWindows) {
							path = path.replaceAll("/", "\\");
						}
						text = text.concat(path, "\n");
					}
					text = text.concat("\n");
				}
			}
			text = text.trimEnd();
			this.$refs.textarea.value = text;
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
			const data = this.$refs.textarea.value;
			const filename = `selected-duplicates-${this.formatDate(new Date())}.txt`;
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
			const c = this.$store.state.clusters.length;
			const n = this.$store.state.progress;
			const t = this.$store.state.total;
			if (this.endedState) {
				return "Found ".concat(c, " cluster", (c == 1 ? "" : "s"), " in ", t, " file", (t == 1 ? "" : "s"), ".");
			} else {
				return "Please wait... Reading file ".concat(n, " of ", t, ". Found ", c, " cluster", (c == 1 ? "" : "s"), " so far.");
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
