// Import Modules
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DateTime } = require("luxon");
const Image = require("@11ty/eleventy-img");
const YAML = require("yaml");
const CleanCSS = require("clean-css");
const matter = require("gray-matter");

module.exports.config = {
	templateFormats: ["html", "njk", "md"],
};

const THUMB_DIR = path.join(__dirname, "source/assets/img/clippings");

function youtubeId(url) {
	if (!url) return null;
	const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([^?&/]+)/);
	return m ? m[1] : null;
}

function categoryFromUrl(url) {
	try {
		const h = new URL(url).hostname.replace(/^www\./, '');
		if (h === 'youtube.com' || h === 'youtu.be') return 'video';
		if (h === 'fountain.fm') return 'podcast';
		if (h === 'bookshop.org' || h.endsWith('.bookshop.org')) return 'book';
	} catch {}
	return null;
}

// Bookshop.org's own image CDN sits behind a Cloudflare bot challenge and can't be
// fetched server-side, so for book covers we use the ISBN in the URL (?ean=...) to
// pull the cover from Open Library instead, which is unblocked.
function isbnCoverFromUrl(url) {
	try {
		const ean = new URL(url).searchParams.get('ean');
		return /^\d{10,13}$/.test(ean) ? `https://covers.openlibrary.org/b/isbn/${ean}-L.jpg` : null;
	} catch {}
	return null;
}

async function fetchCover(coverUrl, clippingUrl) {
	const hash = crypto.createHash('md5').update(clippingUrl).digest('hex');
	const ext = coverUrl.match(/\.(png|webp|jpg|jpeg)(\?|$)/i)?.[1] || 'jpg';
	const dest = path.join(THUMB_DIR, `${hash}.${ext}`);
	if (fs.existsSync(dest)) return `/assets/img/clippings/${hash}.${ext}`;
	fs.mkdirSync(THUMB_DIR, { recursive: true });
	try {
		const res = await fetch(coverUrl);
		if (res.ok) {
			fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
			return `/assets/img/clippings/${hash}.${ext}`;
		}
	} catch {}
	return null;
}

async function fetchThumb(videoId) {
	const dest = path.join(THUMB_DIR, `${videoId}.jpg`);
	if (fs.existsSync(dest)) return `/assets/img/clippings/${videoId}.jpg`;
	fs.mkdirSync(THUMB_DIR, { recursive: true });
	for (const quality of ["maxresdefault", "hqdefault"]) {
		const res = await fetch(`https://i.ytimg.com/vi/${videoId}/${quality}.jpg`);
		if (res.ok) {
			fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
			return `/assets/img/clippings/${videoId}.jpg`;
		}
	}
	return null;
}

let clippingsPromise = null;

async function readClippings() {
	if (clippingsPromise) return clippingsPromise;
	clippingsPromise = (async () => {
		const vaultDir = path.join(__dirname, "obsidian-vault");
		const items = await Promise.all(
			fs.readdirSync(vaultDir)
				.filter(filename => filename.endsWith(".md"))
				.map(async filename => {
					const raw = fs.readFileSync(path.join(vaultDir, filename), "utf8");
					const { data, content } = matter(raw);
					const tags = data.tags || [];
					const categoryTag = tags[0] || null;
					const videoId = youtubeId(data.url) || youtubeId(data.embed);
					const embed = data.embed || (videoId ? `https://www.youtube.com/embed/${videoId}` : null);
					let embedThumb = data.embed_thumb || null;
					if (!embedThumb && videoId) embedThumb = await fetchThumb(videoId);
					let cover = null;
					const isbnCover = categoryFromUrl(data.url) === 'book' ? isbnCoverFromUrl(data.url) : null;
					if (isbnCover) {
						cover = await fetchCover(isbnCover, data.url);
					}
					if (!cover && data.cover) {
						cover = await fetchCover(data.cover, data.url);
					}
					const show = data.show || null;
					const episode = (show && data.title.includes(' • '))
						? data.title.split(' • ').slice(1).join(' • ')
						: data.title;
					let domain = null;
					try {
						domain = new URL(data.url).hostname.replace(/^www\./, '');
						if (domain.endsWith('bookshop.org')) domain = 'bookshop.org';
					} catch {}
					return {
						title: data.title,
						episode,
						show,
						domain,
						url: data.url,
						date: data.date,
						renderAs: categoryFromUrl(data.url) || 'default',
						category: categoryTag,
						intro: content.trim(),
						quote: data.quote || null,
						embed: embed,
						embed_thumb: embedThumb,
						cover,
						author: data.author || null,
						pages: data.pages || null,
						bookGenre: data.bookGenre || null,
					};
				})
		);
		return items.sort((a, b) => b.date - a.date);
	})();
	return clippingsPromise;
}

