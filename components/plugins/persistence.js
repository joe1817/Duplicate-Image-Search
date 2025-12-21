const persistence = (store) => {
	// initialize state from localStorage
	const saved = localStorage.getItem("dis.state") || "{}";
	store.replaceState({ ...store.state, ...JSON.parse(saved) });
	console.log("loaded state: " + saved);

	// listen for commits
	store.subscribe((mutation, state) => {
		const targets = ["SET_FAST_READ_STATE", "SET_EXACT_STATE"];
		if (targets.includes(mutation.type)) {
			const toSave = JSON.stringify({
				fastRead: state.fastRead,
				exactMatch: state.exactMatch,
			});
			localStorage.setItem("dis.state", toSave);
			console.log("saved state: " + toSave);
		}
	});
};
