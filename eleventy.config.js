// Import Modules
const fs = require("fs");
const path = require("path");
const { DateTime } = require("luxon");
const Image = require("@11ty/eleventy-img");
const YAML = require("yaml");
const CleanCSS = require("clean-css");
const matter = require("gray-matter");

module.exports.config = {
	templateFormats: ["html", "njk", "md"],
};

function readClippings() {
	const vaultDir = path.join(__dirname, "obsidian-vault");
	return fs.readdirSync(vaultDir)
		.filter(filename => filename.endsWith(".md"))
		.map(filename => {
			const raw = fs.readFileSync(path.join(vaultDir, filename), "utf8");
			const { data, content } = matter(raw);
			const tags = data.tags || [];
			const categoryTag = tags.find(tag => tag.startsWith("category/"));
			return {
				title: data.title,
				url: data.url,
				date: data.date,
				tags: tags.filter(tag => tag !== categoryTag),
				category: categoryTag ? categoryTag.split("/")[1] : "default",
				intro: content.trim(),
				quote: data.quote || null,
				embed: data.embed || null,
				embed_thumb: data.embed_thumb || null,
			};
		})
		.sort((a, b) => b.date - a.date);
}

module.exports = async function (eleventyConfig) {
eleventyConfig.ignores.add("source/snippets");

	eleventyConfig.addCollection("clippingsHome", () => readClippings().slice(0, 3));
	eleventyConfig.addCollection("clippingsNow", () => readClippings().slice(0, 10));

	eleventyConfig.addCollection("feedPosts", function (collectionApi) {
		return collectionApi.getAll()
			.filter(item => item.data.layout !== "product")
			.filter(item => item.inputPath.includes("/posts/"))
			.filter(item => !item.inputPath.includes("/posts/products/"))

			.sort((a, b) => b.date - a.date);
	});

	eleventyConfig.addTransform("addRefParam", function (content) {
		if (!this.page || !this.page.outputPath || !this.page.outputPath.endsWith(".html")) {
			return content;
		}
		const ownHost = "nogood.studio";
		return content.replace(/(<a\s+[^>]*?href=)"(https?:\/\/[^"]+)"/gi, (match, prefix, url) => {
			try {
				const parsed = new URL(url);
				if (parsed.hostname.replace(/^www\./, "") === ownHost) {
					return match;
				}
				parsed.searchParams.set("ref", "nogood.studio");
				return `${prefix}"${parsed.toString()}"`;
			} catch {
				return match;
			}
		});
	});

	eleventyConfig.addCollection("contextArticle", function (collectionApi) {
		return collectionApi.getFilteredByTag("contextArticle")
			.sort((a, b) => a.data.order - b.data.order);
	});

	// Add passthrough files
	eleventyConfig.addPassthroughCopy({ "source/CNAME": "CNAME" });
	eleventyConfig.addPassthroughCopy({ "source/.htaccess": ".htaccess" });
	// overlay data files
	eleventyConfig.addPassthroughCopy({ "source/overlay/names.txt": "overlay/names.txt" });
	// images outside of IMG plugin
	eleventyConfig.addPassthroughCopy({ "source/favicon.ico": "favicon.ico" });
	eleventyConfig.addPassthroughCopy({ "source/assets/img/favicon.svg": "assets/img/favicon.svg" });
	eleventyConfig.addPassthroughCopy("source/assets/img/NoGood_Logo.svg");
	eleventyConfig.addPassthroughCopy({ "source/assets/img/nogood_sign.png": "assets/img/nogood_sign.png" });
	eleventyConfig.addPassthroughCopy({ "source/assets/img/NoGood_OG.png": "assets/img/NoGood_OG.png" });
