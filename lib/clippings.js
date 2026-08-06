const fs = require("fs");
const path = require("path");
const Image = require("@11ty/eleventy-img").default;
const matter = require("gray-matter");

function createClippings(rootDir) {
	const imageOptions = {
		outputDir: path.join(rootDir, "_build/assets/img/clippings"),
		urlPath: "/assets/img/clippings",
		formats: ["webp"],
		widths: [800],
		cacheOptions: { duration: "365d", directory: ".cache/img" },
		sharpWebpOptions: { quality: 85 },
	};

	async function processImage(url) {
		if (!url) return null;
		try {
			const stats = await Image(url, imageOptions);
			const image = (stats.webp || stats.jpeg || stats.png)?.[0];
			return image ? { url: image.url, width: image.width, height: image.height } : null;
		} catch {
			return null;
		}
	}

	async function fetchThumb(videoId) {
		for (const quality of ["maxresdefault", "hqdefault"]) {
			const image = await processImage(`https://i.ytimg.com/vi/${videoId}/${quality}.jpg`);
			if (image) return image.url;
		}
		return null;
	}

	let clippingsPromise = null;
	async function read() {
		if (clippingsPromise) return clippingsPromise;
		clippingsPromise = (async () => {
			const vaultDir = path.join(rootDir, "clippings");
			const items = await Promise.all(
				fs.readdirSync(vaultDir)
					.filter(filename => filename.endsWith(".md"))
					.map(filename => readItem(path.join(vaultDir, filename)))
			);
			return items.sort((a, b) => b.date - a.date);
		})();
		return clippingsPromise;
	}

	async function readItem(file) {
		const { data, content } = matter(fs.readFileSync(file, "utf8"));
		const videoId = youtubeId(data.url) || youtubeId(data.embed);
		const embed = data.embed || (videoId ? `https://www.youtube.com/embed/${videoId}` : null);
		let embedThumb = data.embed_thumb || null;
		if (!embedThumb && videoId) embedThumb = await fetchThumb(videoId);

		let cover = null;
		const isbnCover = categoryFromUrl(data.url) === "book" ? isbnCoverFromUrl(data.url) : null;
		if (isbnCover) cover = await processImage(isbnCover);
		if (!cover && data.cover) cover = await processImage(data.cover);

		const show = data.show || null;
		return {
			title: data.title,
			episode: show && data.title.includes(" • ") ? data.title.split(" • ").slice(1).join(" • ") : data.title,
			show,
			domain: domainFromUrl(data.url),
			url: data.url,
			date: data.date,
			renderAs: categoryFromUrl(data.url) || "default",
			category: (data.tags || [])[0] || null,
			intro: content.trim(),
			quote: data.quote || null,
			embed,
			embed_thumb: embedThumb,
			cover,
			author: data.author || null,
			pages: data.pages || null,
			bookGenre: data.bookGenre || null,
			book_media: data.book_media || false,
		};
	}

	return { read };
}

function youtubeId(url) {
	if (!url) return null;
	const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([^?&/]+)/);
	return match ? match[1] : null;
}

function categoryFromUrl(url) {
	try {
		const hostname = new URL(url).hostname.replace(/^www\./, "");
		if (hostname === "youtube.com" || hostname === "youtu.be") return "video";
		if (hostname === "fountain.fm") return "podcast";
		if (hostname === "bookshop.org" || hostname.endsWith(".bookshop.org")) return "book";
	} catch {}
	return null;
}

function isbnCoverFromUrl(url) {
	try {
		const ean = new URL(url).searchParams.get("ean");
		return /^\d{10,13}$/.test(ean) ? `https://covers.openlibrary.org/b/isbn/${ean}-L.jpg` : null;
	} catch {}
	return null;
}

function domainFromUrl(url) {
	try {
		const hostname = new URL(url).hostname.replace(/^www\./, "");
		return hostname.endsWith("bookshop.org") ? "bookshop.org" : hostname;
	} catch {}
	return null;
}

module.exports = { createClippings };
