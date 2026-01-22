function simplePathDiff(path1, path2) {
    const getParts = (p) => {
        const lastSlash = p.lastIndexOf("/");
        if (lastSlash === -1) return { dirs: [], file: p };
        return {
            dirs: p.substring(0, lastSlash).split("/"),
            file: p.substring(lastSlash + 1)
        };
    };

    const p1 = getParts(path1);
    const p2 = getParts(path2);

    // Find the first index where the directory tokens differ
    let firstDiffIdx = -1;
    const maxDirLen = Math.max(p1.dirs.length, p2.dirs.length);

    for (let i = 0; i < maxDirLen; i++) {
        if (p1.dirs[i] !== p2.dirs[i]) {
            firstDiffIdx = i;
            break;
        }
    }

    // Wrap directory components from the first difference to the end
    const getDirHTML = (dirs, startIdx) => {
        if (startIdx === -1) return dirs.join("/");

        const stable = dirs.slice(0, startIdx).join("/");
        const different = dirs.slice(startIdx).join("/");

        if (startIdx === 0) {
            return `<u>${different}</u>`;
        }

        return different ? `${stable}/<u>${different}</u>` : stable;
    };

    // Filename logic (Character diff)
    const getFileHTML = (f1, f2) => {
        return f1.split("").map((char, i) => {
            return char !== f2[i] ? `<u>${char}</u>` : char;
        }).join("");
    };

    const buildPath = (dirHTML, fileHTML, originalPath) => {
		console.log("dirHTML " + dirHTML);
		console.log("fileHTML " + fileHTML);
        if (!originalPath.includes("/")) return fileHTML;
        return `${dirHTML}/${fileHTML}`;
    };

    return {
        path1: buildPath(getDirHTML(p1.dirs, firstDiffIdx), getFileHTML(p1.file, p2.file), path1),
        path2: buildPath(getDirHTML(p2.dirs, firstDiffIdx), getFileHTML(p2.file, p1.file), path2)
    };
}

