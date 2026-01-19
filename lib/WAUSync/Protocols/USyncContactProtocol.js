"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.USyncContactProtocol = void 0;
const WABinary_1 = require("../../WABinary");
class USyncContactProtocol {
    constructor() {
        this.name = 'contact';
    }
    getQueryElement() {
        return {
            tag: 'contact',
            attrs: {},
        };
    }
    getUserElement(user) {
        const attrs = {};
        const content = [];
        
        // Add type field if specified
        if (user.type) {
            attrs.type = user.type;
        }
        
        // Add username field if specified
        if (user.username) {
            attrs.username = user.username;
        }
        
        // Add phone number as content if available
        if (user.phone) {
            content.push({
                tag: 'phone',
                attrs: {},
                content: user.phone
            });
        }
        
        // Add business details if available
        if (user.business) {
            content.push({
                tag: 'business',
                attrs: {
                    description: user.business.description || '',
                    category: user.business.category || '',
                    website: user.business.website || ''
                }
            });
        }
        
        // Add push name if available
        if (user.pushName) {
            content.push({
                tag: 'pushname',
                attrs: {},
                content: user.pushName
            });
        }
        
        return {
            tag: 'contact',
            attrs,
            content: content.length > 0 ? content : user.phone
        };
    }
    parser(node) {
        var _a, _b;
        if (node.tag === 'contact') {
            (0, WABinary_1.assertNodeErrorFree)(node);
            
            const result = {
                type: ((_a = node === null || node === void 0 ? void 0 : node.attrs) === null || _a === void 0 ? void 0 : _a.type) || 'unknown',
                username: ((_b = node === null || node === void 0 ? void 0 : node.attrs) === null || _b === void 0 ? void 0 : _b.username) || null,
                isInContact: ((_a = node === null || node === void 0 ? void 0 : node.attrs) === null || _a === void 0 ? void 0 : _a.type) === 'in'
            };
            
            // Parse content for additional contact information
            if (Array.isArray(node.content)) {
                for (const contentNode of node.content) {
                    switch (contentNode.tag) {
                        case 'phone':
                            result.phone = contentNode.content;
                            break;
                        case 'pushname':
                            result.pushName = contentNode.content;
                            break;
                        case 'business':
                            result.business = {
                                description: contentNode.attrs.description || '',
                                category: contentNode.attrs.category || '',
                                website: contentNode.attrs.website || ''
                            };
                            break;
                    }
                }
            }
            
            return result;
        }
        return false;
    }
}
exports.USyncContactProtocol = USyncContactProtocol;
