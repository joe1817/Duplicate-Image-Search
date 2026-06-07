const ResultsPage = {

	template: `
<div id="results-page" @keydown="keyDownHandler" tabindex="-1"> <!-- tabindex needed to receive keydown events -->
	<div class="header">

		<div class="header-title">
			<h1>Duplicate Image Search</h1>
			<div class="search-buttons">
				<div id="button-pause-search" class="button noselect" v-show="isRunning || isPaused" @click="togglePause">
					{{ isPaused ? "Resume" : "Pause" }}
				</div>
				<div class="button noselect" @click="reloadPage">New Search</div>
			</div>
		</div>

		<div id="header-content">
			<div class="progress">
				<div class="progress-bar" v-show="isRunning || isPaused">
					<div ref="progressBar" id="progress-bar-inner"></div>
				</div>
				<div class="progress-text">{{ progressText }}</div>
			</div>

			<div>
				<span v-show="!textareaOn"><span class="text-button noselect" @click="openList">list files</span></span>
				<span v-show="!textareaOn"><span class="noselect">&nbsp;&nbsp;—&nbsp;&nbsp;</span><span class="noselect">Cluster Span: </span><select name="folder-count" id="folder-count" v-model="clusterSpanState"><option value="any" default>Any</option><option value="single">Single Folder</option><option value="multiple">Multiple Folders</option></select></span>
				<span v-show="!textareaOn"><span class="noselect">&nbsp;&nbsp;—&nbsp;&nbsp;</span><span class="noselect">Auto-Collapse: </span><select name="auto-collapse" id="auto-collapse" v-model="autoCollapseState"><option value="none" default>-</option><option value="any">Any Selected</option><option value="almost-all">All But 1 Selected</option></select></span>
				<span v-show="!textareaOn"><span class="noselect">&nbsp;&nbsp;—&nbsp;&nbsp;</span><span class="text-button noselect" @click="selectObvious">select obvious</span></span>
				<span v-show="!textareaOn"><span class="noselect">&nbsp;&nbsp;—&nbsp;&nbsp;</span><span class="text-button noselect" @click="selectVisible(null)">select all</span></span>
				<span v-show="!textareaOn"><span class="noselect">&nbsp;&nbsp;—&nbsp;&nbsp;</span><span class="text-button noselect" @click="selectNone">select none</span></span>
				<span v-show="!textareaOn"><span class="noselect">&nbsp;&nbsp;—&nbsp;&nbsp;</span><span class="text-button noselect" @click="collapseVisible">collapse all</span></span>
				<span v-show="!textareaOn"><span class="noselect">&nbsp;&nbsp;—&nbsp;&nbsp;</span><span class="text-button noselect" @click="collapseNone">expand all</span></span>


				<span v-show="textareaOn"><span class="text-button noselect" @click="closeList">[×]</span></span>
				<span v-show="textareaOn"><span class="noselect">&nbsp;&nbsp;—&nbsp;&nbsp;</span><span class="text-button noselect" @click="copyListToClipboard">copy list</span></span>
				<span v-show="textareaOn"><span class="noselect">&nbsp;&nbsp;—&nbsp;&nbsp;</span><span class="text-button noselect" @click="downloadList">{{scriptState ? "download script" : "download list"}}</span></span>
				<span v-show="textareaOn"><span class="noselect">&nbsp;&nbsp;—&nbsp;&nbsp;</span><input type="checkbox" id="show-high-option" v-model="showHighState"><label class="noselect" for="show-high-option">Show Highlighted Only</label></span>
				<span v-show="textareaOn"><span class="noselect">&nbsp;&nbsp;—&nbsp;&nbsp;</span><input type="checkbox" id="show-hash-option" v-model="showHashState"><label class="noselect" for="show-hash-option">Show Hashes</label></span>
				<span v-show="textareaOn"><span class="noselect">&nbsp;&nbsp;—&nbsp;&nbsp;</span><input type="checkbox" id="script-option" v-model="scriptState"><label class="noselect" for="script-option">Deletion Script</label></span>
			</div>

			<textarea class="textarea" ref="textarea" v-model="textareaText" v-show="textareaOn" spellcheck="false" readonly></textarea>
		</div>
	</div>

	<div ref="allClusters" id="clusters" class="clusters noselect">
		<Cluster
			v-for="(cluster, index) in $store.state.clusters"
			v-show="clusterIsVisible(cluster)"
			:key="cluster.ID"
			ref="cluster"
			:cluster="cluster"
			:clusterIndex="index"
			:highlightedIndices="highlightedCoords.get(index) || new Set()"
			:collapsed="clusterIsCollapsed(cluster)"
			@ctrlClick="ctrlClickHandler"
			@highlight="highlightHandler"
			@select="selectHandler"
			@toggle="toggleHandler"
			@rightClick="rightClickHandler"
		></Cluster>
	</div>

	<div ref="message" id="message" v-show="messageText">{{ messageText }}</div>

	<ScrollToTop class="button noselect"></ScrollToTop>

	<div
		id="file-context-menu"
		class="context-menu"
		ref="fileContextMenu"
		v-show="rightClickCluster != -1"
		tabindex="-1"
		@focusout="focusoutHandler"
	>
		<ul>
			<li @click="copyFilenameHandler">Copy File Name</li>
			<li @click="selectSameFolderHandler">Select All Files in this Folder</li>
		</ul>
	</div>
</div>
`,

	data() {
		return {
			clusterSpanState  : "any",
			autoCollapseState : "none",
			textareaOn        : false,
			showHighState     : false,
			showHashState     : false,
			scriptState       : false,
			highCount         : 0,
			highSize          : 0,
			messageText       : "",
			highlightedCoords : new Map(),
			collapsedClusters : new Set(), // might be more performant to have a Map: index -> collapsedState (bool)
			rightClickCluster : -1,
			rightClickIndex   : -1,
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
			this.isPaused = !this.isPaused;
		},

		ctrlClickHandler(ifile) {
			this.copyToClipboard(ifile.file.name);
		},

		highlightHandler(direction, clusterID, fileIndex) { // TODO 'direction' not needed
			if (direction) {
				if (!this.highlightedCoords.has(clusterID)) {
					this.highlightedCoords.set(clusterID, new Set());
				}
				this.highlightedCoords.get(clusterID).add(fileIndex);

				this.highCount += 1;
				this.highSize += this.$store.state.clusters[clusterID].ifiles[fileIndex].file.size;
				if (!this.textareaOn && this.highCount == 1) {
					this.showHighState = true;
				}
			} else {
				this.highlightedCoords.get(clusterID).delete(fileIndex);

				this.highCount -= 1;
				this.highSize -= this.$store.state.clusters[clusterID].ifiles[fileIndex].file.size;
				if (!this.textareaOn && !this.highCount) {
					this.showHighState = false;
				}
			}
		},

		selectHandler(cluster) {
			const state = this.autoCollapseState;
			if (state == "none") {
				return;
			}
			let filter = null;
			if (state == "any") {
				filter = cluster => {
					const highCount = this.highlightedCoords.get(cluster.ID)?.size ?? 0;
					const total = this.$store.state.clusters[cluster.ID].ifiles.length;
					return highCount > 0 && highCount < total;
				}
			} else if (state == "almost-all") {
				filter = cluster => {
					const highCount = this.highlightedCoords.get(cluster.ID)?.size ?? 0;
					const total = this.$store.state.clusters[cluster.ID].ifiles.length;
					return highCount == total-1;
				}
			}
			if (filter(cluster)) {
				this.collapsedClusters.add(cluster.ID);
			}
		},

		autoCollapseClusters() {
			const state = this.autoCollapseState;
			if (state == "none") {
				return;
			}
			let filter = null;
			if (state == "any") {
				filter = cluster => {
					const highCount = this.highlightedCoords.get(cluster.ID)?.size ?? 0;
					const total = this.$store.state.clusters[cluster.ID].ifiles.length;
					return highCount > 0 && highCount < total;
				}
			} else if (state == "almost-all") {
				filter = cluster => {
					const highCount = this.highlightedCoords.get(cluster.ID)?.size ?? 0;
					const total = this.$store.state.clusters[cluster.ID].ifiles.length;
					return highCount == total-1;
				}
			}
			for (const cluster of this.visibleClusters) {
				if (filter(cluster)) {
					this.collapsedClusters.add(cluster.ID);
				}
			}
		},

		toggleHandler(clusterID) {
			if (this.collapsedClusters.has(clusterID)) {
				this.collapsedClusters.delete(clusterID);
			} else {
				this.collapsedClusters.add(clusterID);
			}
		},

		rightClickHandler(x, y, clusterID, fileIndex) {
			this.rightClickCluster = clusterID;
			this.rightClickIndex = fileIndex;

			this.$nextTick(() => {
				const fileContextMenu = this.$refs.fileContextMenu;
				const menuWidth = fileContextMenu.offsetWidth;
				const menuHeight = fileContextMenu.offsetHeight;
				const windowWidth = window.innerWidth;
				const windowHeight = window.innerHeight;

				if ((x + menuWidth) > windowWidth) {
					fileContextMenu.style.left = `${windowWidth - menuWidth}px`;
				} else {
					fileContextMenu.style.left = `${x}px`;
				}

				if ((y + menuHeight) > windowHeight) {
					fileContextMenu.style.top = `${windowHeight - menuHeight}px`;
				} else {
					fileContextMenu.style.top = `${y}px`;
				}

				fileContextMenu.focus();
			});
		},

		focusoutHandler(event) {
			const fileContextMenu = this.$refs.fileContextMenu;
			if (!fileContextMenu.contains(event.relatedTarget)) {
				this.rightClickCluster = -1;
				this.rightClickIndex = -1;
			}
			this.rightClickCluster = -1;
			this.rightClickIndex = -1;
		},

		copyFilenameHandler() {
			const ifile = this.$store.state.clusters[this.rightClickCluster].ifiles[this.rightClickIndex];
			this.copyToClipboard(ifile.file.name);
			this.rightClickCluster = -1;
			this.rightClickIndex = -1;
		},

		selectSameFolderHandler() {
			dirname = path => {
				const parts = path.relpath.split("/");
				parts.pop();
				return parts.join("/");
			}
			const ifile = this.$store.state.clusters[this.rightClickCluster].ifiles[this.rightClickIndex];
			const targetDirname = dirname(ifile)
			this.selectVisible(f => {
				return dirname(f) == targetDirname;
			});
			this.rightClickCluster = -1;
			this.rightClickIndex = -1;
		},

		keyDownHandler(event) {
			if (event.key === "Escape") {
				if (this.rightClickCluster != -1) {
					fileContextMenu = this.$refs.fileContextMenu;
					this.rightClickCluster = -1;
					this.rightClickIndex = -1;
				} else {
					this.textareaOn = false;
				}
			}
		},

		openList() {
			this.textareaOn = true;
		},

		closeList() {
			this.textareaOn = false;
		},

		selectObvious() {
			// selects files that match the following criteria:
			// 1. the filename ends with " (\d)", " (copy)", or "_\d"
			// 2. there is another file in the same folder that exists without this suffixes
			// 3. the other file is the same size
			// 4. the hashes match exactly
			const regex = /(\s\(copy(?:\s\d+)?\)|\s\(\d+\)|_\d+)(\.[^.]+)?$/;
			filter = (f, cluster) => {
				const strippedName = f.file.name.replace(regex, "$2");
				if (f.file.name == strippedName) {
					return false;
				}
				for (const f2 of cluster.ifiles) {
					if (f2.file.name == strippedName && f2.file.size == f.file.size && f2.hash.equals(f.hash)) {
						return true;
					}
				}
				return false;
			}
			this.selectVisible(filter);
		},

		selectVisible(filter) {
			for (const cluster of this.visibleClusters) {
				if (!this.highlightedCoords.has(cluster.ID)) {
					this.highlightedCoords.set(cluster.ID, new Set());
				}
				const highlightedFileIndices = this.highlightedCoords.get(cluster.ID);
				for (const [imageIndex, ifile] of cluster.ifiles.entries()) {
					if (!highlightedFileIndices.has(imageIndex)) {
						if (!filter || (filter.length==1 && filter(ifile)) || (filter.length==2 && filter(ifile, cluster))) {
							this.highCount += 1;
							this.highSize += ifile.file.size;
							highlightedFileIndices.add(imageIndex);
						}
					}
				}
			}
			this.autoCollapseClusters();
		},

		selectNone() {
			this.highCount = 0;
			this.highSize = 0;
			this.highlightedCoords.clear();
		},

		collapseVisible() {
			for (const cluster of this.visibleClusters) {
				this.collapsedClusters.add(cluster.ID);
			}
		},

		collapseNone() {
			this.autoCollapseState = "none";
			this.collapsedClusters.clear();
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
		},

		clusterIsVisible(cluster) {
			if (this.clusterSpanState == "any") {
				return true;
			}
			const folderCount = new Set(
				cluster.ifiles
				.map(item => {
					const parts = item.relpath.split("/");
					parts.pop();
					return parts.join("/");
				})
				.filter(folderPath => folderPath !== "")
			).size;
			const clusterSpan = folderCount === 1 ? "single" : "multiple";
			if (clusterSpan == this.clusterSpanState) {
				return true;
			}
			return false;
		},

		clusterIsCollapsed(cluster) {
			return this.collapsedClusters.has(cluster.ID)
		},
	},

	computed: {
		visibleClusters() {
			if (this.clusterSpanState == "any") {
				return this.$store.state.clusters;
			}

			clusterSpan = (cluster) => {
				const folderCount = new Set(
					cluster.ifiles
					.map(item => {
						const parts = item.relpath.split("/");
						parts.pop();
						return parts.join("/");
					})
					.filter(folderPath => folderPath !== "")
				).size;
				return folderCount === 1 ? "single" : "multiple";
			}

			return this.$store.state.clusters.filter(cluster => {
				return clusterSpan(cluster) == this.clusterSpanState;
			});
		},

		isInitializing() {
			return this.$store.getters.isInitializing;
		},

		isRunning() {
			return this.$store.getters.isRunning;
		},

		isPaused: {
			get() {
				return this.$store.getters.isPaused;
			},
			set(val) {
				if (!this.isEnded && !this.isInitializing) {
					this.$store.commit("SET_SEARCH_STATE", val ? "search_paused" : "search_running");
				}
			}
		},

		isEnded() {
			return this.$store.getters.isEnded;
		},

		percentDone() {
			const n = this.$store.state.progress;
			const t = this.$store.state.progressTotal;
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
			const t = this.$store.state.progressTotal;
			const h = this.highCount;
			const s = this.formatBytes(this.highSize);
			if (this.isInitializing) {
				const i = this.$store.state.inputCount;
				return `Initializing: Found ${i} files so far...`;
			}
			else if (this.isEnded) {
				const clusterInfo = `${m}: Found ${c} cluster${c == 1 ? "" : "s"}  in ${t} file${t == 1 ? "" : "s"}.`;
				const selectedInfo = ` Selected ${h} file${h == 1? "" : "s"} (${s}).`;
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
				if (this.$store.state.mustMatch && this.$store.state.progressTotal == 0) {
					return "The chosen folder does not contain any images of supported types. Images must be JPG, PNG, GIF, WEBP, or BMP files less than 40 MB in size.";
				} else if (!this.$store.state.mustMatch && this.$store.state.progressTotal <= 1) {
					return "The chosen folder does not contain two or more images of supported types. Images must be JPG, PNG, GIF, WEBP, or BMP files less than 40 MB in size.";
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
				this.$store.state.clusters.forEach(cluster => {
					if (!this.showHighState || this.highlightedCoords.has(cluster.ID)) {
						let addedSome = false;
						cluster.ifiles.forEach((ifile, fileIndex) => {
							if (!this.showHighState || this.highlightedCoords.get(cluster.ID).has(fileIndex)) {
								addedSome = true;
								let path = ifile.relpath;
								if (onWindows) {
									path = path.replaceAll("/", "\\");
								}
								if (this.scriptState) {
									if (onWindows) {
										path = "del \"" + path.replaceAll("\"", "\\\"") + "\"";
									} else {
										path = "rm \"" + path.replaceAll("\"", "\\\"") + "\"";
									}
								} else if (this.showHashState) {
									const hash = parseInt(ifile.hash.bitstring, 2).toString(16).padStart(16, "0");
									path = hash + " " + path;
								}
								text = text.concat(path, "\n");
							}
						});
						if (addedSome) {
							text = text.concat("\n");
						}
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
		autoCollapseState(newState) {
			if (newState == "none") {
				return;
			}
			this.collapsedClusters.clear();
			this.autoCollapseClusters();
		},

		percentDone(pct) {
			this.$refs.progressBar.style.width = "".concat(pct, "%");
		},

		resultsText(msg) {
			this.messageText = msg;
		},
	}
}