// css
	eleventyConfig.addPassthroughCopy("source/style.css");
	eleventyConfig.addPassthroughCopy({ "source/assets/css": "assets/css" });
	// js
	eleventyConfig.addPassthroughCopy({ "source/assets/js": "assets/js" });
	// fonts
	eleventyConfig.addPassthroughCopy({ "source/assets/fonts": "assets/fonts" });
	// icons
	eleventyConfig.addPassthroughCopy({ "source/assets/icons": "assets/icons" });
	// Snipcart images
	eleventyConfig.addPassthroughCopy({ "source/assets/img/shop/snipcart": "assets/img/shop/snipcart" });
	// Buttonwall images
	eleventyConfig.addPassthroughCopy({ "source/assets/img/buttonwall": "assets/img/buttonwall" });
	// OG images
	eleventyConfig.addPassthroughCopy({ "source/assets/img/og": "assets/img/og" });
	// Torrent files
	eleventyConfig.addPassthroughCopy({ "source/assets/downloads": "assets/downloads" });
	// GIFs (excluded from image plugin)
	eleventyConfig.addPassthroughCopy({ "source/assets/img/NG_Zap_Animation.gif": "assets/img/NG_Zap_Animation.gif" });
	// Videos
	eleventyConfig.addPassthroughCopy({ "source/assets/img/about-opener.mp4": "assets/img/about-opener.mp4" });
	eleventyConfig.addPassthroughCopy({ "source/assets/img/radio-bg.mp4": "assets/img/radio-bg.mp4" });
	eleventyConfig.addPassthroughCopy({ "source/assets/img/book-promo.mp4": "assets/img/book-promo.mp4" });
	eleventyConfig.addPassthroughCopy({ "source/assets/img/book/Book_Promo_Poster.jpg": "assets/img/book/Book_Promo_Poster.jpg" });
	eleventyConfig.addPassthroughCopy({ "source/assets/img/book/book-shoot.mp4": "assets/img/book/book-shoot.mp4" });
	// YAML
	eleventyConfig.addDataExtension("yaml", (contents) => YAML.parse(contents));


	// Exclude TAGs from loop - custom filter
	eleventyConfig.addNunjucksFilter("withoutTag", (items, tag) =>
		items.filter(i => !(i.data.tags || []).includes(tag))
	);

	// Add spacing to feed images
	eleventyConfig.addFilter("feedImageStyles", function (html) {
		return html.replace(/<picture>/g, '<p><picture>').replace(/<\/picture>/g, '</picture></p>');
	});

	// CSS Minify
	eleventyConfig.addFilter("cssmin", function (code) {
		return new CleanCSS({}).minify(code).styles;
	});

	// OG image compression — runs after build on _build/assets/img/og/
	eleventyConfig.on("eleventy.after", async () => {
		const fs = require("fs");
		const path = require("path");
		const sharp = require("sharp");
		const ogDir = "_build/assets/img/og";
		if (!fs.existsSync(ogDir)) return;
		for (const file of fs.readdirSync(ogDir)) {
			if (!file.endsWith(".jpg") && !file.endsWith(".jpeg")) continue;
			const full = path.join(ogDir, file);
			const tmp = full + ".tmp";
			await sharp(full).jpeg({ quality: 80, progressive: true }).toFile(tmp);
			fs.renameSync(tmp, full);
		}
	});


	const imageOptions = {
		outputDir: "_build/assets/img",
		urlPath: "/assets/img",
		formats: ["webp"],
		cacheOptions: { duration: "365d", directory: ".cache/img" },
	};

	// IMG shortcode
	eleventyConfig.addShortcode("image", async function (src, alt, widths = [720, 1400], sizes = "(min-width: 720px) 720px, 1400px") {
		return Image(src, {
			...imageOptions,
			widths,
			returnType: "html",
			sharpWebpOptions: { quality: 90 },
			htmlOptions: {
				imgAttributes: { alt, sizes, loading: "lazy", decoding: "async" }
			}
		});
	});

	eleventyConfig.addShortcode("imageFast", async function (src, alt, widths = [720, 1400], sizes = "(min-width: 720px) 720px, 1400px") {
		return Image(src, {
			...imageOptions,
			widths,
			returnType: "html",
			sharpWebpOptions: { quality: 90 },
			htmlOptions: {
				imgAttributes: { alt, sizes, loading: "eager", fetchpriority: "high", decoding: "async" }
			}
		});
	});

	// Animated GIF → WebP shortcode
	eleventyConfig.addShortcode("imageGif", async function (src, alt) {
		return Image(src, {
			...imageOptions,
			widths: [750],
			returnType: "html",
			sharpOptions: { animated: true },
			sharpWebpOptions: { quality: 75, background: { r: 255, g: 255, b: 255, alpha: 1 } },
			htmlOptions: {
				imgAttributes: { alt, loading: "lazy", decoding: "async" }
			}
		});
	});

	// Date filter
	eleventyConfig.addFilter("postDate", (dateObj) => {
		return DateTime.fromJSDate(dateObj, {
			zone: "Europe/Amsterdam",
		}).setLocale('en').toFormat("dd/MM/yyyy");
	});


	return {
		dir: {
			output: "_build",
			data: "_data",
			includes: "_includes",
			input: "source"
		}
	}
};