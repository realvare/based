"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUrlInfo = void 0;
const messages_1 = require("./messages");
const messages_media_1 = require("./messages-media");
const THUMBNAIL_WIDTH_PX = 1200;
/** Fetches an image and generates a thumbnail for it */
const getCompressedJpegThumbnail = async (url, { thumbnailWidth, fetchOpts, logger }) => {
    try {
        const stream = await (0, messages_media_1.getHttpStream)(url, fetchOpts);
        const result = await (0, messages_media_1.extractImageThumb)(stream, thumbnailWidth);
        logger?.debug({ url, thumbnailWidth }, 'Successfully generated compressed JPEG thumbnail');
        return result;
    } catch (error) {
        logger?.warn({ url, thumbnailWidth, error: error.message }, 'Failed to generate compressed JPEG thumbnail, attempting fallback');
        // Fallback to lower quality if high quality fails
        try {
            const stream = await (0, messages_media_1.getHttpStream)(url, fetchOpts);
            const result = await (0, messages_media_1.extractImageThumb)(stream, Math.min(thumbnailWidth, 512));
            logger?.debug({ url, fallbackWidth: Math.min(thumbnailWidth, 512) }, 'Successfully generated fallback thumbnail');
            return result;
        } catch (fallbackError) {
            logger?.error({ url, error: fallbackError.message }, 'Failed to generate fallback thumbnail');
            throw fallbackError;
        }
    }
};
/**
 * Given a piece of text, checks for any URL present, generates link preview for the same and returns it
 * Return undefined if the fetch failed or no URL was found
 * @param text first matched URL in text
 * @returns the URL info required to generate link preview
 */
const getUrlInfo = async (text, opts = {
    thumbnailWidth: THUMBNAIL_WIDTH_PX,
    fetchOpts: { timeout: 3000 }
}) => {
    var _a;
    try {
        const { unfurl } = await Promise.resolve().then(() => __importStar(require('unfurl.js')));
        let previewLink = text;
        if (!text.startsWith('https://') && !text.startsWith('http://')) {
            previewLink = 'https://' + previewLink;
        }
        const requestHeaders = (() => {
            const headers = opts.fetchOpts?.headers;
            if (!headers || typeof headers !== 'object') {
                return undefined;
            }
            const out = {};
            for (const [key, value] of Object.entries(headers)) {
                if (typeof value === 'undefined' || value === null) {
                    continue;
                }
                if (Array.isArray(value)) {
                    out[key] = value.map(v => v.toString()).join(', ');
                }
                else {
                    out[key] = value.toString();
                }
            }
            return out;
        })();
        const info = await unfurl(previewLink, {
            timeout: opts.fetchOpts?.timeout,
            headers: requestHeaders,
            follow: 5
        });
        const title = info?.title || info?.open_graph?.title || info?.twitter_card?.title;
        if (title) {
            const images = [];
            if (info?.open_graph?.images?.length) {
                images.push(...info.open_graph.images.map(img => img === null || img === void 0 ? void 0 : img.url).filter(Boolean));
            }
            if (info?.twitter_card?.images?.length) {
                images.push(...info.twitter_card.images.map(img => img === null || img === void 0 ? void 0 : img.url).filter(Boolean));
            }
            const [image] = images;
            const description = info?.description || info?.open_graph?.description || info?.twitter_card?.description;
            const canonicalUrl = info?.canonical_url || info?.open_graph?.url || previewLink;
            opts.logger?.debug({ url: previewLink, title, imageCount: images.length }, 'Fetched link preview info');
            const urlInfo = {
                'canonical-url': canonicalUrl,
                'matched-text': text,
                title,
                description,
                originalThumbnailUrl: image
            };
            if (opts.uploadImage && image) {
                const { imageMessage } = await (0, messages_1.prepareWAMessageMedia)({ image: { url: image } }, {
                    upload: opts.uploadImage,
                    mediaTypeOverride: 'thumbnail-link',
                    options: opts.fetchOpts
                });
                urlInfo.jpegThumbnail = (imageMessage === null || imageMessage === void 0 ? void 0 : imageMessage.jpegThumbnail)
                    ? Buffer.from(imageMessage.jpegThumbnail)
                    : undefined;
                urlInfo.highQualityThumbnail = imageMessage || undefined;
            }
            else {
                try {
                    urlInfo.jpegThumbnail = image
                        ? (await getCompressedJpegThumbnail(image, { ...opts, logger: opts.logger })).buffer
                        : undefined;
                }
                catch (error) {
                    (_a = opts.logger) === null || _a === void 0 ? void 0 : _a.debug({ err: error.stack, url: previewLink }, 'error in generating thumbnail');
                }
            }
            return urlInfo;
        }
    }
    catch (error) {
        if (!error.message.includes('receive a valid') && !error.message.includes('Invalid URL')) {
            throw error;
        }
    }
};
exports.getUrlInfo = getUrlInfo;
