const SetupPage = {

	template: `
<div id="options-page" @drop="dropHandler($event)" @dragover="dragOverHandler($event)">
	<h1>Duplicate Image Search</h1>
	<h2>Search a folder for groups of similar-looking images.</h2>

	<div class="options">
		<div id="options-start" ref="optionsStart" class="option-content">
			<div class="button-wrapper">
				<input type="file" ref="inputFile" class="hidden" accept="image/*" @change="setMustMatchFile($event)" @cancel="reloadPage">
				<input type="file" ref="inputDir"  class="hidden" accept="image/*" webkitdirectory multiple @change="onDirChange($event)" @cancel="reloadPage">

				<div>
					<span id="optional" class="tooltip left noselect" data-tip="This specifies a file to match against, meaning the search will only find images that are similar to this one. Ignore this option to find all groups of similar images in the selected folder.">Optional: </span>
					<div id="button-file" class="button wide tall noselect" @click="onFilePickerClick">Select File</div>
					<span id="selected-file" v-show="$store.state.mustMatch"><span class="x" @click="removeMustMatchFile">×</span><span ref="filePath"></span></span>
				</div>

				<div><div id="button-dir" class="button wide tall noselect" @click="onDirPickerClick">Select Folder</div></div>
			</div>

			<div class="checkboxes">
				<div>
					<input type="checkbox" id="fastOption" ref="fastOption" v-model="fastReadState" autocomplete="off">
					<label class="tooltip right noselect" for="fastOption" data-tip="This may be faster when scanning a bunch of JPEG photos, especially if they were taken from a professional camera. However, there is a slightly higher chance to mismatch images.">Read JPEG Thumbnails</label>
				</div>

				<div>
					<input type="checkbox" id="exactOption" ref="exactOption" v-model="exactState" autocomplete="off">
					<label class="tooltip right noselect" for="exactOption" data-tip="Search only for images that are exactly the same. This is much faster than a perceptual match, but it will fail to match files that differ by just one pixel or have different metadata.">Exact Match</label>
				</div>
			</div>
		</div>

		<div id="options-cancel" ref="optionsCancel" class="option-content hidden">
			<div id="button-cancel" class="button hollow wide tall noselect" @click="reloadPage">Cancel Search</div><span id="spinner"><div class="spinner-dual-ring"></div></span>
		</div>
	</div>

	<div class="footer">
		<p>1. The search is performed locally. None of your files are sent over the Internet.</p>
		<p>2. It may take a few seconds for the search to start, depending on how many files are in the selected folder.</p>
		<div class="social-links"><div class="img-rescale"><a href="https://github.com/joe1817/Duplicate-Image-Search"><img src="images/github-mark-white.png" /></a></div></div>
	</div>
</div>
`,

	mounted() {
		this.$nextTick(()=>{
			window.scrollTo({top: 0});
		});
		// If not loading from localStorage, the store state and checkbox state can de-sync
		// due to the BFcache (browser autocompletion), which can change the checkbox state
		// without raising a change event needed for v-model to work as expected.
		/*
		// give some time for browser autocompletion to finish
		setTimeout(()=>{
			// force Vue variables to match the browser's visual state
			this.fastReadState = this.$refs.fastOption.checked;
			this.exactState = this.$refs.exactOption.checked;
			console.log("fastReadState = " + this.fastReadState);
			console.log("exactState    = " + this.exactState);
		}, 100);
		*/
	},

	methods: {
		reloadPage() {
			location.reload()
		},

		updateUISearchInit() {
			// start after the file picker is displayed
			setTimeout(() => {
				this.$refs.optionsCancel.classList.remove("hidden");
				this.$refs.optionsStart.classList.add("hidden");
			}, 500);
		},

		setMustMatchFile(event) {
			const file = event.target.files[0];
			this.$store.commit("SET_MUST_MATCH_FILE", file);
			let name = file.name;
			if (name.length > 53)
				name = name.substring(0, 25) + "..." + name.substring(name.length-25, name.length);
			this.$refs.filePath.textContent = name;
		},

		removeMustMatchFile() {
			this.$store.commit("SET_MUST_MATCH_FILE", null);
		},

		dragOverHandler(event) {
			event.preventDefault();
		},

		async dropHandler(event) {
			const provider = new UnifiedFileProvider();
			event.preventDefault();
			this.updateUISearchInit();
			const files = await Array.fromAsync(provider.getFilesFromDrop(event));
			this.$store.dispatch("startSearch", files);
		},

		async onDirPickerClick() {
			const provider = new UnifiedFileProvider();
			this.updateUISearchInit();

			// Try a modern file picker first if it's available
			const files = await Array.fromAsync(provider.getFilesFromPicker());

			if (files.length) {
				this.$store.dispatch("startSearch", files);
			} else {
				// fall back to <input>
				this.$refs.inputDir.click();
			}
		},

		onFilePickerClick() {
			this.$refs.inputFile.click();
		},

		onDirChange(event) {
			try {
				this.$store.dispatch("startSearch", event.target.files);
			} finally {
				event.target.value = "";
			}
		},
	},

	computed: {
		fastReadState: {
			get() {
				return this.$store.state.fastRead;
			},
			set(newVal) {
				this.$store.commit("SET_FAST_READ_STATE", newVal);
			}
		},

		exactState: {
			get() {
				return this.$store.state.exactMatch;
			},
			set(newVal) {
				this.$store.commit("SET_EXACT_STATE", newVal);
			}
		},
	}
}
