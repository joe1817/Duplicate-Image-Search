const State = {

	plugins: [persistence],

	state: {
		mustMatch    : null,
		fastRead     : false,
		exactMatch   : false,
		searchStatus : "search_pending", //search_init, search_running, search_paused, search_ended
		clusters     : [],
		total        : 0,
		progress     : 0,
		error        : 0,
	},

	getters: {
		isPaused(state) {
			return state.searchStatus == "search_paused";
		},

		isEnded(state) {
			return state.searchStatus == "search_ended";
		},
	},

	mutations: {
		SET_SEARCH_STATE(state, payload) {
			state.searchStatus = payload;
		},

		SET_MUST_MATCH_FILE(state, payload) {
			state.mustMatch = payload;
		},

		SET_FAST_READ_STATE(state, payload) {
			state.fastRead = payload;
		},

		SET_EXACT_STATE(state, payload) {
			state.exactMatch = payload;
		},

		SET_TOTAL(state, payload) {
			state.total = payload;
		},

		INC_PROGRESS(state) {
			state.progress += 1;
		},

		INC_ERROR(state) {
			state.progress += 1;
		},
	},

	actions: {
		// typeof files = FileList or Array[File]
		async startSearch({ commit, state }, inputFiles) {
			console.log("Input files: " + inputFiles.length);

			const validFiles = [];
			Array.from(inputFiles).forEach(file => {
				let ifile = new ImageFile(file);
				if (ifile.isValid()) {
					validFiles.push(ifile);
				}
			});
			validFiles.sort((a,b) => {
				return -PathSort.compare(a.relpath, b.relpath); // negative b/c items will be popped from the back
			});

			console.log("Valid files: " + validFiles.length);

			commit("SET_TOTAL", validFiles.length);

			let candidates = [];
			if (state.exactMatch && state.mustMatch !== null) {
				Array.from(validFiles).forEach(ifile => {
					if (ifile.file.size == state.mustMatch.size) {
						candidates.push(ifile);
					}
				});
			} else if (state.exactMatch) {
				// only examine images with non-unique file sizes
				const uniqueSizes = new Set();
				Array.from(validFiles).forEach(ifile => {
					if (uniqueSizes.has(ifile.file.size)) {
						uniqueSizes.delete(ifile.file.size);
					} else {
						uniqueSizes.add(ifile.file.size);
					}
				});
				Array.from(validFiles).forEach(ifile => {
					if (!uniqueSizes.has(ifile.file.size)) {
						candidates.push(ifile);
					}
				});
			} else {
				candidates = validFiles;
			}

			console.log("Candidate files: " + candidates.length);

			const mustMatch = (state.mustMatch ? new ImageFile(state.mustMatch) : null);
			if (mustMatch) {
				mustMatch.clusterID = 0;
				await mustMatch.load(state.fastRead, state.exactMatch);
			}

			commit("SET_SEARCH_STATE", "search_running");

			const scannedFiles = [];
			function processNext(files) {
				if (!files.length) {
					commit("SET_SEARCH_STATE", "search_ended");
					return;
				}
				if (state.searchStatus == "search_paused") {
					setTimeout(processNext, 1000, files);
					return;
				}
				if (mustMatch) {
					scannedFiles.push(mustMatch);
				}

				let ifile = files.pop();

				ifile.load(state.fastRead, state.exactMatch)
					.then(() => {
						for (const ifile2 of scannedFiles) {
							if (ifile.similar(ifile2, state.exactMatch)) {
								const i = ifile.clusterID;
								const j = ifile2.clusterID;

								if (mustMatch && state.clusters.length == 0) {
									state.clusters.push([ifile]); // TODO commit
									ifile.clusterID = 0;
								} else if (i === null && j === null) {
									ifile.clusterID = state.clusters.length;
									ifile2.clusterID = state.clusters.length;
									state.clusters.push([ifile, ifile2]); // TODO commit
								} else {
									state.clusters[j].push(ifile); // TODO commit
									ifile.clusterID = j;
								}
								break;
							}
						}
						if (!mustMatch) {
							scannedFiles.push(ifile);
						}
					})
					.catch((err) => {
						console.log("ERROR loading: " + ifile.relpath);
						console.log(err);
						commit("INC_ERROR");
					})
					.finally(() => {
						commit("INC_PROGRESS");
						processNext(files, scannedFiles);
					});
			}

			processNext(candidates);
		}
	}
}
