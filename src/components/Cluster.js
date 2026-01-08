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