const Cluster = {
	props: ["cluster", "clusterIndex"],

	template: `
<div class="cluster" @mouseup="reset" @mouseleave="reset">
	<div ref="num" class="cluster-num" @click="toggleCluster">
		{{ clusterIndex + 1 }}
	</div>
	<div ref="clusterContent" class="cluster-content" @mouseup="mouseUpHandler">
		<div class="cluster-imgs">
			<Thumbnail
				v-for="(ifile, fileIndex) in cluster"
				:key="ifile.relpath"
				:ifile="ifile"
				ref="imgs"
				class="div-img"
				@mouseenter="mouseenterHandler($event, clusterIndex, fileIndex)"
				@mouseleave ="mouseleaveHandler($event, clusterIndex, fileIndex)"
				@mousedown="mousedownHandler($event, clusterIndex, fileIndex)"
			></Thumbnail>
		</div>

		<div class="cluster-info">
			<div
				v-for="(ifile, fileIndex) in cluster"
				:key="ifile.relpath"
				ref="info"
				class="img-info"
				@mouseenter="mouseenterHandler($event, clusterIndex, fileIndex)"
				@mouseleave ="mouseleaveHandler($event, clusterIndex, fileIndex)"
				@mousedown="mousedownHandler($event, clusterIndex, fileIndex)"
			>
				<span ref="size" :class="['img-info-part', 'size', {'best-part': (parseInt(ifile.file.size/1024) == bestSize) }]">{{ parseInt(ifile.file.size/1024) }}</span>
				<span ref="date" :class="['img-info-part', 'date', {'best-part': (formatDate(new Date(ifile.file.lastModified)) == bestDate) }]">{{ formatDate(new Date(ifile.file.lastModified)) }}</span>
				<span ref="path" :class="['img-info-part', 'path', {'best-part': ifile.relpath.endsWith('.png')}]">{{ ifile.relpath }}</span>
			</div>
		</div>
	</div>
</div>
	`,

	data() {
		return {
			highlightedCount : 0,
			direction        : null,
		}
	},

	mounted() {
		if (this.$refs.info.length === 2) {
			const path_span1 = this.$refs.info[0].children[2];
			const path_span2 = this.$refs.info[1].children[2];
			const results = simplePathDiff(path_span1.textContent, path_span2.textContent);
			path_span1.innerHTML = results.path1;
			path_span2.innerHTML = results.path2;
		}
	},

	methods: {
		formatDate(d) {
			return d.getFullYear() + "." + (d.getMonth()+1).toString().padStart(2, "0") + "." + d.getDate().toString().padStart(2, "0");
		},

		reset() {
			/*
			if (this.direction && this.highlightedCount && ResultsPageNonReactiveSettings.autoHideState) {
				this.toggleCluster();
			}
			*/
			this.direction = null;
		},

		mouseenterHandler(event, clusterIndex, fileIndex) {
			this.$refs.info[fileIndex].classList.add("hovered");
			this.$refs.imgs[fileIndex].$el.classList.add("hovered");
			const isMouseDown = event.buttons == 1;
			if (isMouseDown) {
				if (this.direction === null) {
					this.direction = !this.isHighlighted(fileIndex);
					this.toggleHighlight(clusterIndex, fileIndex);
				} else if (this.direction === !this.isHighlighted(fileIndex)) {
					this.toggleHighlight(clusterIndex, fileIndex);
				}
			}
		},

		mouseleaveHandler(event, clusterIndex, fileIndex) {
			this.$refs.info[fileIndex].classList.remove("hovered");
			this.$refs.imgs[fileIndex].$el.classList.remove("hovered");
		},

		mousedownHandler(event, clusterIndex, fileIndex) {
			if (event.ctrlKey) {
				event.stopPropagation();
				this.$emit("select", this.cluster[fileIndex]);
			} else {
				if (this.direction === null) {
					this.direction = !this.isHighlighted(fileIndex);
					this.toggleHighlight(clusterIndex, fileIndex);
				}
			}
		},

		mouseUpHandler() {
			if (this.direction && this.highlightedCount && ResultsPageNonReactiveSettings.autoHideState) {
				this.toggleCluster();
			}
		},

		isHighlighted(fileIndex) {
			return this.$refs.info[fileIndex].classList.contains("highlighted");
		},

		toggleHighlight(clusterIndex, fileIndex) {
			this.$refs.info[fileIndex].classList.toggle("highlighted");
			this.$refs.imgs[fileIndex].$el.classList.toggle("highlighted");
			if (this.isHighlighted(fileIndex)) {
				this.highlightedCount++;
				this.$refs.num.classList.add("some-selected");
				if (this.highlightedCount == this.$refs.imgs.length) {
					this.$refs.num.classList.add("all-selected");
				}
				this.$emit("highlight", true, `${clusterIndex},${fileIndex}`);
			} else {
				this.highlightedCount--;
				this.$refs.num.classList.remove("all-selected");
				if (this.highlightedCount == 0) {
					this.$refs.num.classList.remove("some-selected");
				}
				this.$emit("highlight", false, `${clusterIndex},${fileIndex}`);
			}
		},

		toggleCluster() {
			this.$refs.clusterContent.classList.toggle("hidden");
		}
	},

	computed: {
		bestSize() {
			let bestVal = null, val = null;
			this.cluster.forEach((ifile) => {
				const val = parseInt(ifile.file.size/1024);
				if (bestVal === null || val > bestVal) {
					bestVal = val;
				}
			});
			return bestVal;
		},

		bestDate() {
			let bestVal = null, val = null;
			this.cluster.forEach((ifile) => {
				const val = this.formatDate(new Date(ifile.file.lastModified));
				if (bestVal === null || val > bestVal) {
					bestVal = val;
				}
			});
			return bestVal;
		}
	}
}
