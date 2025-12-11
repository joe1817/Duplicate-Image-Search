const SetupPage = {

	template: `
<div id="options-page" @drop="dropHandler($event)" @dragover="dragOverHandler($event)">
	<h1>Duplicate Image Search</h1>
	<h2>Search a folder for groups of similar-looking images.</h2>

	<div class="options">
		<div id="options-start" ref="optionsStart" class="option-content">
			<input type="file" ref="inputFile" class="hidden" accept="image/*" @change="setMustMatchFile($event)" @cancel="reloadPage">
			<input type="file" ref="inputDir"  class="hidden" accept="image/*" webkitdirectory multiple @change="onDirChangeHandler" @cancel="reloadPage">
			<div class="button-wrapper">
				<div>
					<span id="optional" class="tooltip left" data-tip="This specifies a file to match against. The search will only find images that are similar to this one. Ignore this to find all groups of similar images in the folder.">Optional: </span>
					<div id="button-file" class="button tall noselect" @click="filePicker($event)">Select File</div>
					<span id="selected-file" v-show="$store.state.mustMatch"><span class="x" @click="removeMustMatchFile">×</span><span ref="filePath"></span></span>
				</div>
				<div><div id="button-dir" class="button tall noselect" @click="dirPicker($event)">Select Folder</div></div>
			</div>

			<div class="fast-option noselect" @click="clickFastReadCheckbox($event)">
				<input type="checkbox" ref="fastOption" v-model="fastReadState">
				<span class="tooltip right" data-tip="This may be faster when scanning a bunch of JPEG photos, especially if they were taken from a professional camera. However, there is a slightly higher chance to mismatch images.">Read JPEG Thumbnails</span>
			</div>
		</div>

		<div id="options-cancel" ref="optionsCancel" class="option-content hidden">
			<div id="button-cancel" class="button hollow tall noselect" @click="reloadPage">Cancel Search</div><span id="spinner"><div class="spinner-dual-ring"></div></span>
		</div>
	</div>

	<div class="footer">
		<p>1. The search is performed locally. None of your files are sent over the Internet.</p>
		<p>2. It may take a few seconds for the search to start, depending on how many files are in the selected folder.</p>
		<div class="social-links"><div class="img-rescale"><a href="https://github.com/joe1817/Duplicate-Image-Search"><img src="images/github-mark-white.png" /></a></div></div>
	</div>
</div>
`,

	loaded() {
		window.scrollTo({top: 0});
	},

	methods: {
		reloadPage() {
			location.reload()
		},

		clickFastReadCheckbox(event) {
			if (event.target.tagName != "INPUT") {
				this.$refs.fastOption.click();
			}
		},

		filePicker(event) {
			this.$refs.inputFile.click();
		},

		dirPicker(event) {
			this.updateUISearchInit();
			this.$refs.inputDir.click();
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

		onDirChangeHandler(event) {
			try {
				this.$store.dispatch("startSearch", event.target.files);
			} finally {
				event.target.value = "";
			}
		},

		dragOverHandler(event) {
			event.preventDefault();
		},

		dropHandler(event) {
			event.preventDefault();

			this.updateUISearchInit();

			const items = event.dataTransfer.items;
			const files = [];

			let count = items.length;

			const onFile = (file) => {
				files.push(file);
				if (!--count) this.$store.dispatch("startSearch", files);
			}
			const onEntries = (entries) => {
				count += entries.length;
				for (const entry of entries) {
					scanFiles(entry);
				}
				if (!--count) this.$store.dispatch("startSearch", files);
			};
			const onErr = (err) => {
				console.log(err);
				if (!--count) this.$store.dispatch("startSearch", files);
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
					if (!--count) this.$store.dispatch("startSearch", files);
				}
			}
		}
	},

	computed: {
		fastReadState: {
			get() {
				return this.$store.state.fastRead;
			},
			set(newVal) {
				this.$store.commit("SET_FAST_READ_STATE", newVal);
			}
		}
	}
}
