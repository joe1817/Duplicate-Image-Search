const App = {

	template: `
<SetupPage   v-show="setupPageVisible"></SetupPage>
<ResultsPage v-show="resultsPageVisible"></ResultsPage>
`,

	computed: {
		setupPageVisible() {
			return this.$store.state.searchStatus === "search_ready";
		},
		resultsPageVisible() {
			return this.$store.state.searchStatus !== "search_ready";
		},
	}
}
