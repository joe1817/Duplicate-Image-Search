const State = {

	pauseHandler: new Signal(),

	plugins: [persistence],

	state: {
		mustMatch     : null,
		fastRead      : false,
		exactMatch    : false,
		searchStatus  : "search_ready", //search_init, search_running, search_paused, search_ended
		clusters      : [],
		progressTotal : 0,
		progress      : 0,
		error         : 0,
	},

	getters: {
		isInitializing(state) {
			return state.searchStatus == "search_init";
		},

		isRunning(state) {
			return state.searchStatus == "search_running";
		},

		isPaused(state) {
			return state.searchStatus == "search_paused";
		},

		isEnded(state) {
			return state.searchStatus == "search_ended";
		},
	},

	mutations: {
		RESET(state) {
			// clear previous results
			state.clusters      = [];
			state.inputCount    = 0;
			state.progressTotal = 0;
			state.progress      = 0;
			state.error         = 0;
		},

		SET_SEARCH_STATE(state, payload) {
			state.searchStatus = payload;
			if (payload === "search_paused") {
				State.pauseHandler.pause();
			} else {
				State.pauseHandler.unpause();
			}
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

		SET_INPUT_COUNT(state, payload) {
			state.inputCount = payload;
		},

		SET_TOTAL(state, payload) {
			state.progressTotal = payload;
		},

		SET_PROGRESS(state, payload) {
			state.progress = payload;
		},

		INC_ERROR(state) {
			state.progress += 1;
		},

		CREATE_CLUSTER(state) {
			state.clusters.push([]);
		},

		ADD_TO_CLUSTER(state, payload) {
			state.clusters[payload.index].push(payload.ifile);
		},
	},

	actions: {
		async startSearch({ commit, state }, batchGenerator) {
			console.time("searchTimer");
			commit("RESET");
			commit("SET_SEARCH_STATE", "search_init");

			const validFiles = [];
			let inputCount = 0;
			let lastTime = 0;
			let doCommit = false;

			for await (const batch of batchGenerator) {
				inputCount += batch.length;

				const now = performance.now();
				if (now - lastTime > 16) {
					lastTime = now;
					doCommit = true;
				} else {
					doCommit = false;
				}
				if (doCommit)
					commit("SET_INPUT_COUNT", inputCount);

				batch.forEach(file => {
					const ifile = new ImageFile(file);
					if (ifile.isValid()) {
						validFiles.push(ifile);
					}
				});
			}

			commit("SET_INPUT_COUNT", inputCount);

			console.log("Input files: " + state.inputCount);
			console.log("Valid files: " + validFiles.length);
			commit("SET_SEARCH_STATE", "search_running");

			let candidates = [];
			if (state.exactMatch && state.mustMatch !== null) {
				Array.from(validFiles).forEach(ifile => {
					if (ifile.file.size == state.mustMatch.size) {
						candidates.push(ifile);
					}
				});
			} else if (state.exactMatch) {
				// only examine images with non-unique file sizes
				const counts = {};
				Array.from(validFiles).forEach(ifile => {
					const val = ifile.file.size;
					counts[val] = (counts[val] || 0) + 1;
				});
				const uniqueSizes = new Set(Object.keys(counts).filter(key => counts[key] === 1));
				Array.from(validFiles).forEach(ifile => {
					if (!uniqueSizes.has(ifile.file.size)) {
						candidates.push(ifile);
					}
				});
			} else {
				candidates = validFiles;
			}

			console.log("Candidate files: " + candidates.length);
			commit("SET_TOTAL", candidates.length);

			const mustMatch = (state.mustMatch ? new ImageFile(state.mustMatch) : null);
			if (mustMatch) {
				mustMatch.clusterID = 0;
				await mustMatch.load(state.fastRead, state.exactMatch);
			}

			const scannedFiles = [];
			let progress = 0;
			lastTime = 0;
			doCommit = false;

			for (let i = 0; i < candidates.length; i++) {
				const now = performance.now();
				if (now - lastTime > 16) {
					lastTime = now;
					doCommit = true;
				} else {
					doCommit = false;
				}

				let ifile = candidates[i];

				if (mustMatch) {
					scannedFiles.push(mustMatch);
				}

				try {
					await ifile.load(state.fastRead, state.exactMatch)
					await State.pauseHandler.waitIfPaused();
					for (const ifile2 of scannedFiles) {
						if (ifile.isSimilar(ifile2, state.exactMatch)) {
							const i = ifile.clusterID;
							const j = ifile2.clusterID;

							if (mustMatch && state.clusters.length == 0) {
								commit("CREATE_CLUSTER");
								commit("ADD_TO_CLUSTER", {index:0, ifile:ifile});
								ifile.clusterID = 0;
							} else if (i === null && j === null) {
								ifile.clusterID = state.clusters.length;
								ifile2.clusterID = state.clusters.length;
								commit("CREATE_CLUSTER");
								commit("ADD_TO_CLUSTER", {index:state.clusters.length-1, ifile:ifile2});
								commit("ADD_TO_CLUSTER", {index:state.clusters.length-1, ifile:ifile});
							} else {
								commit("ADD_TO_CLUSTER", {index:j, ifile:ifile});
								ifile.clusterID = j;
							}
							break;
						}
					}
					if (!mustMatch) {
						scannedFiles.push(ifile);
					}
				} catch(err) {
					console.log("ERROR loading: " + ifile.relpath);
					console.log(err);
					commit("INC_ERROR");
				} finally {
					if (doCommit)
						commit("SET_PROGRESS", i);
				}
			}

			commit("SET_PROGRESS", candidates.length);
			commit("SET_SEARCH_STATE", "search_ended");
			console.timeEnd("searchTimer");
		}
	}
}
