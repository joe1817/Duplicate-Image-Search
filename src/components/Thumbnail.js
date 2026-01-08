const Thumbnail = {
	props: ["ifile"],

	template: `
<div>
	<img ref="thumb" class="cluster-img hidden" :title="ifile.relpath" draggable="false">
	<div ref="dims" class="image-dims"></div>
</div>
	`,

	mounted() {
		//console.log("generating thumbnail");
		const thumb = this.$refs.thumb;
		const dims = this.$refs.dims;

		thumb.ondragstart = function(event) { return false; };

		this.ifile.createThumbnail().then(() => {
			dims.textContent = "".concat(this.ifile.width, "×", this.ifile.height);
			thumb.classList.add("hidden");
			thumb.src = this.ifile.thumbdata;
			thumb.onload = () => {
				thumb.width = thumb.width / Config.thumbnailOversample;
				thumb.height = thumb.height / Config.thumbnailOversample;
				thumb.classList.remove("hidden");
				this.ifile.thumbdata = null;
			}
		});
	}
}
