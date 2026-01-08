const app = Vue.createApp(App);

app.component("SetupPage", SetupPage);
app.component("ResultsPage", ResultsPage);
app.component("Cluster", Cluster);
app.component("Thumbnail", Thumbnail);
app.component("ScrollToTop", ScrollToTop);

const { createStore } = Vuex;
const store = createStore(State);

app.use(store);

document.addEventListener("DOMContentLoaded", () => {
	app.mount("#app-main");
});
