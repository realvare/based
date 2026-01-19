"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeInteractiveSocket = void 0;
const WAProto_1 = require("../../WAProto");
const Utils_1 = require("../Utils");
const messages_send_1 = require("./messages-send");
const makeInteractiveSocket = (config) => {
    const sock = (0, messages_send_1.makeMessagesSocket)(config);
    const { ev, authState, relayMessage } = sock;
    
    /**
     * Send List Message (Native Implementation)
     * Modern interactive list with single_select support
     */
    const sendList = async (jid, buttonText, text, title, footer, sections, options = {}) => {
        const listMessage = {
            interactiveButtons: [{
                name: "single_select",
                buttonParamsJson: JSON.stringify({
                    title: buttonText,
                    sections: sections
                })
            }],
            text: text,
            title: title,
            footer: footer
        };
        
        const fullMsg = await (0, Utils_1.generateWAMessageContent)(listMessage, {
            ...config,
            logger: config.logger
        });
        
        return await relayMessage(jid, fullMsg.message, { 
            messageId: fullMsg.key.id, 
            ...options 
        });
    };
    
    /**
     * Send Button Message (Native Implementation)
     * Quick reply buttons with optional media
     */
    const sendButton = async (jid, text, buttons, options = {}) => {
        const buttonMessage = {
            text: text,
            footer: options.footer,
            buttons: buttons.map(btn => ({
                buttonId: btn.buttonId,
                buttonText: { displayText: btn.buttonText },
                type: 1
            })),
            headerType: options.headerType || 1,
            ...(options.image && { image: options.image }),
            ...(options.video && { video: options.video }),
            ...(options.document && { document: options.document })
        };
        
        const fullMsg = await (0, Utils_1.generateWAMessageContent)(buttonMessage, {
            ...config,
            logger: config.logger
        });
        
        return await relayMessage(jid, fullMsg.message, { 
            messageId: fullMsg.key.id, 
            ...options 
        });
    };
    
    /**
     * Send Carousel Message (Native Implementation)
     * Multiple interactive cards in one message
     */
    const sendCarousel = async (jid, cards, options = {}) => {
        const carouselMessage = {
            carousel: cards.map(card => ({
                body: card.body || { text: card.text || '' },
                footer: card.footer ? { text: card.footer } : undefined,
                header: {
                    title: card.title,
                    subtitle: card.subtitle,
                    hasMediaAttachment: !!card.media,
                    ...(card.media?.image && { 
                        imageMessage: card.media.image 
                    }),
                    ...(card.media?.video && { 
                        videoMessage: card.media.video 
                    })
                },
                nativeFlowMessage: card.buttons ? {
                    buttons: card.buttons.map(btn => ({
                        name: btn.name,
                        buttonParamsJson: btn.buttonParamsJson
                    })),
                    messageVersion: 1
                } : undefined
            })),
            text: options.text,
            footer: options.footer
        };
        
        const fullMsg = await (0, Utils_1.generateWAMessageContent)(carouselMessage, {
            ...config,
            logger: config.logger
        });
        
        return await relayMessage(jid, fullMsg.message, { 
            messageId: fullMsg.key.id, 
            ...options 
        });
    };
    
    /**
     * Send Interactive Template Message (Native Implementation)
     * For business templates and rich interactive content
     */
    const sendTemplate = async (jid, template, options = {}) => {
        const templateMessage = {
            interactiveButtons: [{
                name: "template_message",
                buttonParamsJson: JSON.stringify(template)
            }],
            text: template.text,
            title: template.title,
            footer: template.footer,
            ...(template.media && { media: template.media })
        };
        
        const fullMsg = await (0, Utils_1.generateWAMessageContent)(templateMessage, {
            ...config,
            logger: config.logger
        });
        
        return await relayMessage(jid, fullMsg.message, { 
            messageId: fullMsg.key.id, 
            ...options 
        });
    };
    
    /**
     * Send Collection Message (Native Implementation)
     * For product collections and business catalogs
     */
    const sendCollection = async (jid, collection, options = {}) => {
        const collectionMessage = {
            collection: {
                bizJid: collection.bizJid,
                id: collection.id,
                messageVersion: collection.messageVersion || 1
            },
            text: collection.text,
            title: collection.title,
            footer: collection.footer
        };
        
        const fullMsg = await (0, Utils_1.generateWAMessageContent)(collectionMessage, {
            ...config,
            logger: config.logger
        });
        
        return await relayMessage(jid, fullMsg.message, { 
            messageId: fullMsg.key.id, 
            ...options 
        });
    };
    
    /**
     * Send Shop Message (Native Implementation)
     * For business storefronts
     */
    const sendShop = async (jid, shop, options = {}) => {
        const shopMessage = {
            shop: {
                surface: shop.surface,
                id: shop.id
            },
            text: shop.text,
            title: shop.title,
            footer: shop.footer,
            ...(shop.media && { media: shop.media })
        };
        
        const fullMsg = await (0, Utils_1.generateWAMessageContent)(shopMessage, {
            ...config,
            logger: config.logger
        });
        
        return await relayMessage(jid, fullMsg.message, { 
            messageId: fullMsg.key.id, 
            ...options 
        });
    };
    
    /**
     * Send Poll Message (Native Implementation)
     * Enhanced poll with multiple options and configurations
     */
    const sendPoll = async (jid, poll, options = {}) => {
        const pollMessage = {
            poll: {
                name: poll.name,
                values: poll.options,
                selectableCount: poll.selectableCount || 1,
                toAnnouncementGroup: poll.toAnnouncementGroup || false,
                messageSecret: poll.messageSecret,
                ...(poll.pollType && { pollType: poll.pollType })
            }
        };
        
        const fullMsg = await (0, Utils_1.generateWAMessageContent)(pollMessage, {
            ...config,
            logger: config.logger
        });
        
        return await relayMessage(jid, fullMsg.message, { 
            messageId: fullMsg.key.id, 
            ...options 
        });
    };
    
    /**
     * Send Event Message (Native Implementation)
     * For event invitations and RSVPs
     */
    const sendEvent = async (jid, event, options = {}) => {
        const eventMessage = {
            event: {
                ...event,
                messageSecret: event.messageSecret
            }
        };
        
        const fullMsg = await (0, Utils_1.generateWAMessageContent)(eventMessage, {
            ...config,
            logger: config.logger
        });
        
        return await relayMessage(jid, fullMsg.message, { 
            messageId: fullMsg.key.id, 
            ...options 
        });
    };
    
    return {
        ...sock,
        sendList,
        sendButton,
        sendCarousel,
        sendTemplate,
        sendCollection,
        sendShop,
        sendPoll,
        sendEvent
    };
};
exports.makeInteractiveSocket = makeInteractiveSocket;
