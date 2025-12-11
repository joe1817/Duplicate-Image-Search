const State = {

	state() {
		return {
			mustMatch: null,
			fastRead : false,
			searchStatus: "search_pending", //search_init, search_running, search_paused, search_ended
			clusters: [],
			total: 0,
			progress: 0,
			error: 0,
		}
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
		async startSearch({ commit, state }, allFiles) {
			commit("SET_TOTAL", allFiles.length);

			allImageFiles = [];
			Array.from(allFiles).forEach(file => {
				let ifile = new ImageFile(file);
				if (ifile.isValid()) {
					allImageFiles.push(ifile);
				}
			});
			allImageFiles.sort((a,b) => {
				return -PathSort.compare(a.relpath, b.relpath); // negative b/c items will be popped from the back
			});

			const mustMatch = (state.mustMatch ? new ImageFile(state.mustMatch) : null);
			if (mustMatch) {
				mustMatch.clusterID = 0;
				await mustMatch.load();
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

				ifile.load()
					.then(() => {
						for (const ifile2 of scannedFiles) {
							if (ifile.similar(ifile2)) {
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
						console.log("ERROR loading: " + ifile.path);
						commit("INC_ERROR");
					})
					.finally(() => {
						commit("INC_PROGRESS");
						processNext(files, scannedFiles);
					});
			}

			processNext(allImageFiles);
		}
	}
}
