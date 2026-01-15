const Thumbnail = {
	props: ["ifile"],

	template: `
<div>
	<canvas ref="thumb" class="cluster-img hidden" :title="ifile.relpath" draggable="false"></canvas>
	<div ref="dims" class="image-dims">{{ ifile.width }}×{{ ifile.height }}</div>
</div>
	`,

	mounted() {
		//console.log("generating thumbnail");
		const thumb = this.$refs.thumb;
		const dims = this.$refs.dims;

		thumb.ondragstart = function(event) { return false; };

		this.ifile.createThumbnail(thumb).then(() => {
			thumb.classList.remove("hidden");
		});
	}
}