module.exports = async function (eleventyConfig) {
eleventyConfig.ignores.add("source/snippets");

	eleventyConfig.on("eleventy.before", async () => { await readClippings(); });

	eleventyConfig.addCollection("clippingsHome", async () => (await readClippings()).slice(0, 5));
	eleventyConfig.addCollection("clippingsNow", async () => (await readClippings()).slice(0, 10));
	eleventyConfig.addCollection("clippingsAll", async () => await readClippings());

	eleventyConfig.addCollection("feedPosts", function (collectionApi) {
		return collectionApi.getAll()
			.filter(item => item.data.layout !== "product")
			.filter(item => item.inputPath.includes("/posts/"))
			.filter(item => !item.inputPath.includes("/posts/products/"))
			.filter(item => !item.data.unlisted)

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
	// Auto-downloaded clipping thumbnails
	eleventyConfig.addPassthroughCopy({ "source/assets/img/clippings": "assets/img/clippings" });
	// GIFs (excluded from image plugin)
	eleventyConfig.addPassthroughCopy({ "source/assets/img/NG_Zap_Animation.gif": "assets/img/NG_Zap_Animation.gif" });
	eleventyConfig.addPassthroughCopy({ "source/assets/img/NG_Block_Animation.gif": "assets/img/NG_Block_Animation.gif" });
	// Videos
	eleventyConfig.addPassthroughCopy({ "source/assets/img/about-opener.mp4": "assets/img/about-opener.mp4" });
	eleventyConfig.addPassthroughCopy({ "source/assets/img/radio-bg.mp4": "assets/img/radio-bg.mp4" });
	eleventyConfig.addPassthroughCopy({ "source/assets/img/book-promo.mp4": "assets/img/book-promo.mp4" });
	eleventyConfig.addPassthroughCopy({ "source/assets/img/book/Book_Promo_Poster.jpg": "assets/img/book/Book_Promo_Poster.jpg" });
	eleventyConfig.addPassthroughCopy({ "source/assets/img/book/book-shoot.mp4": "assets/img/book/book-shoot.mp4" });
	eleventyConfig.addPassthroughCopy({ "source/assets/img/book/NG_Shoot_Book_Cover.jpg": "assets/img/book/NG_Shoot_Book_Cover.jpg" });
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

	// IMG shortcode — pass { eager: true } for above-the-fold images, { gif: true } for animated GIF → WebP
	eleventyConfig.addShortcode("image", async function (src, alt, widths, sizes, opts = {}) {
		if (opts.gif) {
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
					...(opts.eager ? { fetchpriority: "high" } : {})
				}
			}
		});
	});

	// Date filter
	eleventyConfig.addFilter("postDate", (dateObj) => {
		const dt = dateObj instanceof Date
			? DateTime.fromJSDate(dateObj, { zone: "Europe/Amsterdam" })
			: DateTime.fromISO(String(dateObj), { zone: "Europe/Amsterdam" });
		return dt.setLocale('en').toFormat("dd/MM/yyyy");
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