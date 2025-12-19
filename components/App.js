const Config = {
	maxFileSize         : 20*1024*1024,
	thumbnailQuality    : 0.6,
	thumbnailMaxDim     : 160,
	thumbnailOversample : 2,
};

const App = {

	template: `
<SetupPage   v-show="setupPageVisible"></SetupPage>
<ResultsPage v-show="resultsPageVisible"></ResultsPage>
`,

	computed: {
		setupPageVisible() {
			return this.$store.state.searchStatus == "search_pending" || this.$store.state.searchStatus == "search_init";
		},
		resultsPageVisible() {
			return this.$store.state.searchStatus != "search_pending" && this.$store.state.searchStatus != "search_init";
		},
	}
}
