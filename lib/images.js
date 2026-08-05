const fs = require("fs");
const Image = require("@11ty/eleventy-img").default;

function registerImages(eleventyConfig) {
	const imageOptions = {
		outputDir: "_build/assets/img",
		urlPath: "/assets/img",
		formats: ["webp"],
		cacheOptions: { duration: "365d", directory: ".cache/img" },
	};

	eleventyConfig.addShortcode("image", async function (src, alt, widths, sizes, opts = {}) {
		if (opts.gif) {
			return Image(src, {
				...imageOptions,
				widths: [750],
				returnType: "html",
				sharpOptions: { animated: true },
				sharpWebpOptions: { quality: 75, background: { r: 255, g: 255, b: 255, alpha: 1 } },
				htmlOptions: { imgAttributes: { alt, loading: "lazy", decoding: "async" } },
			});
		}
		return Image(src, {
			...imageOptions,
			widths: widths || [720, 1400],
			returnType: "html",
			sharpWebpOptions: { quality: 90 },
			htmlOptions: {
				imgAttributes: {
					alt,
					sizes: sizes || "(min-width: 720px) 720px, 1400px",
					loading: opts.eager ? "eager" : "lazy",
					decoding: "async",
					...(opts.eager ? { fetchpriority: "high" } : {}),
				},
			},
		});
	});

	eleventyConfig.on("eleventy.after", async () => {
		const ogDir = "_build/assets/img/og";
		if (!fs.existsSync(ogDir)) return;
		const sharp = require("sharp");
		for (const file of fs.readdirSync(ogDir)) {
			if (!file.endsWith(".jpg") && !file.endsWith(".jpeg")) continue;
			const full = `${ogDir}/${file}`;
			const tmp = `${full}.tmp`;
			await sharp(full).jpeg({ quality: 80, progressive: true }).toFile(tmp);
			fs.renameSync(tmp, full);
		}
	});
}

module.exports = { registerImages };
