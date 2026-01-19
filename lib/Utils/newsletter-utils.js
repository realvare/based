"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseNewsletterMessage = exports.parseNewsletterMetadata = void 0;
const WABinary_1 = require("../WABinary");
const generics_1 = require("./generics");
const parseNewsletterMetadata = (node) => {
    const newsletter = (0, WABinary_1.getBinaryNodeChild)(node, 'newsletter');
    const name = (0, WABinary_1.getBinaryNodeChild)(newsletter, 'name');
    const description = (0, WABinary_1.getBinaryNodeChild)(newsletter, 'description');
    const invite = (0, WABinary_1.getBinaryNodeChild)(newsletter, 'invite');
    const handle = (0, WABinary_1.getBinaryNodeChild)(newsletter, 'handle');
    const verification = (0, WABinary_1.getBinaryNodeChild)(newsletter, 'verification');
    const picture = (0, WABinary_1.getBinaryNodeChild)(newsletter, 'picture');
    const preview = (0, WABinary_1.getBinaryNodeChild)(newsletter, 'preview');
    const creationTime = (0, WABinary_1.getBinaryNodeChild)(newsletter, 'creation_time');
    const state = (0, WABinary_1.getBinaryNodeChild)(newsletter, 'state');
    const subscribers = (0, WABinary_1.getBinaryNodeChild)(newsletter, 'subscribers');
    const viewRole = (0, WABinary_1.getBinaryNodeChild)(newsletter, 'view_role');
    const subscribe = (0, WABinary_1.getBinaryNodeChild)(newsletter, 'subscribe');
    const muted = (0, WABinary_1.getBinaryNodeChild)(newsletter, 'mute');
    return {
        id: newsletter.attrs.id,
        name: name === null || name === void 0 ? void 0 : name.content.toString(),
        description: description === null || description === void 0 ? void 0 : description.content.toString(),
        inviteCode: invite === null || invite === void 0 ? void 0 : invite.content.toString(),
        handle: handle === null || handle === void 0 ? void 0 : handle.content.toString(),
        subscriberCount: +(subscribers === null || subscribers === void 0 ? void 0 : subscribers.content.toString()),
        verification: verification === null || verification === void 0 ? void 0 : verification.content.toString(),
        picture: picture === null || picture === void 0 ? void 0 : picture.content.toString(),
        preview: preview === null || preview === void 0 ? void 0 : preview.content.toString(),
        creationTime: +(creationTime === null || creationTime === void 0 ? void 0 : creationTime.content.toString()),
        muted: (muted === null || muted === void 0 ? void 0 : muted.content.toString()) === 'true',
        state: state === null || state === void 0 ? void 0 : state.content.toString(),
        viewRole: viewRole === null || viewRole === void 0 ? void 0 : viewRole.content.toString(),
        subscribe: subscribe === null || subscribe === void 0 ? void 0 : subscribe.content.toString(),
    };
};
exports.parseNewsletterMetadata = parseNewsletterMetadata;
const parseNewsletterMessage = (node) => {
    const message = (0, WABinary_1.getBinaryNodeChild)(node, 'message');
    const views = (0, WABinary_1.getBinaryNodeChild)(node, 'views');
    return {
        serverMsgId: +(node.attrs.server_id || 0),
        views: +(views === null || views === void 0 ? void 0 : views.content.toString()),
        message: (0, generics_1.normalizeMessageContent)(message),
    };
};
exports.parseNewsletterMessage = parseNewsletterMessage;
