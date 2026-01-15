self.onmessage = async (e) => {
	try {
		const { id, blob, width, height } = e.data;

		const bitmap = await createImageBitmap(blob, {
			resizeWidth: width,
			resizeHeight: height,
			resizeQuality: "low"
		});

		self.postMessage({ id:id, bitmap: bitmap }, [bitmap]);

	} catch (err) {
		self.postMessage({ error: err.message });
	}
};
